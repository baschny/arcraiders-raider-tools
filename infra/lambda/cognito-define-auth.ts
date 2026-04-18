/**
 * Cognito DefineAuthChallenge trigger.
 *
 * Custom-auth state machine for Discord-bridged sign-in:
 *   - First invocation (no session yet): issue CUSTOM_CHALLENGE.
 *   - After exactly one correct answer: issue tokens.
 *   - Otherwise: fail.
 */

import type { DefineAuthChallengeTriggerEvent } from "aws-lambda";

export async function handler(event: DefineAuthChallengeTriggerEvent): Promise<DefineAuthChallengeTriggerEvent> {
    const session = event.request.session ?? [];

    if (session.length === 0) {
        event.response.challengeName = "CUSTOM_CHALLENGE";
        event.response.issueTokens = false;
        event.response.failAuthentication = false;
        return event;
    }

    const last = session[session.length - 1];
    if (last.challengeName === "CUSTOM_CHALLENGE" && last.challengeResult === true) {
        event.response.issueTokens = true;
        event.response.failAuthentication = false;
        return event;
    }

    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
}
