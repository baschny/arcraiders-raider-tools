/**
 * Cognito CreateAuthChallenge trigger.
 *
 * Our Discord bridge supplies the challenge answer (a signed nonce) directly
 * to `AdminRespondToAuthChallenge`, so there is no challenge content the
 * client needs to compute. We simply seed empty parameters and remember the
 * username for the verifier.
 */

import type { CreateAuthChallengeTriggerEvent } from "aws-lambda";

export async function handler(event: CreateAuthChallengeTriggerEvent): Promise<CreateAuthChallengeTriggerEvent> {
    if (event.request.challengeName !== "CUSTOM_CHALLENGE") {
        return event;
    }

    event.response.publicChallengeParameters = {
        type: "discord-bridge",
    };
    event.response.privateChallengeParameters = {
        username: event.userName,
    };
    event.response.challengeMetadata = "DISCORD_BRIDGE";
    return event;
}
