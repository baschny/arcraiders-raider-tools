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
    GetCommand,
    UpdateCommand,
    BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    jsonResponse,
    pickAllowedOrigin,
    jwtSub,
    jwtEmail,
    jwtGroups,
    hasJwtGroup,
    parseJsonBody,
} from "./_lib/http";
import { computeCountdownMinutes, type EmbarkProfile } from "./_lib/embark";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SUPPORTED_LOCALES = new Set(["en", "de", "pt-BR"]);
const GAME_DATA_SOURCES = new Set(["arctracker", "embark"]);
const EMBARK_AUTH_GROUP = "embark-auth";

interface ProfilePatch {
    displayName?: string;
    locale?: string;
    gameDataSource?: "arctracker" | "embark";
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
            return await handleGet(tableName, sub, jwtEmail(event), origin, event);
        }
        if (method === "PATCH") {
            const body = parseJsonBody<ProfilePatch>(event.body ?? null);
            if (!body) return jsonResponse(400, { error: "Invalid JSON body" }, origin);
            return await handlePatch(tableName, sub, body, origin, event);
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
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
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
    const embarkExpiresAt =
        typeof embark?.expiresAt === "string" ? embark.expiresAt : null;
    const embarkCountdownMinutes = computeCountdownMinutes(embarkExpiresAt);

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

    const storedGameDataSource = profile?.gameDataSource === "embark" || profile?.gameDataSource === "arctracker"
        ? profile.gameDataSource
        : null;
    const rawEmbarkGroups = event.requestContext.authorizer?.jwt?.claims?.["cognito:groups"];
    const parsedEmbarkGroups = jwtGroups(event);
    const embarkAccessEnabled = hasJwtGroup(event, EMBARK_AUTH_GROUP);
    console.info("ProfileFn embark gate", {
        sub,
        rawGroups: rawEmbarkGroups,
        parsedGroups: parsedEmbarkGroups,
        embarkAccessEnabled,
    });
    const effectiveGameDataSource =
        storedGameDataSource === "embark" && embark && embarkAccessEnabled
            ? "embark"
            : storedGameDataSource === "arctracker"
                ? "arctracker"
                : "arctracker";

    return jsonResponse(200, {
        sub,
        email: profile?.email ?? fallbackEmail,
        displayName: profile?.displayName ?? null,
        locale: profile?.locale ?? null,
        signupProvider: profile?.signupProvider ?? "cognito",
        // Defaults to false when the flag is absent so the client can detect
        // a brand-new user and run the one-shot local→server migration.
        dataMigrationCompleted: profile?.dataMigrationCompleted === true,
        gameDataSource: effectiveGameDataSource,
        features: {
            embarkEnabled: embarkAccessEnabled,
        },
        links: {
            arctracker: arc
                ? {
                    linked: true,
                    validatedUsername: arc.validatedUsername ?? null,
                    validatedAt: arc.validatedAt ?? null,
                }
                : { linked: false },
            embark: embark
                ? {
                    linked: true,
                    provider: embark.provider ?? null,
                    supportId: embark.supportId ?? null,
                    expiresAt: embarkExpiresAt,
                    linkedAt: embark.linkedAt ?? null,
                    profileFetchedAt: embark.profileFetchedAt ?? null,
                    expired: embarkCountdownMinutes !== null ? embarkCountdownMinutes <= 0 : false,
                    countdownMinutes: embarkCountdownMinutes,
                    profile: (embark.cachedProfile ?? null) as EmbarkProfile | null,
                }
                : { linked: false },
        },
    }, origin);
}

async function handlePatch(
    tableName: string,
    sub: string,
    body: ProfilePatch,
    origin: string,
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
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
    if (typeof body.gameDataSource === "string") {
        if (!GAME_DATA_SOURCES.has(body.gameDataSource)) {
            return jsonResponse(400, { error: "Unsupported gameDataSource" }, origin);
        }
        if (body.gameDataSource === "embark") {
            if (!hasJwtGroup(event, EMBARK_AUTH_GROUP)) {
                return jsonResponse(403, { error: "not_enabled" }, origin);
            }
            const link = await ddb.send(new GetCommand({
                TableName: tableName,
                Key: { pk: `USER#${sub}`, sk: "LINK#embark" },
            }));
            const embark = link.Item;
            if (!embark) {
                return jsonResponse(400, { error: "not_linked" }, origin);
            }
            const expiresAt = typeof embark.expiresAt === "string" ? Date.parse(embark.expiresAt) : NaN;
            if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                return jsonResponse(400, { error: "token_expired" }, origin);
            }
        }
        updates.gameDataSource = body.gameDataSource;
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
