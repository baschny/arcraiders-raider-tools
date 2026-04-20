/**
 * Thin wrapper around `amazon-cognito-identity-js` for the raider-tools SPA.
 *
 * Goals:
 *  - Keep call sites tiny and Promise-based.
 *  - Centralize the "where do we cache the session" decision (the SDK itself
 *    uses localStorage by default, which is fine for phase 1).
 *  - Provide a single `getIdToken()` that auto-refreshes when expired.
 *  - Provide `acceptTokensFromHash()` so the Discord-bridge redirect can
 *    seed a session into the SDK's local cache without password sign-in.
 */

import {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails,
    CognitoUserAttribute,
    CognitoUserSession,
    CognitoIdToken,
    CognitoAccessToken,
    CognitoRefreshToken,
    type ISignUpResult,
    type ICognitoUserPoolData,
} from 'amazon-cognito-identity-js';
import {
    getDevIdToken,
    getDevSession,
    isDevAuthEnabled,
    signOutDevUser,
} from './devAuthClient';

const POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;

let pool: CognitoUserPool | null = null;

/**
 * Returns true when either a real Cognito pool is configured OR the
 * local dev-auth flag is enabled. Callers use this to decide whether
 * to render sign-in UI; both backends plug into the same context.
 */
export function isCognitoConfigured(): boolean {
    if (isDevAuthEnabled()) return true;
    return !!POOL_ID && !!CLIENT_ID;
}

function getPool(): CognitoUserPool {
    if (pool) return pool;
    if (!POOL_ID || !CLIENT_ID) {
        throw new Error(
            'Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.',
        );
    }
    const data: ICognitoUserPoolData = { UserPoolId: POOL_ID, ClientId: CLIENT_ID };
    pool = new CognitoUserPool(data);
    return pool;
}

function userByEmail(email: string): CognitoUser {
    return new CognitoUser({ Username: email, Pool: getPool() });
}

export interface AuthSession {
    idToken: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    sub: string;
    email: string | null;
}

function sessionToAuth(session: CognitoUserSession): AuthSession {
    const idToken = session.getIdToken();
    const payload = idToken.decodePayload();
    return {
        idToken: idToken.getJwtToken(),
        accessToken: session.getAccessToken().getJwtToken(),
        refreshToken: session.getRefreshToken().getToken(),
        expiresAt: idToken.getExpiration() * 1000,
        sub: typeof payload.sub === 'string' ? payload.sub : '',
        email: typeof payload.email === 'string' ? payload.email : null,
    };
}

function devAuthUnavailable(api: string): never {
    throw new Error(`${api} is not available in dev-auth mode`);
}

export async function signUp(email: string, password: string): Promise<ISignUpResult> {
    if (isDevAuthEnabled()) return devAuthUnavailable('signUp');
    const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    return new Promise((resolve, reject) => {
        getPool().signUp(email, password, attrs, [], (err, result) => {
            if (err || !result) return reject(err ?? new Error('signUp returned no result'));
            resolve(result);
        });
    });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
    if (isDevAuthEnabled()) return devAuthUnavailable('confirmSignUp');
    return new Promise((resolve, reject) => {
        userByEmail(email).confirmRegistration(code, true, err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

export async function resendConfirmationCode(email: string): Promise<void> {
    if (isDevAuthEnabled()) return devAuthUnavailable('resendConfirmationCode');
    return new Promise((resolve, reject) => {
        userByEmail(email).resendConfirmationCode(err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
    if (isDevAuthEnabled()) return devAuthUnavailable('signIn');
    const user = userByEmail(email);
    const details = new AuthenticationDetails({ Username: email, Password: password });
    return new Promise((resolve, reject) => {
        user.authenticateUser(details, {
            onSuccess: session => resolve(sessionToAuth(session)),
            onFailure: err => reject(err),
            // Keep the flow simple: phase 1 does not use NEW_PASSWORD_REQUIRED, MFA, etc.
        });
    });
}

export function signOut(): void {
    if (isDevAuthEnabled()) {
        signOutDevUser();
        return;
    }
    const user = getPool().getCurrentUser();
    if (user) user.signOut();
}

/**
 * Returns a fresh ID token, refreshing through Cognito if needed. Returns
 * null when the user is not signed in.
 *
 * In dev-auth mode this returns the unsigned `dev.<sub>[.<email>]` token
 * the local API server parses as JWT claims.
 */
export async function getIdToken(): Promise<string | null> {
    if (isDevAuthEnabled()) return getDevIdToken();
    const user = getPool().getCurrentUser();
    if (!user) return null;
    return new Promise(resolve => {
        user.getSession((err: Error | null, session: CognitoUserSession | null) => {
            if (err || !session || !session.isValid()) return resolve(null);
            resolve(session.getIdToken().getJwtToken());
        });
    });
}

/**
 * Returns the current parsed session (or null). Does not refresh; callers that
 * need a guaranteed-fresh ID token should use `getIdToken()`.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
    if (isDevAuthEnabled()) return getDevSession();
    const user = getPool().getCurrentUser();
    if (!user) return null;
    return new Promise(resolve => {
        user.getSession((err: Error | null, session: CognitoUserSession | null) => {
            if (err || !session || !session.isValid()) return resolve(null);
            resolve(sessionToAuth(session));
        });
    });
}

/**
 * Seed the Cognito JS SDK's local session cache from raw tokens that were
 * delivered via the URL fragment by the Discord OAuth bridge.
 *
 * We construct a CognitoUserSession from the three JWTs and call
 * `setSignInUserSession`, which is what the SDK does internally after a
 * successful authenticateUser call. This makes the user appear "signed in"
 * to the rest of the app, including future calls to `getIdToken()` /
 * `getCurrentSession()` and refresh-on-expiry.
 */
export function acceptTokensFromHash(params: {
    idToken: string;
    accessToken: string;
    refreshToken: string;
}): AuthSession {
    if (isDevAuthEnabled()) return devAuthUnavailable('acceptTokensFromHash');
    const idToken = new CognitoIdToken({ IdToken: params.idToken });
    const accessToken = new CognitoAccessToken({ AccessToken: params.accessToken });
    const refreshToken = new CognitoRefreshToken({ RefreshToken: params.refreshToken });
    const session = new CognitoUserSession({
        IdToken: idToken,
        AccessToken: accessToken,
        RefreshToken: refreshToken,
    });
    const payload = idToken.decodePayload();
    const username = (payload['cognito:username'] as string | undefined) ?? (payload.sub as string);
    const user = new CognitoUser({ Username: username, Pool: getPool() });
    user.setSignInUserSession(session);
    return sessionToAuth(session);
}
