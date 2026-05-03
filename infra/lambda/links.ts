/**
 * /me/links/{provider} — manage external account links for the user.
 *
 * GET    /me/links/arctracker  -> { linked, validatedUsername?, validatedAt? }
 * PUT    /me/links/arctracker  -> body: { token } -> validates via
 *                                 ArcTracker, then envelope-encrypts and
 *                                 stores ciphertext in DynamoDB.
 * DELETE /me/links/arctracker  -> removes the link.
 *
 * GET    /me/links/embark      -> stub: { linked: false } (phase 2)
 *
 * Auth: Cognito JWT (attached at the API Gateway authorizer).
 */

import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    jsonResponse,
    pickAllowedOrigin,
    jwtSub,
    parseJsonBody,
} from "./_lib/http";
import { encryptToken, type EnvelopePayload } from "./_lib/envelope";
import { forwardArcTrackerRequest } from "./_lib/arctrackerRelay";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface PutArctrackerBody {
    token?: string;
}

interface ArctrackerProfileResponse {
    data?: {
        username?: string;
    };
}

export async function handler(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);

    const provider = event.pathParameters?.provider;
    if (!provider) return jsonResponse(400, { error: "Missing provider" }, origin);

    const tableName = process.env.USER_TABLE_NAME!;
    const method = event.requestContext.http.method;

    try {
        if (provider === "arctracker") {
            if (method === "GET") return await handleArctrackerGet(tableName, sub, origin);
            if (method === "PUT") return await handleArctrackerPut(tableName, sub, event.body ?? null, origin);
            if (method === "DELETE") return await handleArctrackerDelete(tableName, sub, origin);
            return jsonResponse(405, { error: "Method not allowed" }, origin);
        }
        if (provider === "embark") {
            // Phase-2 stub. Always reports unlinked.
            if (method === "GET") return jsonResponse(200, { linked: false, stub: true }, origin);
            return jsonResponse(501, { error: "Embark linking not implemented yet" }, origin);
        }
        return jsonResponse(404, { error: `Unknown provider: ${provider}` }, origin);
    } catch (err) {
        const e = err as Error;
        console.error("LinksFn error", { message: e.message, name: e.name, provider });
        return jsonResponse(500, { error: "Internal error" }, origin);
    }
}

// ---------------------------------------------------------------------------
// ArcTracker
// ---------------------------------------------------------------------------

async function handleArctrackerGet(
    tableName: string,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const r = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "LINK#arctracker" },
    }));
    if (!r.Item) return jsonResponse(200, { linked: false }, origin);
    return jsonResponse(200, {
        linked: true,
        validatedUsername: r.Item.validatedUsername ?? null,
        validatedAt: r.Item.validatedAt ?? null,
    }, origin);
}

async function handleArctrackerPut(
    tableName: string,
    sub: string,
    rawBody: string | null,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const body = parseJsonBody<PutArctrackerBody>(rawBody);
    const token = body?.token?.trim();
    if (!token) return jsonResponse(400, { error: "Missing token" }, origin);
    if (!/^arc_u1_[A-Za-z0-9_-]{20,}$/.test(token)) {
        return jsonResponse(400, { error: "Token format invalid" }, origin);
    }

    const profileResp = await forwardArcTrackerRequest({
        subPath: "/v2/user/profile",
        bearerToken: token,
        origin,
    });
    if (typeof profileResp === "string") {
        return jsonResponse(502, { error: "ArcTracker validation failed" }, origin);
    }
    if (profileResp.statusCode === 401 || profileResp.statusCode === 403) {
        return jsonResponse(400, { error: "ArcTracker rejected the token" }, origin);
    }
    if (!profileResp.statusCode || profileResp.statusCode < 200 || profileResp.statusCode >= 300) {
        return jsonResponse(502, { error: "ArcTracker validation failed" }, origin);
    }
    const profileJson = JSON.parse(profileResp.body ?? "{}") as ArctrackerProfileResponse;
    const validatedUsername = profileJson.data?.username ?? null;

    // Envelope-encrypt and persist.
    const payload: EnvelopePayload = await encryptToken(token, {
        userId: sub,
        purpose: "link",
        provider: "arctracker",
    });

    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: {
            pk: `USER#${sub}`,
            sk: "LINK#arctracker",
            ...payload,
            validatedUsername,
            validatedAt: new Date().toISOString(),
        },
    }));

    return jsonResponse(200, {
        linked: true,
        validatedUsername,
        validatedAt: new Date().toISOString(),
    }, origin);
}

async function handleArctrackerDelete(
    tableName: string,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    await ddb.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "LINK#arctracker" },
    }));
    return jsonResponse(200, { linked: false }, origin);
}
