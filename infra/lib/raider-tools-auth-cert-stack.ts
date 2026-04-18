/**
 * Raider Tools Auth Cert Stack
 *
 * Cognito User Pool custom domains require an ACM certificate that lives
 * in `us-east-1`, regardless of where the user pool itself is deployed,
 * because Cognito serves the domain via CloudFront.
 *
 * This stack exists solely to provision that certificate; the auth stack
 * (in eu-central-1) consumes it via CDK's `crossRegionReferences` feature,
 * which publishes the cert ARN as an SSM parameter in us-east-1 and reads
 * it back during synth in the consumer stack — no manual ARN copy/paste.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

export interface RaiderToolsAuthCertStackProps extends cdk.StackProps {
    /**
     * Apex hosted zone domain.
     * @example "raider-tools.app"
     */
    rootDomainName: string;

    /**
     * Hosted zone id for `rootDomainName` (must already exist in Route53).
     */
    hostedZoneId: string;

    /**
     * Fully-qualified hostname for the Cognito custom domain.
     * @example "auth.raider-tools.app"
     */
    authDomainName: string;
}

export class RaiderToolsAuthCertStack extends cdk.Stack {
    public readonly certificate: acm.Certificate;

    constructor(scope: Construct, id: string, props: RaiderToolsAuthCertStackProps) {
        super(scope, id, props);

        if (cdk.Stack.of(this).region !== "us-east-1") {
            throw new Error(
                "RaiderToolsAuthCertStack must be deployed in us-east-1 for Cognito custom domains.",
            );
        }

        const zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
            hostedZoneId: props.hostedZoneId,
            zoneName: props.rootDomainName,
        });

        this.certificate = new acm.Certificate(this, "AuthDomainCert", {
            domainName: props.authDomainName,
            validation: acm.CertificateValidation.fromDns(zone),
        });

        new cdk.CfnOutput(this, "AuthDomainCertArn", {
            value: this.certificate.certificateArn,
            description: "ACM cert ARN for the Cognito custom domain (us-east-1)",
        });
    }
}
