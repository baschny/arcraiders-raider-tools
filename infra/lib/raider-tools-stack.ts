/**
 * Raider Tools Infrastructure Stack
 *
 * Single eu-central-1 stack that owns everything behind
 * `api.raider-tools.app` and the `auth.raider-tools.app` Cognito domain:
 *   - HTTP API (API Gateway v2) + ACM cert + Route53 alias.
 *   - ArcTracker relay Lambda.
 *   - Schedule reader/updater Lambdas + versioned S3 bucket + hourly
 *     EventBridge rule.
 *   - Cognito User Pool (email + Discord-bridged passwordless flow) with
 *     a custom domain using the us-east-1 ACM cert imported from
 *     RaiderToolsAuthCertStack.
 *   - DynamoDB single-table for users, KMS CMK for envelope-encrypted
 *     linked-account tokens, Secrets Manager entry for Discord OAuth.
 *   - Discord OAuth bridge Lambda + profile / links / state Lambdas.
 *   - JWT-protected `/me`, `/me/links/*`, `/me/arctracker/*`,
 *     `/me/state/*`, `/me/migrate` routes and the unauthenticated
 *     `/auth/discord/*`, `/schedule/*` routes.
 *
 * This stack replaces the previous `RaiderToolsArcRelayStack` +
 * `RaiderToolsAuthStack` split. That split was purely thematic and caused
 * a silent foot-gun: routes added from the auth stack via
 * `httpApi.addRoutes(...)` physically land in the stack that owns the
 * `HttpApi` construct, so deploying only the auth stack used to skip new
 * routes. Keeping everything in one stack means `cdk deploy --all` is
 * always sufficient.
 *
 * Cross-region: the companion `RaiderToolsAuthCertStack` still lives in
 * us-east-1 because Cognito's custom domain is CloudFront-backed and
 * requires a us-east-1 ACM cert.
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
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";

export interface RaiderToolsStackProps extends cdk.StackProps {
    /**
     * Apex hosted zone domain used for Route53 records.
     * @example "raider-tools.app"
     */
    rootDomainName: string;

    /** Hosted zone id for `rootDomainName`. */
    hostedZoneId: string;

    /**
     * Fully-qualified hostname exposing the HTTP API.
     * @example "api.raider-tools.app"
     */
    apiDomainName: string;

    /**
     * Fully-qualified hostname exposing the Cognito custom domain.
     * @example "auth.raider-tools.app"
     */
    authDomainName: string;

    /**
     * SPA origin used as the Discord post-login redirect target and for
     * CORS validation.
     * @example "https://raider-tools.app"
     */
    spaOrigin: string;

    /** Allowed SPA origins for CORS / return-URL validation. */
    allowedOrigins: string[];

    /**
     * Name of the Secrets Manager secret holding the ArcTracker app key.
     * Referenced by name (not CDK-managed) so rotation stays out of band.
     */
    arcAppKeySecretName: string;

    /**
     * Name of the Secrets Manager secret holding Discord OAuth credentials.
     * Created here with a placeholder; real values are put via
     * `aws secretsmanager put-secret-value` post-deploy.
     */
    discordSecretName: string;

    /**
     * us-east-1 ACM cert for `authDomainName`. Imported from
     * `RaiderToolsAuthCertStack` via cross-region references.
     */
    authCertificate: acm.ICertificate;
}

export class RaiderToolsStack extends cdk.Stack {
    public readonly httpApi: apigwv2.HttpApi;
    public readonly userPool: cognito.UserPool;
    public readonly userPoolClient: cognito.UserPoolClient;
    public readonly userTable: dynamodb.TableV2;
    public readonly kmsKey: kms.Key;

    constructor(scope: Construct, id: string, props: RaiderToolsStackProps) {
        super(scope, id, props);

        if (cdk.Stack.of(this).region !== "eu-central-1") {
            throw new Error("This stack is intended for eu-central-1.");
        }

        const apiOrigin = `https://${props.apiDomainName}`;

        // -----------------------------------------------------------------
        // Route53 hosted zone (shared between api + auth records).
        // -----------------------------------------------------------------
        const zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
            hostedZoneId: props.hostedZoneId,
            zoneName: props.rootDomainName,
        });

        // -----------------------------------------------------------------
        // ArcTracker app key (reference existing secret, managed externally).
        // -----------------------------------------------------------------
        const arcAppKeySecret = secretsmanager.Secret.fromSecretNameV2(
            this,
            "ArcAppKeySecret",
            props.arcAppKeySecretName,
        );

        // -----------------------------------------------------------------
        // S3 bucket for cached schedule data. Versioned so the updater
        // can diff between snapshots safely.
        // -----------------------------------------------------------------
        const scheduleBucket = new s3.Bucket(this, "ScheduleDataBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            autoDeleteObjects: false,
        });

        const embarkSnapshotBucket = new s3.Bucket(this, "EmbarkSnapshotBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: false,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            autoDeleteObjects: false,
            lifecycleRules: [
                {
                    id: "ExpireRawEmbarkSnapshotsAfter14Days",
                    expiration: cdk.Duration.days(14),
                    prefix: "embark/inventory/",
                },
                {
                    id: "ExpireRawEmbarkQuestSnapshotsAfter14Days",
                    expiration: cdk.Duration.days(14),
                    prefix: "embark/quests/",
                },
            ],
        });

        // -----------------------------------------------------------------
        // KMS CMK for envelope-encrypting linked-account tokens.
        // -----------------------------------------------------------------
        this.kmsKey = new kms.Key(this, "UserSecretsKey", {
            alias: "alias/raider-tools/user-secrets",
            description: "Envelope-encryption key for raider-tools user-linked tokens",
            enableKeyRotation: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // -----------------------------------------------------------------
        // DynamoDB single-table (users + links + IdP mappings + nonces).
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
        // Discord OAuth credentials (placeholder; populated post-deploy).
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

        const embarkOauthSecret = new secretsmanager.Secret(this, "EmbarkOAuthSecret", {
            secretName: "raider-tools/embark/oauth",
            description: "Embark OAuth client secret",
            secretObjectValue: {
                clientSecret: cdk.SecretValue.unsafePlainText("PLACEHOLDER"),
            },
        });

        const embarkManifestParamName = "/raider-tools/embark/manifest-id";
        const embarkUserAgentParamName = "/raider-tools/embark/user-agent";
        const embarkConfigParamArns = [
            cdk.Stack.of(this).formatArn({
                service: "ssm",
                resource: "parameter",
                resourceName: embarkManifestParamName.replace(/^\//, ""),
            }),
            cdk.Stack.of(this).formatArn({
                service: "ssm",
                resource: "parameter",
                resourceName: embarkUserAgentParamName.replace(/^\//, ""),
            }),
        ];

        // -----------------------------------------------------------------
        // Cognito custom-auth triggers (Discord-bridged passwordless).
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
        // Cognito user pool.
        //
        // `userVerification` overrides the default subject + body of the
        // sign-up verification email. This is Cognito's built-in sender
        // (`no-reply@verificationemail.com`), so delivery is still
        // subject to the 50-emails-per-day cap on Cognito-owned senders
        // — good enough for dev + low-volume launch. Switch to SES
        // (see `email: cognito.UserPoolEmail.withSES(...)`) once we need
        // production-grade deliverability from `noreply@raider-tools.app`.
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
            userVerification: {
                emailSubject: "Verify your Raider Tools account",
                // HTML body — Cognito replaces `{####}` with the 6-digit
                // verification code at send time. Keep inline styles only
                // so the markup survives the stricter rendering rules of
                // Gmail / Outlook / Apple Mail.
                emailBody: [
                    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">',
                    '  <p>Welcome to <strong>Raider Tools</strong>!</p>',
                    '  <p>Use the following verification code to finish creating your account:</p>',
                    '  <p style="font-size:22px;font-weight:700;letter-spacing:2px;background:#f4f4f4;padding:12px 16px;border-radius:6px;display:inline-block;">{####}</p>',
                    '  <p style="color:#555;">The code expires in 24 hours. Once confirmed, you can sign in at <a href="https://raider-tools.app">raider-tools.app</a>.</p>',
                    '  <p style="color:#888;font-size:12px;margin-top:24px;">If you didn\'t sign up for Raider Tools, you can safely ignore this email — no account will be created.</p>',
                    '</div>',
                ].join("\n"),
                emailStyle: cognito.VerificationEmailStyle.CODE,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lambdaTriggers: {
                defineAuthChallenge: defineAuthFn,
                createAuthChallenge: createAuthFn,
                verifyAuthChallengeResponse: verifyAuthFn,
            },
        });

        new cognito.CfnUserPoolGroup(this, "EmbarkAuthGroup", {
            userPoolId: this.userPool.userPoolId,
            groupName: "embark-auth",
            description: "Enables Embark account linking and Embark-backed Raider Tools features.",
        });

        const userPoolDomain = this.userPool.addDomain("UserPoolDomain", {
            customDomain: {
                domainName: props.authDomainName,
                certificate: props.authCertificate,
            },
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
        });

        // -----------------------------------------------------------------
        // Schedule Lambdas.
        // -----------------------------------------------------------------
        const scheduleReadFn = new nodeLambda.NodejsFunction(this, "ScheduleReadFunction", {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: "lambda/schedule-reader.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(10),
            environment: {
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                SCHEDULE_BUCKET_NAME: scheduleBucket.bucketName,
                SCHEDULE_KEY: "map-events.json",
                SCHEDULE_HEALTH_KEY: "health.json",
            },
            bundling: { minify: true, sourceMap: true, target: "node22" },
        });
        scheduleBucket.grantRead(scheduleReadFn);

        const scheduleUpdateFn = new nodeLambda.NodejsFunction(this, "ScheduleUpdateFunction", {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: "lambda/schedule-updater.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(120),
            environment: {
                MAP_CONDITIONS_URL: "https://arcraiders.com/map-conditions",
                EVENT_TYPES_URL: "https://raider-tools.app/data/schedule/event-types.json",
                SCHEDULE_BUCKET_NAME: scheduleBucket.bucketName,
                SCHEDULE_KEY: "map-events.json",
                SCHEDULE_STAGING_KEY: "staging/map-events.json",
                SCHEDULE_HEALTH_KEY: "health.json",
                MERGE_HISTORY_WINDOW_SECONDS: String(30 * 24 * 60 * 60),
            },
            bundling: { minify: true, sourceMap: true, target: "node22" },
        });
        scheduleBucket.grantReadWrite(scheduleUpdateFn);

        new events.Rule(this, "ScheduleUpdaterHourlyRule", {
            description: "Refresh ARC Raiders map schedule from map-conditions HTML every hour",
            schedule: events.Schedule.rate(cdk.Duration.hours(1)),
            targets: [new eventsTargets.LambdaFunction(scheduleUpdateFn)],
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
                DISCORD_REDIRECT_URI: `${apiOrigin}/auth/discord/callback`,
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
        // /me, /me/links/*, /me/state/*, /me/migrate Lambdas (JWT-protected).
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
                ARC_APP_KEY_SECRET_ARN: arcAppKeySecret.secretArn,
            },
        });
        this.userTable.grantReadWriteData(linksFn);
        this.kmsKey.grantEncryptDecrypt(linksFn);
        arcAppKeySecret.grantRead(linksFn);

        const arctrackerUserProxyFn = this.makeLambda("ArctrackerUserProxyFn", "arctracker-user-proxy.ts", {
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                KMS_KEY_ID: this.kmsKey.keyId,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                ARC_APP_KEY_SECRET_ARN: arcAppKeySecret.secretArn,
            },
        });
        this.userTable.grantReadWriteData(arctrackerUserProxyFn);
        this.kmsKey.grantEncryptDecrypt(arctrackerUserProxyFn);
        arcAppKeySecret.grantRead(arctrackerUserProxyFn);

        const embarkLinkFn = this.makeLambda("EmbarkLinkFn", "embark-link.ts", {
            timeout: cdk.Duration.seconds(15),
            memorySize: 256,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                KMS_KEY_ID: this.kmsKey.keyId,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                EMBARK_OAUTH_SECRET_ARN: embarkOauthSecret.secretArn,
                EMBARK_MANIFEST_PARAM_NAME: embarkManifestParamName,
                EMBARK_USER_AGENT_PARAM_NAME: embarkUserAgentParamName,
                EMBARK_LOOPBACK_REDIRECT_URI: "http://127.0.0.1:49174",
            },
        });
        this.userTable.grantReadWriteData(embarkLinkFn);
        this.kmsKey.grantEncryptDecrypt(embarkLinkFn);
        embarkOauthSecret.grantRead(embarkLinkFn);
        embarkLinkFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ssm:DescribeParameters",
                "ssm:GetParameter",
                "ssm:GetParameterHistory",
                "ssm:GetParameters",
            ],
            resources: embarkConfigParamArns,
        }));

        const embarkInventoryFn = this.makeLambda("EmbarkInventoryFn", "embark-inventory.ts", {
            timeout: cdk.Duration.seconds(20),
            memorySize: 512,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                KMS_KEY_ID: this.kmsKey.keyId,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                EMBARK_MANIFEST_PARAM_NAME: embarkManifestParamName,
                EMBARK_USER_AGENT_PARAM_NAME: embarkUserAgentParamName,
                EMBARK_SNAPSHOT_BUCKET_NAME: embarkSnapshotBucket.bucketName,
            },
        });
        this.userTable.grantReadWriteData(embarkInventoryFn);
        this.kmsKey.grantEncryptDecrypt(embarkInventoryFn);
        embarkInventoryFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ssm:DescribeParameters",
                "ssm:GetParameter",
                "ssm:GetParameterHistory",
                "ssm:GetParameters",
            ],
            resources: embarkConfigParamArns,
        }));
        embarkSnapshotBucket.grantReadWrite(embarkInventoryFn);

        const embarkQuestsFn = this.makeLambda("EmbarkQuestsFn", "embark-quests.ts", {
            timeout: cdk.Duration.seconds(20),
            memorySize: 512,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                KMS_KEY_ID: this.kmsKey.keyId,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                EMBARK_MANIFEST_PARAM_NAME: embarkManifestParamName,
                EMBARK_USER_AGENT_PARAM_NAME: embarkUserAgentParamName,
                EMBARK_SNAPSHOT_BUCKET_NAME: embarkSnapshotBucket.bucketName,
            },
        });
        this.userTable.grantReadWriteData(embarkQuestsFn);
        this.kmsKey.grantEncryptDecrypt(embarkQuestsFn);
        embarkQuestsFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ssm:DescribeParameters",
                "ssm:GetParameter",
                "ssm:GetParameterHistory",
                "ssm:GetParameters",
            ],
            resources: embarkConfigParamArns,
        }));

        const embarkProjectsFn = this.makeLambda("EmbarkProjectsFn", "embark-projects.ts", {
            timeout: cdk.Duration.seconds(20),
            memorySize: 512,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                KMS_KEY_ID: this.kmsKey.keyId,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
                EMBARK_MANIFEST_PARAM_NAME: embarkManifestParamName,
                EMBARK_USER_AGENT_PARAM_NAME: embarkUserAgentParamName,
            },
        });
        this.userTable.grantReadWriteData(embarkProjectsFn);
        this.kmsKey.grantEncryptDecrypt(embarkProjectsFn);
        embarkProjectsFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ssm:DescribeParameters",
                "ssm:GetParameter",
                "ssm:GetParameterHistory",
                "ssm:GetParameters",
            ],
            resources: embarkConfigParamArns,
        }));
        embarkSnapshotBucket.grantReadWrite(embarkQuestsFn);

        const stateFn = this.makeLambda("StateFn", "state.ts", {
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            environment: {
                USER_TABLE_NAME: this.userTable.tableName,
                ALLOWED_ORIGINS: props.allowedOrigins.join(","),
            },
        });
        this.userTable.grantReadWriteData(stateFn);

        // -----------------------------------------------------------------
        // HTTP API + custom domain + Route53 alias.
        // -----------------------------------------------------------------
        const apiCert = new acm.Certificate(this, "ApiCert", {
            domainName: props.apiDomainName,
            validation: acm.CertificateValidation.fromDns(zone),
        });

        this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
            apiName: "raider-tools-api",
            corsPreflight: {
                allowOrigins: props.allowedOrigins,
                allowMethods: [
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.PATCH,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allowHeaders: [
                    "Authorization",
                    "Content-Type",
                    "If-None-Match",
                    "If-Modified-Since",
                ],
                exposeHeaders: [
                    "X-RateLimit-Limit",
                    "X-RateLimit-Remaining",
                    "X-RateLimit-Reset",
                    "Retry-After",
                    "ETag",
                    "Last-Modified",
                ],
                maxAge: cdk.Duration.hours(1),
            },
        });

        const apiDomain = new apigwv2.DomainName(this, "ApiDomainName", {
            domainName: props.apiDomainName,
            certificate: apiCert,
        });

        new apigwv2.ApiMapping(this, "ApiMapping", {
            api: this.httpApi,
            domainName: apiDomain,
            stage: this.httpApi.defaultStage!,
        });

        new route53.ARecord(this, "ApiAliasRecord", {
            zone,
            recordName: props.apiDomainName,
            target: route53.RecordTarget.fromAlias(
                new route53Targets.ApiGatewayv2DomainProperties(
                    apiDomain.regionalDomainName,
                    apiDomain.regionalHostedZoneId,
                ),
            ),
        });

        // -----------------------------------------------------------------
        // Routes.
        // -----------------------------------------------------------------
        const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
            "CognitoJwtAuthorizer",
            `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
            {
                identitySource: ["$request.header.Authorization"],
                jwtAudience: [this.userPoolClient.userPoolClientId],
            },
        );

        const scheduleIntegration = new integrations.HttpLambdaIntegration(
            "ScheduleReadIntegration", scheduleReadFn,
        );
        this.httpApi.addRoutes({
            path: "/schedule/map-events.json",
            methods: [apigwv2.HttpMethod.GET],
            integration: scheduleIntegration,
        });
        this.httpApi.addRoutes({
            path: "/schedule/health.json",
            methods: [apigwv2.HttpMethod.GET],
            integration: scheduleIntegration,
        });

        const discordIntegration = new integrations.HttpLambdaIntegration(
            "DiscordIntegration", discordAuthFn,
        );
        this.httpApi.addRoutes({
            path: "/auth/discord/start",
            methods: [apigwv2.HttpMethod.GET],
            integration: discordIntegration,
        });
        this.httpApi.addRoutes({
            path: "/auth/discord/callback",
            methods: [apigwv2.HttpMethod.GET],
            integration: discordIntegration,
        });

        const profileIntegration = new integrations.HttpLambdaIntegration(
            "ProfileIntegration", profileFn,
        );
        this.httpApi.addRoutes({
            path: "/me",
            methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
            integration: profileIntegration,
            authorizer: jwtAuthorizer,
        });

        const linksIntegration = new integrations.HttpLambdaIntegration(
            "LinksIntegration", linksFn,
        );
        this.httpApi.addRoutes({
            path: "/me/links/{provider}",
            methods: [
                apigwv2.HttpMethod.GET,
                apigwv2.HttpMethod.PUT,
                apigwv2.HttpMethod.DELETE,
            ],
            integration: linksIntegration,
            authorizer: jwtAuthorizer,
        });

        const arctrackerUserProxyIntegration = new integrations.HttpLambdaIntegration(
            "ArctrackerUserProxyIntegration", arctrackerUserProxyFn,
        );
        this.httpApi.addRoutes({
            path: "/me/arctracker/{proxy+}",
            methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
            integration: arctrackerUserProxyIntegration,
            authorizer: jwtAuthorizer,
        });

        const stateIntegration = new integrations.HttpLambdaIntegration(
            "StateIntegration", stateFn,
        );
        const embarkLinkIntegration = new integrations.HttpLambdaIntegration(
            "EmbarkLinkIntegration", embarkLinkFn,
        );
        const embarkInventoryIntegration = new integrations.HttpLambdaIntegration(
            "EmbarkInventoryIntegration", embarkInventoryFn,
        );
        const embarkQuestsIntegration = new integrations.HttpLambdaIntegration(
            "EmbarkQuestsIntegration", embarkQuestsFn,
        );
        const embarkProjectsIntegration = new integrations.HttpLambdaIntegration(
            "EmbarkProjectsIntegration", embarkProjectsFn,
        );
        this.httpApi.addRoutes({
            path: "/me/state/{domain}",
            methods: [
                apigwv2.HttpMethod.GET,
                apigwv2.HttpMethod.PUT,
                apigwv2.HttpMethod.DELETE,
            ],
            integration: stateIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/migrate",
            methods: [apigwv2.HttpMethod.POST],
            integration: stateIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/links/embark/start",
            methods: [apigwv2.HttpMethod.POST],
            integration: embarkLinkIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/links/embark/complete",
            methods: [apigwv2.HttpMethod.POST],
            integration: embarkLinkIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/embark/inventory",
            methods: [apigwv2.HttpMethod.GET],
            integration: embarkInventoryIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/embark/inventory/sync",
            methods: [apigwv2.HttpMethod.POST],
            integration: embarkInventoryIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/embark/quests",
            methods: [apigwv2.HttpMethod.GET],
            integration: embarkQuestsIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/embark/quests/sync",
            methods: [apigwv2.HttpMethod.POST],
            integration: embarkQuestsIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/embark/projects",
            methods: [apigwv2.HttpMethod.GET],
            integration: embarkProjectsIntegration,
            authorizer: jwtAuthorizer,
        });
        this.httpApi.addRoutes({
            path: "/me/embark/projects/sync",
            methods: [apigwv2.HttpMethod.POST],
            integration: embarkProjectsIntegration,
            authorizer: jwtAuthorizer,
        });

        // -----------------------------------------------------------------
        // Outputs.
        // -----------------------------------------------------------------
        new cdk.CfnOutput(this, "HttpApiId", { value: this.httpApi.httpApiId });
        new cdk.CfnOutput(this, "ApiBaseUrl", { value: apiOrigin });
        new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
        new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
        new cdk.CfnOutput(this, "UserPoolDomainBaseUrl", { value: userPoolDomain.baseUrl() });
        new cdk.CfnOutput(this, "UserTableName", { value: this.userTable.tableName });
        new cdk.CfnOutput(this, "UserSecretsKeyArn", { value: this.kmsKey.keyArn });
        new cdk.CfnOutput(this, "ScheduleBucketName", { value: scheduleBucket.bucketName });
        new cdk.CfnOutput(this, "EmbarkSnapshotBucketName", { value: embarkSnapshotBucket.bucketName });
        new cdk.CfnOutput(this, "DiscordCallbackUrl", { value: `${apiOrigin}/auth/discord/callback` });
        new cdk.CfnOutput(this, "EmbarkOAuthSecretArn", { value: embarkOauthSecret.secretArn });
        new cdk.CfnOutput(this, "EmbarkManifestParamName", { value: embarkManifestParamName });
        new cdk.CfnOutput(this, "EmbarkUserAgentParamName", { value: embarkUserAgentParamName });
        new cdk.CfnOutput(this, "ScheduleMapEventsUrl", { value: `${apiOrigin}/schedule/map-events.json` });
        new cdk.CfnOutput(this, "ScheduleHealthUrl", { value: `${apiOrigin}/schedule/health.json` });
    }

    /** Uniform Node.js Lambda configuration for all functions in this stack. */
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
