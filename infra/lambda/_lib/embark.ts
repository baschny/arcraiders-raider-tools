import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const secrets = new SecretsManagerClient({});
const ssm = new SSMClient({});

export const EMBARK_AUTH_BASE_URL = "https://auth.embark.net";
export const EMBARK_API_BASE_URL = "https://api-gateway.europe.es-pio.net";
export const EMBARK_CLIENT_ID = "embark-pioneer";
export const EMBARK_SCOPE = "pioneer openid offline";
export const EMBARK_AUDIENCE = "https://pioneer.embark.net";
export const EMBARK_TENANCY = "pioneer-live";

export interface EmbarkOauthSecret {
    clientSecret: string;
}

export interface EmbarkRequestConfig {
    manifestId: string;
    userAgent: string;
}

export interface EmbarkTokenPayload {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
    [key: string]: unknown;
}

export interface EmbarkProfile {
    accountId?: string;
    countryCode?: string;
    createdAt?: number;
    dateOfBirth?: string;
    displayName?: {
        discriminator?: string;
        name?: string;
    };
    displayNameCooldownEndsAt?: number;
    email?: string;
    emailIsVerified?: boolean;
    emailVerifiedAt?: number;
    isSpender?: boolean;
    tenancyUserId?: string;
    thirdPartyLastSeenAccountName?: string;
    thirdPartyUserId?: string;
    tos_version_seen?: string;
    voiceChatModerationConsent?: boolean;
    [key: string]: unknown;
}

interface CachedSecret<T> {
    loadedAt: number;
    value: T;
}

let cachedOauthSecret: CachedSecret<EmbarkOauthSecret> | null = null;
let cachedConfig: CachedSecret<EmbarkRequestConfig> | null = null;

const CACHE_MS = 60_000;

export function generatePkcePair(): { verifier: string; challenge: string } {
    const verifier = cryptoRandomUrlSafe(32);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

export function generateEmbarkState(): string {
    return cryptoRandomUrlSafe(24);
}

export function generateEmbarkSupportId(): string {
    return `embark-${cryptoRandomUrlSafe(9)}`;
}

export function parseJwtExpirationIso(token: string | undefined): string | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown };
        if (typeof payload.exp !== "number") return null;
        return new Date(payload.exp * 1000).toISOString();
    } catch {
        return null;
    }
}

export async function getEmbarkOauthSecret(): Promise<EmbarkOauthSecret> {
    const localClientSecret = process.env.EMBARK_OAUTH_CLIENT_SECRET?.trim();
    if (localClientSecret) {
        return { clientSecret: localClientSecret };
    }

    if (cachedOauthSecret && Date.now() - cachedOauthSecret.loadedAt < CACHE_MS) {
        return cachedOauthSecret.value;
    }

    const secretArn = process.env.EMBARK_OAUTH_SECRET_ARN;
    if (!secretArn) throw new Error("Missing EMBARK_OAUTH_SECRET_ARN");

    const resp = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secretString = resp.SecretString;
    if (!secretString) throw new Error("Embark OAuth secret missing SecretString");

    const parsed = JSON.parse(secretString) as Partial<EmbarkOauthSecret>;
    if (!parsed.clientSecret) throw new Error("Embark OAuth secret missing clientSecret");

    const value = { clientSecret: parsed.clientSecret };
    cachedOauthSecret = { loadedAt: Date.now(), value };
    return value;
}

export async function getEmbarkRequestConfig(): Promise<EmbarkRequestConfig> {
    const localManifestId = process.env.EMBARK_MANIFEST_ID?.trim();
    const localUserAgent = process.env.EMBARK_USER_AGENT?.trim();
    if (localManifestId && localUserAgent) {
        return {
            manifestId: localManifestId,
            userAgent: localUserAgent,
        };
    }

    if (cachedConfig && Date.now() - cachedConfig.loadedAt < CACHE_MS) {
        return cachedConfig.value;
    }

    const manifestParam = process.env.EMBARK_MANIFEST_PARAM_NAME;
    const userAgentParam = process.env.EMBARK_USER_AGENT_PARAM_NAME;
    if (!manifestParam || !userAgentParam) {
        throw new Error("Missing Embark config parameter env vars");
    }

    const resp = await ssm.send(new GetParametersCommand({
        Names: [manifestParam, userAgentParam],
        WithDecryption: true,
    }));

    const values = new Map((resp.Parameters ?? []).map((p) => [p.Name, p.Value]));
    const manifestId = values.get(manifestParam)?.trim();
    const userAgent = values.get(userAgentParam)?.trim();
    if (!manifestId || !userAgent) {
        throw new Error("Embark request config missing manifestId or userAgent");
    }

    const value = { manifestId, userAgent };
    cachedConfig = { loadedAt: Date.now(), value };
    return value;
}

export async function exchangeEmbarkCodeForToken(
    code: string,
    verifier: string,
    redirectUri: string,
): Promise<EmbarkTokenPayload> {
    const secret = await getEmbarkOauthSecret();
    const resp = await fetch(`${EMBARK_AUTH_BASE_URL}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: EMBARK_CLIENT_ID,
            client_secret: secret.clientSecret,
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
        }).toString(),
    });

    const bodyText = await resp.text();
    let json: EmbarkTokenPayload | { error?: string; error_description?: string };
    try {
        json = JSON.parse(bodyText) as EmbarkTokenPayload | { error?: string; error_description?: string };
    } catch {
        throw new Error(`Embark token exchange returned invalid JSON (${resp.status})`);
    }

    if (!resp.ok || "error" in json) {
        const message = "error" in json && json.error
            ? `${json.error}: ${json.error_description ?? "Unknown error"}`
            : `HTTP ${resp.status}`;
        throw new Error(`Embark token exchange failed: ${message}`);
    }
    const tokenJson = json as EmbarkTokenPayload;
    if (!tokenJson.access_token) throw new Error("Embark token exchange response missing access_token");
    return tokenJson;
}

export async function fetchEmbarkProfile(accessToken: string): Promise<EmbarkProfile> {
    const config = await getEmbarkRequestConfig();
    const resp = await fetch(`${EMBARK_API_BASE_URL}/v1/shared/profile`, {
        headers: buildEmbarkApiHeaders(accessToken, config),
    });
    if (!resp.ok) {
        const body = sanitizeEmbarkErrorBody(await resp.text());
        console.warn("Embark profile request failed", {
            status: resp.status,
            statusText: resp.statusText,
            body,
        });
        throw new Error(`Embark profile request failed with HTTP ${resp.status}`);
    }
    const profile = await resp.json() as EmbarkProfile & {
        accountId?: number | string;
        tenancyUserId?: number | string;
    };
    return normalizeEmbarkProfile(profile);
}

export async function fetchEmbarkInventory(
    accessToken: string,
    config?: EmbarkRequestConfig,
): Promise<unknown> {
    const requestConfig = config ?? await getEmbarkRequestConfig();
    const resp = await fetch(`${EMBARK_API_BASE_URL}/v1/pioneer/inventory`, {
        headers: buildEmbarkApiHeaders(accessToken, requestConfig),
    });
    if (!resp.ok) {
        const body = sanitizeEmbarkErrorBody(await resp.text());
        console.warn("Embark inventory request failed", {
            status: resp.status,
            statusText: resp.statusText,
            body,
        });
        const err = new Error(`Embark inventory request failed with HTTP ${resp.status}`);
        (err as Error & { status?: number }).status = resp.status;
        throw err;
    }
    return resp.json() as Promise<unknown>;
}

export async function fetchEmbarkQuests(
    accessToken: string,
    config?: EmbarkRequestConfig,
): Promise<unknown> {
    const requestConfig = config ?? await getEmbarkRequestConfig();
    const resp = await fetch(`${EMBARK_API_BASE_URL}/v1/pioneer/quests`, {
        headers: buildEmbarkApiHeaders(accessToken, requestConfig),
    });
    if (!resp.ok) {
        const body = sanitizeEmbarkErrorBody(await resp.text());
        console.warn("Embark quests request failed", {
            status: resp.status,
            statusText: resp.statusText,
            body,
        });
        const err = new Error(`Embark quests request failed with HTTP ${resp.status}`);
        (err as Error & { status?: number }).status = resp.status;
        throw err;
    }
    return resp.json() as Promise<unknown>;
}

export function buildEmbarkAuthorizeUrl(args: {
    provider: string;
    state: string;
    challenge: string;
    redirectUri: string;
}): string {
    const url = new URL(`${EMBARK_AUTH_BASE_URL}/oauth2/authorize`);
    url.searchParams.set("skip_link", "false");
    url.searchParams.set("client_id", EMBARK_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", args.redirectUri);
    url.searchParams.set("code_challenge", args.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", args.state);
    url.searchParams.set("audience", EMBARK_AUDIENCE);
    url.searchParams.set("scope", EMBARK_SCOPE);
    url.searchParams.set("tenancy", EMBARK_TENANCY);
    url.searchParams.set("external_provider_name", args.provider);
    return url.toString();
}

export function buildEmbarkApiHeaders(
    accessToken: string,
    config: EmbarkRequestConfig,
): Record<string, string> {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: "*/*",
        "Accept-Encoding": "gzip",
        "Content-Type": "application/json",
        "User-Agent": config.userAgent,
        "x-embark-manifest-id": config.manifestId,
    };
}

export function computeCountdownMinutes(expiresAt: string | null): number | null {
    if (!expiresAt) return null;
    const expiresMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresMs)) return null;
    return Math.floor((expiresMs - Date.now()) / 60_000);
}

export function safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}

function cryptoRandomUrlSafe(byteLength: number): string {
    return randomBytes(byteLength).toString("base64url");
}

function normalizeEmbarkProfile(
    profile: EmbarkProfile & {
        accountId?: number | string;
        tenancyUserId?: number | string;
    },
): EmbarkProfile {
    return {
        ...profile,
        accountId: stringifyLargeNumericId(profile.accountId),
        tenancyUserId: stringifyLargeNumericId(profile.tenancyUserId),
    };
}

function stringifyLargeNumericId(value: number | string | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    return typeof value === "string" ? value : String(value);
}

function sanitizeEmbarkErrorBody(bodyText: string): unknown {
    const trimmed = bodyText.trim();
    if (!trimmed) return null;
    try {
        return redactSensitiveFields(JSON.parse(trimmed));
    } catch {
        return trimmed.slice(0, 500);
    }
}

function redactSensitiveFields(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.slice(0, 20).map(redactSensitiveFields);
    }
    if (!value || typeof value !== "object") {
        return value;
    }

    const sensitiveKeys = new Set([
        "access_token",
        "refresh_token",
        "id_token",
        "token",
        "authorization",
        "email",
    ]);
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
        redacted[key] = sensitiveKeys.has(key.toLowerCase())
            ? "[redacted]"
            : redactSensitiveFields(nested);
    }
    return redacted;
}
