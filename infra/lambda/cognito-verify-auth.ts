/**
 * Cognito VerifyAuthChallengeResponse trigger.
 *
 * The challenge answer arrives as `<nonce>.<hmacHex>` and must:
 *   1. Have a valid HMAC against the Discord stateSigningKey.
 *   2. Have a matching, unexpired NONCE row in DynamoDB.
 *   3. Belong to the same Cognito username we are signing in.
 *
 * The NONCE row is deleted on success to enforce single-use.
 */

import type { VerifyAuthChallengeResponseTriggerEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDiscordSecret } from "./_lib/discordSecret";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handler(
    event: VerifyAuthChallengeResponseTriggerEvent,
): Promise<VerifyAuthChallengeResponseTriggerEvent> {
    event.response.answerCorrect = false;

    const answer = event.request.challengeAnswer;
    if (!answer || typeof answer !== "string" || !answer.includes(".")) {
        return event;
    }

    const [nonce, sigHex] = answer.split(".", 2);
    if (!nonce || !sigHex) return event;

    const secret = await getDiscordSecret();
    const expected = createHmac("sha256", Buffer.from(secret.stateSigningKey, "base64"))
        .update(nonce).digest("hex");
    const a = Buffer.from(sigHex, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return event;
    }

    const tableName = process.env.USER_TABLE_NAME!;
    const got = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `NONCE#${nonce}`, sk: "NONCE" },
    }));
    const row = got.Item;
    if (!row) return event;

    const ttl = typeof row.ttl === "number" ? row.ttl : 0;
    if (ttl > 0 && ttl < Math.floor(Date.now() / 1000)) {
        return event;
    }

    if (row.cognitoUsername !== event.userName) {
        return event;
    }

    // Single-use: best-effort delete; even if this fails the record will
    // expire via TTL.
    try {
        await ddb.send(new DeleteCommand({
            TableName: tableName,
            Key: { pk: `NONCE#${nonce}`, sk: "NONCE" },
        }));
    } catch (err) {
        console.warn("Failed to delete nonce row", { message: (err as Error).message });
    }

    event.response.answerCorrect = true;
    return event;
}
