
/**
 * Raider Tools AWS Infrastructure Entry Point
 *
 * Three stacks in two regions:
 *   - RaiderToolsAuthCertStack (us-east-1) — ACM certificate for the
 *     Cognito custom domain `auth.raider-tools.app`. Cognito requires the
 *     cert to live in us-east-1 because it serves the domain via CloudFront.
 *   - RaiderToolsArcRelayStack (eu-central-1) — ArcTracker relay +
 *     schedule services and the shared HTTP API at api.raider-tools.app.
 *   - RaiderToolsAuthStack (eu-central-1) — Cognito user pool (with the
 *     custom domain), DynamoDB user table, KMS CMK, and the user-account
 *     routes attached to the same HTTP API.
 *
 * Both stacks involved in the cross-region cert reference enable
 * `crossRegionReferences: true` so CDK can publish/consume the ARN via SSM.
 */

import * as cdk from "aws-cdk-lib";
import { RaiderToolsArcRelayStack } from "../lib/raider-tools-arc-relay-stack";
import { RaiderToolsAuthStack } from "../lib/raider-tools-auth-stack";
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
const apiOrigin = `https://${apiDomainName}`;

const authCertStack = new RaiderToolsAuthCertStack(app, "RaiderToolsAuthCertStack", {
    env: certEnv,
    crossRegionReferences: true,
    rootDomainName,
    hostedZoneId,
    authDomainName,
});

const relayStack = new RaiderToolsArcRelayStack(app, "RaiderToolsArcRelayStack", {
    env: primaryEnv,
    rootDomainName,
    apiDomainName,
    hostedZoneId,
    arcAppKeySecretName: "arctracker/appKey",
    allowedOrigins,
});

new RaiderToolsAuthStack(app, "RaiderToolsAuthStack", {
    env: primaryEnv,
    crossRegionReferences: true,
    httpApi: relayStack.httpApi,
    spaOrigin,
    apiOrigin,
    allowedOrigins,
    arctrackerRelayUrl: `${apiOrigin}/arctracker`,
    discordSecretName: "raider-tools/discord/oauth",
    rootDomainName,
    hostedZoneId,
    authDomainName,
    authCertificate: authCertStack.certificate,
});
