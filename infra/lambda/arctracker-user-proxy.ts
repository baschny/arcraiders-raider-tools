/**
 * /me/arctracker/{proxy+} — call ArcTracker on behalf of the signed-in user.
 *
 * The browser never receives the stored ArcTracker token. This Lambda reads
 * the user's encrypted LINK#arctracker row, decrypts it in-process, and
 * forwards the request with the shared ArcTracker relay helper.
 */

import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
    jsonResponse,
    pickAllowedOrigin,
    jwtSub,
} from "./_lib/http";
import { decryptToken, type EnvelopePayload } from "./_lib/envelope";
import { forwardArcTrackerRequest, forwardArcTrackerSyncNow } from "./_lib/arctrackerRelay";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const PATH_PREFIX = "/me/arctracker";

export async function handler(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);

    const method = event.requestContext.http.method;
    if (method !== "GET" && method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed" }, origin);
    }

    const rawPath = event.rawPath || "";
    if (!rawPath.startsWith(`${PATH_PREFIX}/`)) {
        return jsonResponse(404, { error: "Unknown route" }, origin);
    }

    try {
        const row = await ddb.send(new GetCommand({
            TableName: process.env.USER_TABLE_NAME!,
            Key: { pk: `USER#${sub}`, sk: "LINK#arctracker" },
        }));
        if (!row.Item) return jsonResponse(401, { error: "ArcTracker account not linked" }, origin);

        const token = await decryptToken(row.Item as EnvelopePayload, {
            userId: sub,
            purpose: "link",
            provider: "arctracker",
        });

        if (method === "POST" && rawPath.endsWith("/sync-now")) {
            const body = event.body ? JSON.parse(event.body) : {};
            const targets: string[] = Array.isArray(body.targets) ? body.targets : [];
            return forwardArcTrackerSyncNow(token, targets, origin);
        }

        const result = await forwardArcTrackerRequest({
            subPath: rawPath.substring(PATH_PREFIX.length),
            rawQueryString: event.rawQueryString,
            bearerToken: token,
            origin,
            requestHeaders: event.headers,
        });
        if (typeof result !== "string") {
            result.headers = {
                "Access-Control-Allow-Credentials": "true",
                ...(result.headers ?? {}),
            };
        }
        return result;
    } catch (err) {
        const e = err as Error;
        console.error("ArctrackerUserProxy error", { message: e.message, name: e.name });
        return jsonResponse(500, { error: "Internal error" }, origin);
    }
}
