
/**
 * Raider Tools Arc Relay Infrastructure Stack
 *
 * This file defines the AWS CDK stack that provides a secure relay service
 * between the Raider Tools SPA and the arctracker.io API.
 * It manages the API Gateway, Lambda proxy, DNS records, and SSL certificates.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

/**
 * Properties for the RaiderToolsArcRelayStack.
 */
export interface RaiderToolsArcRelayStackProps extends cdk.StackProps {
    /**
     * The root domain name for the application.
     * @example "raider-tools.app"
     */
    rootDomainName: string;

    /**
     * The domain name for the API.
     * @example "api.raider-tools.app"
     */
    apiDomainName: string;

    /**
     * Hosted Zone ID for the rootDomainName.
     */
    hostedZoneId: string;

    /**
     * Secret name that contains the ArcTracker app key.
     * The secret value should be the raw app key string, e.g. "arc_k1_..."
     */
    arcAppKeySecretName: string;

    /**
     * Allowed SPA origin for CORS.
     * @example "https://raider-tools.app"
     */
    allowedOrigin: string;
}

/**
 * RaiderToolsArcRelayStack
 *
 * This stack sets up a relay service between the Raider Tools SPA and arctracker.io.
 * It includes:
 * - A Node.js Lambda function that acts as a secure proxy to arctracker.io.
 * - An HTTP API (API Gateway v2) for handling requests.
 * - Custom domain support with SSL certificate (ACM).
 * - Route53 DNS records for the API domain.
 * - Integration with AWS Secrets Manager to securely handle the ArcTracker app key.
 *
 * The stack is designed to be deployed in the `eu-central-1` region.
 */
export class RaiderToolsArcRelayStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: RaiderToolsArcRelayStackProps) {
        super(scope, id, props);

        if (cdk.Stack.of(this).region !== "eu-central-1") {
            // Not strictly required, but matches your stated target.
            // Remove if you deploy in multiple regions.
            throw new Error("This stack is intended for eu-central-1.");
        }

        // --- Route53 hosted zone lookup (same account)
        const zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
            hostedZoneId: props.hostedZoneId,
            zoneName: props.rootDomainName,
        });

        // --- ACM certificate in eu-central-1 for api.raider-tools.app (DNS validated)
        const apiCert = new certificatemanager.Certificate(this, "ApiCert", {
            domainName: props.apiDomainName,
            validation: certificatemanager.CertificateValidation.fromDns(zone),
        });

        // --- Secret containing ArcTracker app key (reference existing secret)
        const arcAppKeySecret = secretsmanager.Secret.fromSecretNameV2(
            this,
            "ArcAppKeySecret",
            props.arcAppKeySecretName
        );

        // --- Lambda (TypeScript) - relay/proxy to arctracker.io
        const relayFn = new nodeLambda.NodejsFunction(this, "ArcRelayFunction", {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: "lambda/arc-relay.ts",
            handler: "handler",
            memorySize: 256,
            timeout: cdk.Duration.seconds(10),
            environment: {
                ARC_APP_KEY_SECRET_ARN: arcAppKeySecret.secretArn,
                ALLOWED_ORIGIN: props.allowedOrigin,
                // Add explicit allowlist mapping here (also enforce in code)
                // e.g. ARC_ALLOWED_PATHS: "/api/v2/user/profile,/api/v2/user/..."
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: "node22",
            },
        });

        // Allow lambda to read the secret value
        arcAppKeySecret.grantRead(relayFn);

        // Optional: tighten outbound by using a VPC + egress controls (not shown here).
        // For now, lambda will access arctracker.io over the public internet.

        // --- API Gateway HTTP API
        const httpApi = new apigwv2.HttpApi(this, "ArcRelayHttpApi", {
            apiName: "raider-tools-arc-relay",
            corsPreflight: {
                allowOrigins: [props.allowedOrigin],
                allowMethods: [
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allowHeaders: ["Authorization", "Content-Type", "If-None-Match", "If-Modified-Since"],
                exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
                maxAge: cdk.Duration.hours(1),
            },
        });

        // --- Lambda integration + routes (explicit allowlist at the gateway layer)
        const integration = new integrations.HttpLambdaIntegration("RelayIntegration", relayFn);

        // Recommended: define explicit routes per endpoint you want to support.
        // If you want a single "proxy" route, use /arctracker/{proxy+} and enforce allowlist in code.
        httpApi.addRoutes({
            path: "/arctracker/{proxy+}",
            methods: [apigwv2.HttpMethod.GET],
            integration,
        });

        // --- Custom domain for the API
        const apiDomain = new apigwv2.DomainName(this, "ArcRelayDomainName", {
            domainName: props.apiDomainName,
            certificate: apiCert,
        });

        // Map custom domain -> API stage ($default)
        new apigwv2.ApiMapping(this, "ArcRelayApiMapping", {
            api: httpApi,
            domainName: apiDomain,
            stage: httpApi.defaultStage!, // created by default for HttpApi
            // mappingKey: undefined // root mapping
        });

        // --- Route53 alias record api.raider-tools.app -> API Gateway domain target
        new route53.ARecord(this, "ApiAliasRecord", {
            zone,
            recordName: props.apiDomainName, // "api.raider-tools.app"
            target: route53.RecordTarget.fromAlias(new route53Targets.ApiGatewayv2DomainProperties(
                apiDomain.regionalDomainName,
                apiDomain.regionalHostedZoneId
            )),
        });

        // --- Outputs
        new cdk.CfnOutput(this, "HttpApiId", { value: httpApi.httpApiId });
        new cdk.CfnOutput(this, "ApiBaseUrlCustomDomain", { value: `https://${props.apiDomainName}` });
        new cdk.CfnOutput(this, "ApiBaseUrlDefault", { value: httpApi.apiEndpoint });
    }
}
