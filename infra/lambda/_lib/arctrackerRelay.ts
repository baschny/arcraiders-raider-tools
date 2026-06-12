import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayProxyResultV2 } from "aws-lambda";

const sm = new SecretsManagerClient({});
const ARC_BASE = "https://arctracker.io/api";
const SYNC_SECRET = "raidertools123";

let cachedAppKey: string | null = null;

export interface ForwardArcTrackerRequest {
    subPath: string;
    rawQueryString?: string;
    bearerToken: string;
    origin: string;
    requestHeaders?: Record<string, string | undefined>;
}

export async function forwardArcTrackerRequest(
    req: ForwardArcTrackerRequest,
): Promise<APIGatewayProxyResultV2> {
    const qs = req.rawQueryString ? `?${req.rawQueryString}` : "";
    const upstream = await fetch(`${ARC_BASE}${req.subPath}${qs}`, {
        method: "GET",
        headers: {
            "X-App-Key": await getAppKey(),
            Authorization: `Bearer ${req.bearerToken}`,
            Accept: "application/json",
            ...(req.requestHeaders?.["if-none-match"] ? { "If-None-Match": req.requestHeaders["if-none-match"] } : {}),
            ...(req.requestHeaders?.["if-modified-since"] ? { "If-Modified-Since": req.requestHeaders["if-modified-since"] } : {}),
        },
    });

    const headers = {
        "Access-Control-Allow-Origin": req.origin,
        Vary: "Origin",
        ...pickPassThroughHeaders(upstream.headers),
    };

    if (upstream.status === 304) {
        return { statusCode: 304, headers };
    }

    return {
        statusCode: upstream.status,
        headers: {
            ...headers,
            "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        },
        body: await upstream.text(),
    };
}

async function getAppKey(): Promise<string> {
    if (cachedAppKey) return cachedAppKey;

    if (process.env.RAIDER_TOOLS_LOCAL_DEV === "true") {
        const localAppKey = process.env.ARC_APP_KEY?.trim();
        if (!localAppKey) throw new Error("Missing ARC_APP_KEY");
        cachedAppKey = localAppKey;
        return cachedAppKey;
    }

    const secretArn = process.env.ARC_APP_KEY_SECRET_ARN;
    if (!secretArn) throw new Error("Missing ARC_APP_KEY_SECRET_ARN");

    const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const value = resp.SecretString?.trim();
    if (!value) throw new Error("SecretString empty for ARC app key secret");

    cachedAppKey = value;
    return value;
}

export async function forwardArcTrackerSyncNow(
    bearerToken: string,
    targets: string[],
    origin: string,
): Promise<APIGatewayProxyResultV2> {
    const upstream = await fetch(`${ARC_BASE}/v2/sync-now`, {
        method: "POST",
        headers: {
            "X-App-Key": await getAppKey(),
            Authorization: `Bearer ${bearerToken}`,
            "X-Sync-Secret": SYNC_SECRET,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(targets.length > 0 ? { targets } : {}),
    });

    return {
        statusCode: upstream.status,
        headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
            "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        },
        body: await upstream.text(),
    };
}

function pickPassThroughHeaders(h: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    const limit = h.get("x-ratelimit-limit");
    const remaining = h.get("x-ratelimit-remaining");
    const reset = h.get("x-ratelimit-reset");
    const retryAfter = h.get("retry-after");
    const etag = h.get("etag");
    const lastModified = h.get("last-modified");
    if (limit) out["X-RateLimit-Limit"] = limit;
    if (remaining) out["X-RateLimit-Remaining"] = remaining;
    if (reset) {
        out["X-RateLimit-Reset"] = reset;
        if (!retryAfter) {
            const resetEpoch = Number(reset);
            if (Number.isFinite(resetEpoch)) {
                const now = Math.floor(Date.now() / 1000);
                out["Retry-After"] = String(Math.max(0, resetEpoch - now));
            }
        }
    }
    if (retryAfter) out["Retry-After"] = retryAfter;
    if (etag) out.ETag = etag;
    if (lastModified) out["Last-Modified"] = lastModified;
    return out;
}
