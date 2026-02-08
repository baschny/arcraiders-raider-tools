
/**
 * Raider Tools AWS Infrastructure Entry Point
 *
 * This file initializes the AWS CDK application and instantiates the
 * RaiderToolsArcRelayStack with configuration for the production environment.
 * The stack is pinned to the eu-central-1 (Frankfurt) region.
 */

import * as cdk from "aws-cdk-lib";
import { RaiderToolsArcRelayStack } from "../lib/raider-tools-arc-relay-stack";

const app = new cdk.App();

new RaiderToolsArcRelayStack(app, "RaiderToolsArcRelayStack", {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },

    rootDomainName: "raider-tools.app",
    apiDomainName: "api.raider-tools.app",
    hostedZoneId: "Z10215333596U4U11HK5Q",
    arcAppKeySecretName: "arctracker/appKey",
    allowedOrigin: "https://raider-tools.app",
});
