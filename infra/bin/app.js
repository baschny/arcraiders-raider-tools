"use strict";
/**
 * Raider Tools AWS Infrastructure Entry Point
 *
 * This file initializes the AWS CDK application and instantiates the
 * RaiderToolsArcRelayStack with configuration for the production environment.
 * The stack is pinned to the eu-central-1 (Frankfurt) region.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const raider_tools_arc_relay_stack_1 = require("../lib/raider-tools-arc-relay-stack");
const app = new cdk.App();
new raider_tools_arc_relay_stack_1.RaiderToolsArcRelayStack(app, "RaiderToolsArcRelayStack", {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
    rootDomainName: "raider-tools.app",
    apiDomainName: "api.raider-tools.app",
    hostedZoneId: "Z10215333596U4U11HK5Q",
    arcAppKeySecretName: "arctracker/appKey",
    allowedOrigins: ["https://raider-tools.app", "http://localhost:5173"],
});
