/**
 * Raider Tools Auth Stack
 *
 * Provisions everything needed for phase 1 of the user-account rollout:
 * - Amazon Cognito User Pool (email + password, plus a Discord-bridged
 *   passwordless flow via custom auth Lambda triggers).
 * - A single DynamoDB table (`raider-tools-users`) for profiles, IdP
 *   mappings, and envelope-encrypted "linked account" tokens.
 * - A customer-managed KMS key used to envelope-encrypt the per-user
 *   ArcTracker (and later Embark) tokens stored in DynamoDB.
 * - A Secrets Manager secret holding the Discord OAuth client id/secret
 *   and a state-signing key (populated manually post-deploy).
 * - Lambdas: Discord OAuth bridge, profile, link management, and the
 *   three Cognito custom-auth triggers.
 * - New routes added to the *existing* HTTP API (passed in from the relay
 *   stack), gated by a JWT authorizer bound to the Cognito user pool.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";

export interface RaiderToolsAuthStackProps extends cdk.StackProps {
    /**
     * The HTTP API created by the relay stack. New auth/me routes are
     * added here so everything stays under the same custom domain.
     */
    httpApi: apigwv2.HttpApi;

    /**
     * Public origin of the SPA (used for redirect-back after Discord login
     * and for CORS validation in user-facing Lambdas).
     * @example "https://raider-tools.app"
     */
    spaOrigin: string;

    /**
     * Public origin of the API (used to compute the Discord redirect URI).
     * @example "https://api.raider-tools.app"
     */
    apiOrigin: string;

    /**
     * Allowed SPA origins for CORS / return-URL validation.
     */
    allowedOrigins: string[];

    /**
     * Base URL of the ArcTracker relay used by the LinksFn to validate a
     * newly-submitted ArcTracker token before persisting it encrypted.
     * @example "https://api.raider-tools.app/arctracker"
     */
    arctrackerRelayUrl: string;

    /**
     * Name of the Secrets Manager secret holding Discord OAuth credentials.
     * Created by this stack with an empty placeholder; the real value is
     * filled in via `aws secretsmanager put-secret-value` post-deploy.
     */
    discordSecretName: string;

    /**
     * Apex hosted zone domain used to create the Route53 alias record for
     * the Cognito custom domain.
     * @example "raider-tools.app"
     */
    rootDomainName: string;

    /**
     * Hosted zone id for `rootDomainName`.
     */
    hostedZoneId: string;

    /**
     * Fully-qualified hostname to expose Cognito on.
     * @example "auth.raider-tools.app"
     */
    authDomainName: string;

    /**
     * us-east-1 ACM certificate for `authDomainName`. Imported from the
     * companion `RaiderToolsAuthCertStack` via cross-region references.
     */
    authCertificate: acm.ICertificate;
}

export class RaiderToolsAuthStack extends cdk.Stack {
    public readonly userPool: cognito.UserPool;
    public readonly userPoolClient: cognito.UserPoolClient;
    public readonly userTable: dynamodb.TableV2;
    public readonly kmsKey: kms.Key;

    constructor(scope: Construct, id: string, props: RaiderToolsAuthStackProps) {
        super(scope, id, props);

        // -----------------------------------------------------------------
        // KMS customer-managed key for envelope encryption of user tokens.
        // -----------------------------------------------------------------
        this.kmsKey = new kms.Key(this, "UserSecretsKey", {
            alias: "alias/raider-tools/user-secrets",
            description: "Envelope-encryption key for raider-tools user-linked tokens",
            enableKeyRotation: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // -----------------------------------------------------------------
        // DynamoDB single-table for users + links + IdP mappings.
        //   pk = USER#<sub>     sk = PROFILE | LINK#<provider>
        //   pk = IDP#<provider>#<externalId>  sk = USER (lookup by IdP id)
        //   pk = NONCE#<id>     sk = NONCE (single-use, TTL evicted)
        // -----------------------------------------------------------------
        this.userTable = new dynamodb.TableV2(this, "UserTable", {
            tableName: "raider-tools-users",
            partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
            timeToLiveAttribute: "ttl",
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            encryption: dynamodb.TableEncryptionV2.customerManagedKey(this.kmsKey),
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // -----------------------------------------------------------------
        // Discord OAuth secret (placeholder; populated post-deploy).
        // Shape: { "clientId":"...", "clientSecret":"...", "stateSigningKey":"<base64>" }
        // -----------------------------------------------------------------
        const discordSecret = new secretsmanager.Secret(this, "DiscordOAuthSecret", {
            secretName: props.discordSecretName,
            description: "Discord OAuth client credentials + HMAC state-signing key",
            secretObjectValue: {
                clientId: cdk.SecretValue.unsafePlainText("PLACEHOLDER"),
                clientSecret: cdk.SecretValue.unsafePlainText("PLACEHOLDER"),
                stateSigningKey: cdk.SecretValue.unsafePlainText("PLACEHOLDER"),
            },
        });

        // -----------------------------------------------------------------
        // Cognito custom-auth triggers (used by the Discord bridge to log
        // an existing or freshly-created user in without a password).
        // -----------------------------------------------------------------
        const defineAuthFn = this.makeLambda("DefineAuthFn", "cognito-define-auth.ts", {
            timeout: cdk.Duration.seconds(5),
            memorySize: 128,
        });
        const createAuthFn = this.makeLambda("CreateAuthFn", "cognito-create-auth.ts", {
            timeout: cdk.Duration.seconds(5),
            memorySize: 128,
        });
        const verifyAuthFn = this.makeLambda("VerifyAuthFn", "cognito-verify-auth.ts", {
            timeout: cdk.Duration.seconds(5),
            memorySize: 256,
            environment: {
                DISCORD_SECRET_ARN: discordSecret.secretArn,
                USER_TABLE_NAME: this.userTable.tableName,
            },
        });
        discordSecret.grantRead(verifyAuthFn);
        this.userTable.grantReadWriteData(verifyAuthFn);

        // -----------------------------------------------------------------
        // Cognito user pool (email + password baseline).
        // -----------------------------------------------------------------
        this.userPool = new cognito.UserPool(this, "UserPool", {
            userPoolName: "raider-tools-users",
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            standardAttributes: {
                email: { required: true, mutable: false },
            },
            customAttributes: {
                discord_id: new cognito.StringAttribute({ mutable: true }),
            },
            passwordPolicy: {
                minLength: 10,
                requireDigits: true,
                requireLowercase: true,
                requireUppercase: false,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lambdaTriggers: {
                defineAuthChallenge: defineAuthFn,
                createAuthChallenge: createAuthFn,
                verifyAuthChallengeResponse: verifyAuthFn,
            },
        });

        // Custom Cognito hosted domain (e.g. auth.raider-tools.app), backed
        // by the cross-region us-east-1 ACM certificate.
        const userPoolDomain = this.userPool.addDomain("UserPoolDomain", {
            customDomain: {
                domainName: props.authDomainName,
                certificate: props.authCertificate,
            },
        });

        // Route53 alias auth.raider-tools.app -> Cognito CloudFront target.
        const zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
            hostedZoneId: props.hostedZoneId,
            zoneName: props.rootDomainName,
        });
        new route53.ARecord(this, "AuthAliasRecord", {
            zone,
            recordName: props.authDomainName,
            target: route53.RecordTarget.fromAlias(
                new route53Targets.UserPoolDomainTarget(userPoolDomain),
            ),
        });

        this.userPoolClient = this.userPool.addClient("SpaClient", {
            userPoolClientName: "raider-tools-spa",
            authFlows: {
                userSrp: true,
                custom: true,
            },
            preventUserExistenceErrors: true,
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            refreshTokenValidity: cdk.Duration.days(30),
            // No OAuth callback URLs in phase 1 because the SPA does not
            // use the hosted UI; sign-in goes through Cognito JS directly.
        });

        // -----------------------------------------------------------------
        // Discord OAuth bridge Lambda (no JWT auth on its routes).
        // -----------------------------------------------------------------
        const discordAuthFn = this.makeLambda("DiscordAuthFn", "discord-auth.ts", {
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            environment: {
                DISCORD_SECRET_ARN: discordSecret.secretArn,
                USER_TABLE_NAME: this.userTable.tableName,
                USER_POOL_ID: this.userPool.userPoolId,
                USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
                SPA_ORIGIN: props.spaOrigin,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                DISCORD_REDIRECT_URI: `${props.apiOrigin}/auth/discord/callback`,
            },
        });
        discordSecret.grantRead(discordAuthFn);
        this.userTable.grantReadWriteData(discordAuthFn);
        discordAuthFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminInitiateAuth",
                "cognito-idp:AdminRespondToAuthChallenge",
                "cognito-idp:AdminSetUserPassword",
                "cognito-idp:AdminUpdateUserAttributes",
            ],
            resources: [this.userPool.userPoolArn],
        }));

        // -----------------------------------------------------------------
        // ProfileFn + LinksFn (JWT-protected).
        // -----------------------------------------------------------------
        const profileFn = this.makeLambda("ProfileFn", "profile.ts", {
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
            },
        });
        this.userTable.grantReadWriteData(profileFn);

        const linksFn = this.makeLambda("LinksFn", "links.ts", {
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                KMS_KEY_ID: this.kmsKey.keyId,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                ARCTRACKER_RELAY_URL: props.arctrackerRelayUrl,
            },
        });
        this.userTable.grantReadWriteData(linksFn);
        this.kmsKey.grantEncryptDecrypt(linksFn);

        // -----------------------------------------------------------------
        // Routes on the existing HTTP API.
        // -----------------------------------------------------------------
        const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
            "CognitoJwtAuthorizer",
            `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
            {
                identitySource: ["$request.header.Authorization"],
                jwtAudience: [this.userPoolClient.userPoolClientId],
            }
        );

        const discordIntegration = new integrations.HttpLambdaIntegration(
            "DiscordIntegration", discordAuthFn,
        );
        props.httpApi.addRoutes({
            path: "/auth/discord/start",
            methods: [apigwv2.HttpMethod.GET],
            integration: discordIntegration,
        });
        props.httpApi.addRoutes({
            path: "/auth/discord/callback",
            methods: [apigwv2.HttpMethod.GET],
            integration: discordIntegration,
        });

        const profileIntegration = new integrations.HttpLambdaIntegration(
            "ProfileIntegration", profileFn,
        );
        props.httpApi.addRoutes({
            path: "/me",
            methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
            integration: profileIntegration,
            authorizer: jwtAuthorizer,
        });

        const linksIntegration = new integrations.HttpLambdaIntegration(
            "LinksIntegration", linksFn,
        );
        props.httpApi.addRoutes({
            path: "/me/links/{provider}",
            methods: [
                apigwv2.HttpMethod.GET,
                apigwv2.HttpMethod.PUT,
                apigwv2.HttpMethod.DELETE,
            ],
            integration: linksIntegration,
            authorizer: jwtAuthorizer,
        });

        // -----------------------------------------------------------------
        // Outputs.
        // -----------------------------------------------------------------
        new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
        new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
        new cdk.CfnOutput(this, "UserPoolDomainBaseUrl", { value: userPoolDomain.baseUrl() });
        new cdk.CfnOutput(this, "UserTableName", { value: this.userTable.tableName });
        new cdk.CfnOutput(this, "UserSecretsKeyArn", { value: this.kmsKey.keyArn });
        new cdk.CfnOutput(this, "DiscordCallbackUrl", { value: `${props.apiOrigin}/auth/discord/callback` });
    }

    /**
     * Small helper to keep all auth-stack Lambdas configured uniformly.
     */
    private makeLambda(
        id: string,
        entry: string,
        opts: {
            timeout: cdk.Duration;
            memorySize: number;
            environment?: Record<string, string>;
        },
    ): nodeLambda.NodejsFunction {
        return new nodeLambda.NodejsFunction(this, id, {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: `lambda/${entry}`,
            handler: "handler",
            memorySize: opts.memorySize,
            timeout: opts.timeout,
            environment: opts.environment,
            bundling: {
                minify: true,
                sourceMap: true,
                target: "node22",
            },
        });
    }
}
