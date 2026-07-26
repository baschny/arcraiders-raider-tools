
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
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RaiderToolsStack } from "../lib/raider-tools-stack";
import { RaiderToolsAuthCertStack } from "../lib/raider-tools-auth-cert-stack";

// CDK normally receives configuration from its parent shell. Load the ignored
// infra/.env and infra/.env.cdk files too, so deployment settings can be kept
// alongside the infrastructure project. Explicit shell variables take priority.
loadInfraEnv();

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

function loadInfraEnv(): void {
    const envDir = resolve(__dirname, "..");
    const shellEnvironment = new Set(Object.keys(process.env));
    loadInfraEnvFile(resolve(envDir, ".env"), shellEnvironment, false);
    loadInfraEnvFile(resolve(envDir, ".env.cdk"), shellEnvironment, true);
}

function loadInfraEnvFile(
    filename: string,
    shellEnvironment: ReadonlySet<string>,
    override: boolean,
): void {
    if (!existsSync(filename)) return;

    for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separator = trimmed.indexOf("=");
        if (separator <= 0) continue;
        const key = trimmed.slice(0, separator).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || shellEnvironment.has(key)) continue;
        if (!override && process.env[key] !== undefined) continue;
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else {
            const comment = value.indexOf(" #");
            value = (comment >= 0 ? value.slice(0, comment) : value).trim();
        }
        process.env[key] = value;
    }
}
