
/**
 * ArcTracker API Relay Lambda
 *
 * This function acts as a secure reverse proxy between the Raider Tools SPA
 * and the arctracker.io API.
 *
 * It performs the following:
 * 1. Validates the incoming request path (prefixed with /arctracker/).
 * 2. Injects the ArcTracker App Key from AWS Secrets Manager.
 * 3. Forwards the Bearer token from the client.
 * 4. Handles CORS and forwards rate limit headers from the upstream API.
 * 5. Calculates Retry-After if missing during 429 Too Many Requests.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({});

let cachedAppKey: string | null = null;

const ARC_BASE = "https://arctracker.io/api";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "https://raider-tools.app";

    try {
        const path = event.rawPath || "";

        // Check for prefix "/arctracker/"
        if (!path.startsWith("/arctracker/")) {
            return {
                statusCode: 404,
                headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Unknown route" }),
            };
        }

        const subPath = path.substring("/arctracker".length); // "/v2/user/profile"

        const auth = event.headers?.authorization || event.headers?.Authorization;
        if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
            return {
                statusCode: 401,
                headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Missing Authorization bearer token" }),
            };
        }

        const appKey = await getAppKey();

        // Forward query string if present
        const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
        const url = `${ARC_BASE}${subPath}${qs}`;

        const upstream = await fetch(url, {
            method: "GET", // keep explicit; add POST support only if needed
            headers: {
                "X-App-Key": appKey,
                "Authorization": auth,
                "Accept": "application/json",
                // Support conditional requests if you later store ETag client-side:
                ...(event.headers?.["if-none-match"] ? { "If-None-Match": event.headers["if-none-match"] } : {}),
                ...(event.headers?.["if-modified-since"] ? { "If-Modified-Since": event.headers["if-modified-since"] } : {}),
            },
        });

        const rateHeaders = pickRateLimitHeaders(upstream.headers);

        // Pass through 304 without body
        if (upstream.status === 304) {
            return {
                statusCode: 304,
                headers: {
                    ...corsHeaders(allowedOrigin),
                    ...rateHeaders,
                },
            };
        }

        const text = await upstream.text();

        return {
            statusCode: upstream.status,
            headers: {
                ...corsHeaders(allowedOrigin),
                "Content-Type": upstream.headers.get("content-type") ?? "application/json",
                ...rateHeaders,
                // Optionally pass through ETag/Last-Modified if arctracker implements them:
                ...(upstream.headers.get("etag") ? { "ETag": upstream.headers.get("etag")! } : {}),
                ...(upstream.headers.get("last-modified") ? { "Last-Modified": upstream.headers.get("last-modified")! } : {}),
            },
            body: text,
        };
    } catch (err: unknown) {
        const error = err as Error;
        // Do NOT log headers/tokens. Log only minimal info.
        console.error("Relay error:", { message: error?.message, name: error?.name });

        return {
            statusCode: 500,
            headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Internal error" }),
        };
    }
}

function corsHeaders(origin: string) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
    };
}

async function getAppKey(): Promise<string> {
    if (cachedAppKey) return cachedAppKey;

    const secretArn = process.env.ARC_APP_KEY_SECRET_ARN;
    if (!secretArn) throw new Error("Missing ARC_APP_KEY_SECRET_ARN");

    const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const value = resp.SecretString?.trim();
    if (!value) throw new Error("SecretString empty for ARC app key secret");

    cachedAppKey = value;
    return value;
}

function pickRateLimitHeaders(h: Headers) {
    const out: Record<string, string> = {};
    const names = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"];
    for (const n of names) {
        const v = h.get(n);
        if (v) out[n.replace(/^./, (c) => c.toUpperCase())] = v; // not used; we set explicit below
    }
    // Use explicit casing:
    const limit = h.get("x-ratelimit-limit");
    const remaining = h.get("x-ratelimit-remaining");
    const reset = h.get("x-ratelimit-reset");
    if (limit) out["X-RateLimit-Limit"] = limit;
    if (remaining) out["X-RateLimit-Remaining"] = remaining;
    if (reset) out["X-RateLimit-Reset"] = reset;

    // If arctracker returns 429 without Retry-After, we compute it.
    if (reset && !h.get("retry-after")) {
        const resetEpoch = Number(reset);
        if (Number.isFinite(resetEpoch)) {
            const now = Math.floor(Date.now() / 1000);
            const ra = Math.max(0, resetEpoch - now);
            out["Retry-After"] = String(ra);
        }
    }
    const retryAfter = h.get("retry-after");
    if (retryAfter) out["Retry-After"] = retryAfter;

    return out;
}
