/**
 * Dev-only auth client used when `VITE_DEV_AUTH=true`.
 *
 * This replaces the Cognito integration with a trivial synthetic identity
 * that the local API server (`infra/local/server.ts`) understands. It is
 * NEVER wired into production builds — the Amplify build command has no
 * `VITE_DEV_AUTH` and the flag is checked at every use site in
 * `cognitoClient.ts` / `CognitoAuthContext.tsx` / `SignIn.tsx`.
 *
 * Token format emitted to the server:
 *
 *   Authorization: Bearer dev.<sub>[.<email>]
 *
 * The server parses this directly as the `{ sub, email }` JWT claims the
 * real handlers expect. There is no cryptographic validation — this
 * module MUST NOT be used anywhere a real JWT is required.
 *
 * Session persistence: the currently signed-in dev user is stored under
 * `rt_dev_auth_user` in `localStorage` so reloads stay signed in and the
 * sign-out wipe in `hydration.ts` clears it naturally (legacy keys).
 */
import type { AuthSession } from './cognitoClient';

const DEV_USER_KEY = 'rt_dev_auth_user';

/** True when the dev-auth flag is set at build time. */
export function isDevAuthEnabled(): boolean {
    return import.meta.env.VITE_DEV_AUTH === 'true';
}

interface DevUserRecord {
    sub: string;
    email: string | null;
}

function readRecord(): DevUserRecord | null {
    try {
        const raw = localStorage.getItem(DEV_USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<DevUserRecord>;
        if (!parsed || typeof parsed.sub !== 'string' || parsed.sub.length === 0) return null;
        return {
            sub: parsed.sub,
            email: typeof parsed.email === 'string' ? parsed.email : null,
        };
    } catch {
        return null;
    }
}

function writeRecord(record: DevUserRecord | null): void {
    try {
        if (record) localStorage.setItem(DEV_USER_KEY, JSON.stringify(record));
        else localStorage.removeItem(DEV_USER_KEY);
    } catch { /* ignore */ }
}

/**
 * Build the unsigned dev bearer token the local API server parses.
 * Keeps the `.` separator the server splits on; email may contain `.`
 * so only the FIRST `.` after `dev.<sub>` is treated as the sub/email
 * boundary.
 */
function tokenFor(record: DevUserRecord): string {
    return record.email ? `dev.${record.sub}.${record.email}` : `dev.${record.sub}`;
}

function recordToSession(record: DevUserRecord): AuthSession {
    return {
        idToken: tokenFor(record),
        accessToken: tokenFor(record),
        refreshToken: `dev-refresh-${record.sub}`,
        // Far-future expiry so the session never "expires" while the app
        // is running. Real Cognito sessions are 1 h; dev sessions are
        // intentionally not.
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        sub: record.sub,
        email: record.email,
    };
}

/** Returns the current dev session (or null). */
export async function getDevSession(): Promise<AuthSession | null> {
    const record = readRecord();
    return record ? recordToSession(record) : null;
}

/** Returns the current dev bearer token (or null). */
export async function getDevIdToken(): Promise<string | null> {
    const record = readRecord();
    return record ? tokenFor(record) : null;
}

/** Persist a dev sign-in. Returns the resulting synthetic session. */
export function signInAsDevUser(sub: string, email: string | null): AuthSession {
    const trimmedSub = sub.trim();
    if (!trimmedSub) throw new Error('Dev sub must be non-empty');
    // Dev tokens use `.` as a separator. Forbid `.` in sub to keep the
    // server parser unambiguous.
    if (trimmedSub.includes('.')) {
        throw new Error("Dev sub must not contain '.'");
    }
    const trimmedEmail = email?.trim() || null;
    const record: DevUserRecord = { sub: trimmedSub, email: trimmedEmail };
    writeRecord(record);
    return recordToSession(record);
}

/** Clear the persisted dev session. */
export function signOutDevUser(): void {
    writeRecord(null);
}
