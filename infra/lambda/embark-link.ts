import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DeleteCommand,
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    buildEmbarkAuthorizeUrl,
    exchangeEmbarkCodeForToken,
    fetchEmbarkProfile,
    generateEmbarkState,
    generateEmbarkSupportId,
    generatePkcePair,
    parseJwtExpirationIso,
} from "./_lib/embark";
import { encryptToken } from "./_lib/envelope";
import { hasJwtGroup, jsonResponse, jwtSub, parseJsonBody, pickAllowedOrigin } from "./_lib/http";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EMBARK_AUTH_GROUP = "embark-auth";
const SUPPORTED_PROVIDERS = new Set(["steam", "epic", "playstation", "xbox"]);
const PENDING_TTL_SECONDS = 10 * 60;

interface StartEmbarkBody {
    provider?: string;
    returnUrl?: string;
}

interface CompleteEmbarkBody {
    code?: string;
    state?: string;
}

interface PendingEmbarkAuth {
    pk: string;
    sk: string;
    provider: string;
    verifier: string;
    redirectUri: string;
    returnUrl: string;
    supportId: string;
    createdAt: string;
    ttl: number;
}

export async function handler(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
    const origin = pickAllowedOrigin(event);
    const sub = jwtSub(event);
    if (!sub) return jsonResponse(401, { error: "Unauthenticated" }, origin);

    try {
        const path = event.rawPath || "";
        if (path.endsWith("/me/links/embark/start")) {
            return await handleStart(event, sub, origin);
        }
        if (path.endsWith("/me/links/embark/complete")) {
            return await handleComplete(event, sub, origin);
        }
        return jsonResponse(404, { error: "Not found" }, origin);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("EmbarkLinkFn error", { message });
        return jsonResponse(500, { error: "Internal error" }, origin);
    }
}

async function handleStart(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const supportId = generateEmbarkSupportId();
    if (!hasJwtGroup(event, EMBARK_AUTH_GROUP)) {
        return errorResponse(403, "not_enabled", supportId, origin);
    }
    const body = parseJsonBody<StartEmbarkBody>(event.body ?? null);
    const provider = body?.provider?.trim().toLowerCase();
    const returnUrl = body?.returnUrl?.trim();
    if (!provider || !SUPPORTED_PROVIDERS.has(provider)) {
        console.warn("Embark start unsupported provider", { sub, supportId, provider });
        return errorResponse(400, "Unsupported provider", supportId, origin);
    }
    if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
        console.warn("Embark start invalid return URL", { sub, supportId, returnUrl });
        return errorResponse(400, "Invalid return URL", supportId, origin);
    }

    const { verifier, challenge } = generatePkcePair();
    const state = generateEmbarkState();
    const now = new Date().toISOString();
    const tableName = process.env.USER_TABLE_NAME!;
    const redirectUri = process.env.EMBARK_LOOPBACK_REDIRECT_URI!;

    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: {
            pk: `USER#${sub}`,
            sk: `EMBARKAUTH#${state}`,
            provider,
            verifier,
            redirectUri,
            returnUrl,
            supportId,
            createdAt: now,
            ttl: Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS,
        } satisfies PendingEmbarkAuth,
    }));

    console.info("Embark start", {
        sub,
        supportId,
        provider,
        state,
        returnUrl,
        redirectUri,
    });

    const authUrl = buildEmbarkAuthorizeUrl({
        provider,
        state,
        challenge,
        redirectUri,
    });

    return jsonResponse(200, { authUrl, state, provider, supportId }, origin);
}

async function handleComplete(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const fallbackSupportId = generateEmbarkSupportId();
    if (!hasJwtGroup(event, EMBARK_AUTH_GROUP)) {
        return errorResponse(403, "not_enabled", fallbackSupportId, origin);
    }
    const body = parseJsonBody<CompleteEmbarkBody>(event.body ?? null);
    const code = body?.code?.trim();
    const state = body?.state?.trim();
    if (!code || !state) {
        console.warn("Embark complete missing code or state", {
            sub,
            supportId: fallbackSupportId,
            hasCode: Boolean(code),
            hasState: Boolean(state),
        });
        return errorResponse(400, "Missing code or state", fallbackSupportId, origin);
    }

    const tableName = process.env.USER_TABLE_NAME!;
    const pendingKey = { pk: `USER#${sub}`, sk: `EMBARKAUTH#${state}` };
    const pendingResp = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: pendingKey,
    }));
    const pending = pendingResp.Item as PendingEmbarkAuth | undefined;
    if (!pending) {
        console.warn("Embark complete missing pending state", {
            sub,
            state,
            supportId: fallbackSupportId,
        });
        return errorResponse(400, "Invalid or expired Embark auth state", fallbackSupportId, origin);
    }
    const supportId = pending.supportId ?? fallbackSupportId;
    if (pending.ttl <= Math.floor(Date.now() / 1000)) {
        console.warn("Embark complete expired pending state", {
            sub,
            state,
            supportId,
            provider: pending.provider,
        });
        await ddb.send(new DeleteCommand({
            TableName: tableName,
            Key: pendingKey,
        }));
        return errorResponse(400, "Invalid or expired Embark auth state", supportId, origin);
    }

    const now = new Date().toISOString();
    console.info("Embark complete", {
        sub,
        supportId,
        state,
        provider: pending.provider,
        redirectUri: pending.redirectUri,
    });

    try {
        const token = await exchangeEmbarkCodeForToken(
            code,
            pending.verifier,
            pending.redirectUri,
        );
        console.info("Embark token exchange ok", {
            sub,
            supportId,
            state,
            provider: pending.provider,
            expiresIn: token.expires_in ?? null,
            hasRefreshToken: Boolean(token.refresh_token),
        });
        const profile = await fetchEmbarkProfile(token.access_token);
        console.info("Embark profile fetch ok", {
            sub,
            supportId,
            state,
            accountId: profile.accountId ?? null,
            tenancyUserId: profile.tenancyUserId ?? null,
        });
        const encrypted = await encryptToken(JSON.stringify(token), {
            userId: sub,
            purpose: "link",
            provider: "embark",
        });
        const expiresAt = parseJwtExpirationIso(token.access_token)
            ?? (typeof token.expires_in === "number"
                ? new Date(Date.now() + token.expires_in * 1000).toISOString()
                : null);

        await ddb.send(new PutCommand({
            TableName: tableName,
            Item: {
                pk: `USER#${sub}`,
                sk: "LINK#embark",
                ...encrypted,
                provider: pending.provider,
                supportId,
                expiresAt,
                linkedAt: now,
                profileFetchedAt: now,
                cachedProfile: profile,
            },
        }));
        await ddb.send(new UpdateCommand({
            TableName: tableName,
            Key: { pk: `USER#${sub}`, sk: "PROFILE" },
            UpdateExpression: "SET #gameDataSource = :source, #updatedAt = :now",
            ExpressionAttributeNames: {
                "#gameDataSource": "gameDataSource",
                "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues: {
                ":source": "embark",
                ":now": now,
            },
        }));
        console.info("Embark link persisted", {
            sub,
            supportId,
            state,
            provider: pending.provider,
            expiresAt,
        });

        return jsonResponse(200, {
            linked: true,
            provider: pending.provider,
            expiresAt,
            linkedAt: now,
            profileFetchedAt: now,
            expired: expiresAt ? Date.parse(expiresAt) <= Date.now() : false,
            profile,
            supportId,
        }, origin);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Embark link failed";
        console.error("Embark complete failed", {
            sub,
            supportId,
            state,
            provider: pending.provider,
            redirectUri: pending.redirectUri,
            message,
        });
        return errorResponse(502, message, supportId, origin);
    } finally {
        void ddb.send(new DeleteCommand({
            TableName: tableName,
            Key: pendingKey,
        })).then(() => {
            console.info("Embark pending state deleted", { sub, supportId, state });
        }).catch((err) => {
            console.warn("Embark pending state delete failed", {
                sub,
                supportId,
                state,
                message: err instanceof Error ? err.message : String(err),
            });
        });
    }
}

function errorResponse(
    statusCode: number,
    error: string,
    supportId: string,
    origin: string,
): APIGatewayProxyResultV2 {
    return jsonResponse(statusCode, { error, supportId }, origin);
}

function isAllowedReturnUrl(candidate: string): boolean {
    try {
        const url = new URL(candidate);
        const origin = `${url.protocol}//${url.host}`;
        const allowed = (process.env.ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
        return allowed.includes(origin);
    } catch {
        return false;
    }
}
