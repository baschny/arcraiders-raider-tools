
/**
 * Raider Tools AWS Infrastructure Entry Point
 *
 * Two stacks in two regions:
 *   - RaiderToolsAuthCertStack (us-east-1) — ACM certificate for the
 *     Cognito custom domain `auth.raider-tools.app`. Cognito requires
 *     the cert to live in us-east-1 because it serves the domain via
 *     CloudFront. This is the only reason the cert isn't in the main
 *     stack.
 *   - RaiderToolsStack (eu-central-1) — everything else: HTTP API at
 *     `api.raider-tools.app`, ArcTracker relay, schedule services,
 *     Cognito user pool, DynamoDB user table, KMS CMK, Discord OAuth
 *     bridge, and all `/me*` Lambdas + routes.
 *
 * Both stacks enable `crossRegionReferences: true` so CDK can publish /
 * consume the ACM cert ARN via SSM.
 */

import * as cdk from "aws-cdk-lib";
import { RaiderToolsStack } from "../lib/raider-tools-stack";
import { RaiderToolsAuthCertStack } from "../lib/raider-tools-auth-cert-stack";

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const primaryEnv = { account, region: "eu-central-1" };
const certEnv = { account, region: "us-east-1" };

const rootDomainName = "raider-tools.app";
const apiDomainName = "api.raider-tools.app";
const authDomainName = "auth.raider-tools.app";
const hostedZoneId = "Z10215333596U4U11HK5Q";

const allowedOrigins = ["https://raider-tools.app", "http://localhost:5173"];
const spaOrigin = "https://raider-tools.app";

const authCertStack = new RaiderToolsAuthCertStack(app, "RaiderToolsAuthCertStack", {
    env: certEnv,
    crossRegionReferences: true,
    rootDomainName,
    hostedZoneId,
    authDomainName,
});

new RaiderToolsStack(app, "RaiderToolsStack", {
    env: primaryEnv,
    crossRegionReferences: true,
    rootDomainName,
    hostedZoneId,
    apiDomainName,
    authDomainName,
    spaOrigin,
    allowedOrigins,
    arcAppKeySecretName: "arctracker/appKey",
    discordSecretName: "raider-tools/discord/oauth",
    authCertificate: authCertStack.certificate,
});
