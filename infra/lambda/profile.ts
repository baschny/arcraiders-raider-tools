/**
 * /me — Profile management Lambda.
 *
 * GET    /me   -> { sub, email, displayName, locale, signupProvider,
 *                    links: { arctracker: boolean, embark: boolean } }
 * PATCH  /me   -> body: { displayName?, locale? }
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
    UpdateCommand,
    BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    jsonResponse,
    pickAllowedOrigin,
    jwtSub,
    jwtEmail,
    parseJsonBody,
} from "./_lib/http";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SUPPORTED_LOCALES = new Set(["en", "de", "pt-BR"]);

interface ProfilePatch {
    displayName?: string;
    locale?: string;
}

export async function handler(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);

    const tableName = process.env.USER_TABLE_NAME!;
    const method = event.requestContext.http.method;

    try {
        if (method === "GET") {
            return await handleGet(tableName, sub, jwtEmail(event), origin);
        }
        if (method === "PATCH") {
            const body = parseJsonBody<ProfilePatch>(event.body ?? null);
            if (!body) return jsonResponse(400, { error: "Invalid JSON body" }, origin);
            return await handlePatch(tableName, sub, body, origin);
        }
        return jsonResponse(405, { error: "Method not allowed" }, origin);
    } catch (err) {
        const e = err as Error;
        console.error("ProfileFn error", { message: e.message, name: e.name });
        return jsonResponse(500, { error: "Internal error" }, origin);
    }
}

async function handleGet(
    tableName: string,
    sub: string,
    fallbackEmail: string | null,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const r = await ddb.send(new BatchGetCommand({
        RequestItems: {
            [tableName]: {
                Keys: [
                    { pk: `USER#${sub}`, sk: "PROFILE" },
                    { pk: `USER#${sub}`, sk: "LINK#arctracker" },
                    { pk: `USER#${sub}`, sk: "LINK#embark" },
                ],
            },
        },
    }));
    const items = r.Responses?.[tableName] ?? [];
    const profile = items.find(i => i.sk === "PROFILE");
    const arc = items.find(i => i.sk === "LINK#arctracker");
    const embark = items.find(i => i.sk === "LINK#embark");

    if (!profile) {
        // First-touch profile creation for email/password signups (which
        // never went through DiscordAuthFn). Idempotent.
        await ddb.send(new UpdateCommand({
            TableName: tableName,
            Key: { pk: `USER#${sub}`, sk: "PROFILE" },
            UpdateExpression: "SET #email = if_not_exists(#email, :e), #createdAt = if_not_exists(#createdAt, :now), #signupProvider = if_not_exists(#signupProvider, :p)",
            ExpressionAttributeNames: {
                "#email": "email",
                "#createdAt": "createdAt",
                "#signupProvider": "signupProvider",
            },
            ExpressionAttributeValues: {
                ":e": fallbackEmail,
                ":now": new Date().toISOString(),
                ":p": "cognito",
            },
        }));
    }

    return jsonResponse(200, {
        sub,
        email: profile?.email ?? fallbackEmail,
        displayName: profile?.displayName ?? null,
        locale: profile?.locale ?? null,
        signupProvider: profile?.signupProvider ?? "cognito",
        links: {
            arctracker: arc
                ? {
                    linked: true,
                    validatedUsername: arc.validatedUsername ?? null,
                    validatedAt: arc.validatedAt ?? null,
                }
                : { linked: false },
            embark: { linked: !!embark },
        },
    }, origin);
}

async function handlePatch(
    tableName: string,
    sub: string,
    body: ProfilePatch,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const updates: Record<string, unknown> = {};
    if (typeof body.displayName === "string") {
        const trimmed = body.displayName.trim();
        if (trimmed.length === 0 || trimmed.length > 64) {
            return jsonResponse(400, { error: "displayName must be 1..64 chars" }, origin);
        }
        updates.displayName = trimmed;
    }
    if (typeof body.locale === "string") {
        if (!SUPPORTED_LOCALES.has(body.locale)) {
            return jsonResponse(400, { error: "Unsupported locale" }, origin);
        }
        updates.locale = body.locale;
    }
    if (Object.keys(updates).length === 0) {
        return jsonResponse(400, { error: "No updatable fields supplied" }, origin);
    }

    const setExpr: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
        setExpr.push(`#${k} = :${k}`);
        names[`#${k}`] = k;
        values[`:${k}`] = v;
    }
    setExpr.push("#updatedAt = :updatedAt");
    names["#updatedAt"] = "updatedAt";
    values[":updatedAt"] = new Date().toISOString();

    await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: `USER#${sub}`, sk: "PROFILE" },
        UpdateExpression: `SET ${setExpr.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
    }));

    return jsonResponse(200, { ok: true, updates }, origin);
}
