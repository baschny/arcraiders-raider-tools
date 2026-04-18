/**
 * Loads the Discord OAuth credentials + HMAC state-signing key from
 * Secrets Manager, with per-warm-container caching.
 */

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export interface DiscordOAuthSecret {
    clientId: string;
    clientSecret: string;
    /** Base64-encoded random key (>=32 bytes) used to HMAC the OAuth `state`. */
    stateSigningKey: string;
}

const sm = new SecretsManagerClient({});
let cached: DiscordOAuthSecret | null = null;

export async function getDiscordSecret(): Promise<DiscordOAuthSecret> {
    if (cached) return cached;

    const arn = process.env.DISCORD_SECRET_ARN;
    if (!arn) throw new Error("Missing DISCORD_SECRET_ARN");

    const resp = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
    if (!resp.SecretString) throw new Error("Discord secret is empty");

    const parsed = JSON.parse(resp.SecretString) as Partial<DiscordOAuthSecret>;
    if (!parsed.clientId || !parsed.clientSecret || !parsed.stateSigningKey) {
        throw new Error("Discord secret missing one of: clientId, clientSecret, stateSigningKey");
    }
    if (parsed.clientId === "PLACEHOLDER" || parsed.clientSecret === "PLACEHOLDER") {
        throw new Error("Discord secret still contains PLACEHOLDER values; populate it post-deploy");
    }

    cached = parsed as DiscordOAuthSecret;
    return cached;
}
