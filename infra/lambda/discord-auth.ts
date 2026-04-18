/**
 * Discord OAuth bridge Lambda.
 *
 * GET /auth/discord/start?return=<spa_url>
 *   -> 302 redirect to Discord with a signed `state` containing the SPA
 *      return URL.
 *
 * GET /auth/discord/callback?code=...&state=...
 *   -> exchanges the authorization code for a Discord access token,
 *      fetches `/users/@me`, looks up or creates the matching Cognito
 *      user, completes Cognito CUSTOM_AUTH using a fresh single-use
 *      nonce, then 302-redirects the user back to the SPA with the
 *      Cognito tokens in the URL fragment (so they don't hit the API
 *      Gateway access logs as query params).
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminGetUserCommand,
    AdminInitiateAuthCommand,
    AdminRespondToAuthChallengeCommand,
    AdminSetUserPasswordCommand,
    AdminUpdateUserAttributesCommand,
    UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDiscordSecret } from "./_lib/discordSecret";

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";

const NONCE_TTL_SECONDS = 5 * 60;

interface DiscordUser {
    id: string;
    username: string;
    global_name?: string | null;
    email?: string | null;
    verified?: boolean;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const path = event.rawPath || "";
    try {
        if (path.endsWith("/auth/discord/start")) return await handleStart(event);
        if (path.endsWith("/auth/discord/callback")) return await handleCallback(event);
        return { statusCode: 404, body: "Not found" };
    } catch (err) {
        const e = err as Error;
        console.error("DiscordAuthFn error", { message: e.message, name: e.name });
        return { statusCode: 500, body: "Internal error" };
    }
}

// ---------------------------------------------------------------------------
// /auth/discord/start
// ---------------------------------------------------------------------------
async function handleStart(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const requested = event.queryStringParameters?.return ?? process.env.SPA_ORIGIN ?? "";
    const returnUrl = pickValidReturnUrl(requested, allowed);
    if (!returnUrl) {
        return { statusCode: 400, body: "Invalid return URL" };
    }

    // Discord defaults to showing the consent screen on every visit. We opt
    // into the "silent" flow with `prompt=none`: returning users redirect
    // straight back with an authorization code; first-time (or revoked)
    // users cause Discord to respond with an error that the callback
    // handler catches and retries WITHOUT `prompt=none`, so the consent
    // screen is shown exactly once.
    //
    // `?consent=1` on the start URL explicitly forces the consent screen
    // (used by the callback's retry path, and useful for testing).
    const forceConsent = event.queryStringParameters?.consent === "1";

    const secret = await getDiscordSecret();
    const state = signState({ r: returnUrl, n: randomBytes(8).toString("hex"), t: Date.now() }, secret.stateSigningKey);
    const redirectUri = process.env.DISCORD_REDIRECT_URI!;

    const url = new URL(DISCORD_AUTHORIZE_URL);
    url.searchParams.set("client_id", secret.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "identify email");
    url.searchParams.set("prompt", forceConsent ? "consent" : "none");
    url.searchParams.set("state", state);

    return {
        statusCode: 302,
        headers: { Location: url.toString() },
    };
}

// ---------------------------------------------------------------------------
// /auth/discord/callback
// ---------------------------------------------------------------------------
async function handleCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    // Discord signals a silent-auth failure (no existing grant, or grant was
    // revoked) by redirecting here with `?error=...` instead of `?code=...`.
    // We recover by bouncing the browser back to /auth/discord/start with
    // `consent=1`, which triggers the real consent screen. This keeps the
    // happy path silent while still handling first-time / revoked users.
    const discordError = event.queryStringParameters?.error;
    if (discordError) {
        const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
        const stateParam = event.queryStringParameters?.state ?? "";
        const secret = await getDiscordSecret();
        const decoded = verifyState(stateParam, secret.stateSigningKey);
        // Recover only for the prompt=none-specific errors. Anything else is a
        // real failure we should surface to the user as-is.
        const recoverable = new Set(["consent_required", "login_required", "interaction_required", "account_selection_required"]);
        if (decoded && recoverable.has(discordError)) {
            const origin = `${new URL(decoded.r).protocol}//${new URL(decoded.r).host}`;
            if (allowed.includes(origin)) {
                const redirectBack = `${process.env.DISCORD_REDIRECT_URI!.replace("/auth/discord/callback", "/auth/discord/start")}?consent=1&return=${encodeURIComponent(origin)}`;
                return { statusCode: 302, headers: { Location: redirectBack } };
            }
        }
        return { statusCode: 400, body: `Discord returned error: ${discordError}` };
    }

    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    if (!code || !state) return { statusCode: 400, body: "Missing code or state" };

    const secret = await getDiscordSecret();
    const decoded = verifyState(state, secret.stateSigningKey);
    if (!decoded) return { statusCode: 400, body: "Invalid state" };

    const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const returnUrl = pickValidReturnUrl(decoded.r, allowed);
    if (!returnUrl) return { statusCode: 400, body: "Invalid return URL" };

    // 1. Exchange the code for a Discord access token.
    const tokenResp = await fetch(DISCORD_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: secret.clientId,
            client_secret: secret.clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI!,
        }).toString(),
    });
    if (!tokenResp.ok) return { statusCode: 502, body: "Discord token exchange failed" };
    const tokenJson = await tokenResp.json() as { access_token?: string };
    if (!tokenJson.access_token) return { statusCode: 502, body: "Discord token exchange invalid" };

    // 2. Fetch the Discord user profile.
    const meResp = await fetch(DISCORD_ME_URL, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meResp.ok) return { statusCode: 502, body: "Discord /users/@me failed" };
    const me = await meResp.json() as DiscordUser;
    if (!me.id) return { statusCode: 502, body: "Discord profile missing id" };

    // 3. Look up or create the matching Cognito user.
    const userPoolId = process.env.USER_POOL_ID!;
    const userPoolClientId = process.env.USER_POOL_CLIENT_ID!;
    const tableName = process.env.USER_TABLE_NAME!;

    let cognitoUsername = await lookupDiscordMapping(tableName, me.id);
    if (!cognitoUsername) {
        cognitoUsername = await createCognitoUserForDiscord(userPoolId, me, tableName);
    } else {
        // Make sure the user actually still exists in the pool (the IdP
        // mapping could have outlived a deletion); if not, recreate.
        try {
            await cognito.send(new AdminGetUserCommand({
                UserPoolId: userPoolId,
                Username: cognitoUsername,
            }));
        } catch (err) {
            if (err instanceof UserNotFoundException) {
                cognitoUsername = await createCognitoUserForDiscord(userPoolId, me, tableName);
            } else {
                throw err;
            }
        }
    }

    // 4. Mint a single-use nonce and store it in DynamoDB with a TTL so
    //    `VerifyAuthFn` (Cognito custom-auth trigger) can authorize this
    //    sign-in attempt.
    const nonce = randomBytes(32).toString("hex");
    const nonceSig = hmac(nonce, secret.stateSigningKey);
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: {
            pk: `NONCE#${nonce}`,
            sk: "NONCE",
            cognitoUsername,
            discordId: me.id,
            createdAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
        },
    }));

    // 5. Run Cognito custom-auth to obtain ID/refresh tokens.
    const init = await cognito.send(new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: userPoolClientId,
        AuthFlow: "CUSTOM_AUTH",
        AuthParameters: { USERNAME: cognitoUsername },
    }));
    if (!init.Session) return { statusCode: 500, body: "Cognito did not return a session" };

    const respond = await cognito.send(new AdminRespondToAuthChallengeCommand({
        UserPoolId: userPoolId,
        ClientId: userPoolClientId,
        ChallengeName: "CUSTOM_CHALLENGE",
        Session: init.Session,
        ChallengeResponses: {
            USERNAME: cognitoUsername,
            ANSWER: `${nonce}.${nonceSig}`,
        },
    }));
    const result = respond.AuthenticationResult;
    if (!result?.IdToken || !result.RefreshToken) {
        return { statusCode: 500, body: "Cognito custom-auth did not return tokens" };
    }

    // 6. Redirect back to the SPA with tokens in the fragment.
    const fragment = new URLSearchParams({
        id_token: result.IdToken,
        access_token: result.AccessToken ?? "",
        refresh_token: result.RefreshToken,
        expires_in: String(result.ExpiresIn ?? 3600),
        provider: "discord",
    }).toString();
    const target = `${returnUrl}#${fragment}`;

    return {
        statusCode: 302,
        headers: { Location: target },
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickValidReturnUrl(candidate: string, allowed: string[]): string | null {
    if (!candidate) return null;
    try {
        const u = new URL(candidate);
        const origin = `${u.protocol}//${u.host}`;
        if (!allowed.includes(origin)) return null;
        // Always redirect back to a known callback path on the SPA.
        u.pathname = "/auth/callback";
        u.search = "";
        u.hash = "";
        return u.toString();
    } catch {
        return null;
    }
}

interface SignedState {
    /** Return URL */
    r: string;
    /** Nonce */
    n: string;
    /** Timestamp (ms) */
    t: number;
}

function signState(payload: SignedState, key: string): string {
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = hmac(b64, key);
    return `${b64}.${sig}`;
}

function verifyState(token: string, key: string): SignedState | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [b64, sig] = parts;
    const expected = hmac(b64, key);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const decoded = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as SignedState;
        if (Date.now() - decoded.t > 10 * 60 * 1000) return null; // 10 min max
        return decoded;
    } catch {
        return null;
    }
}

function hmac(value: string, base64Key: string): string {
    return createHmac("sha256", Buffer.from(base64Key, "base64")).update(value).digest("hex");
}

async function lookupDiscordMapping(tableName: string, discordId: string): Promise<string | null> {
    const r = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: `IDP#discord#${discordId}`, sk: "USER" },
    }));
    const username = r.Item?.cognitoUsername;
    return typeof username === "string" ? username : null;
}

async function createCognitoUserForDiscord(
    userPoolId: string,
    discordUser: DiscordUser,
    tableName: string,
): Promise<string> {
    // The user pool is configured with `signInAliases: { email: true }`,
    // which makes Cognito require the `Username` of AdminCreateUser to
    // *look* like an email; the actual internal username stored in the
    // pool is an auto-generated UUID that we must read back from the
    // response and use for every subsequent admin call.
    const email = discordUser.email ?? `discord-${discordUser.id}@no-email.raider-tools.app`;
    const displayName = discordUser.global_name || discordUser.username;

    const created = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        MessageAction: "SUPPRESS",
        UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: discordUser.verified ? "true" : "false" },
            { Name: "custom:discord_id", Value: discordUser.id },
            { Name: "preferred_username", Value: displayName },
        ],
    }));

    const internalUsername = created.User?.Username;
    if (!internalUsername) {
        throw new Error("AdminCreateUser did not return an internal Username");
    }

    // Set a long random password so the account isn't FORCE_CHANGE_PASSWORD,
    // and immediately mark it as Confirmed. Users sign in via custom-auth
    // (Discord) only; they cannot brute-force the password because they
    // never know it and email/password sign-in for these usernames is not
    // exposed by the SPA.
    await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: internalUsername,
        Password: randomBytes(24).toString("base64") + "Aa1!",
        Permanent: true,
    }));

    // Re-verify the email attribute if Discord said the email was verified
    // (AdminCreateUser does not always honor email_verified=true on first
    // create when email auto-verify is on).
    if (discordUser.verified && discordUser.email) {
        await cognito.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: internalUsername,
            UserAttributes: [{ Name: "email_verified", Value: "true" }],
        }));
    }

    const sub = created.User?.Attributes?.find(a => a.Name === "sub")?.Value ?? internalUsername;

    // Persist the IdP mapping AND a profile row. `cognitoUsername` stores
    // Cognito's internal UUID so the Discord-bridge login path and the
    // custom-auth triggers both see the exact same identifier.
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: {
            pk: `IDP#discord#${discordUser.id}`,
            sk: "USER",
            cognitoUsername: internalUsername,
            sub,
            email,
            createdAt: new Date().toISOString(),
        },
    }));
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: {
            pk: `USER#${sub}`,
            sk: "PROFILE",
            displayName,
            email: discordUser.email ?? null,
            signupProvider: "discord",
            discordId: discordUser.id,
            createdAt: new Date().toISOString(),
        },
    }));

    return internalUsername;
}
