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
} from "@aws-sdk/lib-dynamodb";
import {
    buildEmbarkAuthorizeUrl,
    exchangeEmbarkCodeForToken,
    fetchEmbarkProfile,
    generateEmbarkState,
    generatePkcePair,
    parseJwtExpirationIso,
} from "./_lib/embark";
import { encryptToken } from "./_lib/envelope";
import { jsonResponse, jwtSub, parseJsonBody, pickAllowedOrigin } from "./_lib/http";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
    const body = parseJsonBody<StartEmbarkBody>(event.body ?? null);
    const provider = body?.provider?.trim().toLowerCase();
    const returnUrl = body?.returnUrl?.trim();
    if (!provider || !SUPPORTED_PROVIDERS.has(provider)) {
        return jsonResponse(400, { error: "Unsupported provider" }, origin);
    }
    if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
        return jsonResponse(400, { error: "Invalid return URL" }, origin);
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
            createdAt: now,
            ttl: Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS,
        } satisfies PendingEmbarkAuth,
    }));

    console.info("Embark start", {
        sub,
        provider,
        state,
        returnUrl,
        redirectUri,
        verifierPrefix: verifier.slice(0, 8),
        challengePrefix: challenge.slice(0, 12),
    });

    const authUrl = buildEmbarkAuthorizeUrl({
        provider,
        state,
        challenge,
        redirectUri,
    });

    return jsonResponse(200, { authUrl, state, provider }, origin);
}

async function handleComplete(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    sub: string,
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const body = parseJsonBody<CompleteEmbarkBody>(event.body ?? null);
    const code = body?.code?.trim();
    const state = body?.state?.trim();
    if (!code || !state) {
        return jsonResponse(400, { error: "Missing code or state" }, origin);
    }

    const tableName = process.env.USER_TABLE_NAME!;
    const pendingKey = { pk: `USER#${sub}`, sk: `EMBARKAUTH#${state}` };
    const pendingResp = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: pendingKey,
    }));
    const pending = pendingResp.Item as PendingEmbarkAuth | undefined;
    if (!pending) {
        console.warn("Embark complete missing pending state", { sub, state });
        return jsonResponse(400, { error: "Invalid or expired Embark auth state" }, origin);
    }

    const now = new Date().toISOString();
    console.info("Embark complete", {
        sub,
        state,
        codePrefix: code.slice(0, 8),
        provider: pending.provider,
        redirectUri: pending.redirectUri,
        verifierPrefix: pending.verifier.slice(0, 8),
    });

    try {
        const token = await exchangeEmbarkCodeForToken(
            code,
            pending.verifier,
            pending.redirectUri,
        );
        console.info("Embark token exchange ok", {
            sub,
            state,
            provider: pending.provider,
            expiresIn: token.expires_in ?? null,
            hasRefreshToken: Boolean(token.refresh_token),
        });
        const profile = await fetchEmbarkProfile(token.access_token);
        console.info("Embark profile fetch ok", {
            sub,
            state,
            accountId: profile.accountId ?? null,
            tenancyUserId: profile.tenancyUserId ?? null,
            email: profile.email ?? null,
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
                expiresAt,
                linkedAt: now,
                profileFetchedAt: now,
                cachedProfile: profile,
            },
        }));
        console.info("Embark link persisted", {
            sub,
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
        }, origin);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Embark link failed";
        console.error("Embark complete failed", {
            sub,
            state,
            provider: pending.provider,
            redirectUri: pending.redirectUri,
            verifierPrefix: pending.verifier.slice(0, 8),
            message,
        });
        return jsonResponse(502, { error: message }, origin);
    } finally {
        void ddb.send(new DeleteCommand({
            TableName: tableName,
            Key: pendingKey,
        })).then(() => {
            console.info("Embark pending state deleted", { sub, state });
        }).catch((err) => {
            console.warn("Embark pending state delete failed", {
                sub,
                state,
                message: err instanceof Error ? err.message : String(err),
            });
        });
    }
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
