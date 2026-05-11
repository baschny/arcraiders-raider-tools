/**
 * CognitoAuthContext
 *
 * Holds the current Cognito session for the SPA. This is *the user identity*
 * (replacing "having a valid ArcTracker token" as our notion of being
 * signed in).
 *
 * Anonymous (signed-out) mode is fully supported: when Cognito is not
 * configured (e.g. in local dev without env vars) or no session is cached,
 * `user` is null and the rest of the app falls back to localStorage-only
 * behavior.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import {
    type AuthSession,
    acceptTokensFromHash,
    getCurrentSession,
    isCognitoConfigured,
    signIn as cognitoSignIn,
    signOut as cognitoSignOut,
    signUp as cognitoSignUp,
    confirmSignUp as cognitoConfirmSignUp,
} from '../auth/cognitoClient';
import {
    isDevAuthEnabled,
    signInAsDevUser as devSignInAs,
} from '../auth/devAuthClient';
import {
    hydrateAllLocal,
    runPostSignInSync,
    runSignOutWipe,
} from '../state/hydration';
import { installGlobalFlushHooks } from '../state/stores';
import { classifyError } from '../state/userStateStore';
import {
    reportSyncError,
    clearSyncError,
    setRetryHandler,
} from '../state/syncStatus';
import { setCacheOwner } from '../services/cacheService';

interface CognitoAuthContextValue {
    /** True when the SPA has Cognito env vars configured (or dev-auth is on). */
    available: boolean;
    /** True when the SPA is running in dev-auth (local/offline) mode. */
    devAuth: boolean;
    /** True while we are checking for an existing session on mount. */
    initializing: boolean;
    /** Current signed-in user or null. */
    user: AuthSession | null;
    /** Sign in with email + password. Throws on error. */
    signInWithPassword(email: string, password: string): Promise<void>;
    /** Self-sign-up; user must then confirm via email code. */
    signUpWithPassword(email: string, password: string): Promise<void>;
    /** Confirm a freshly signed-up user with the email code. */
    confirmSignUp(email: string, code: string): Promise<void>;
    /** Redirect the browser to the Discord OAuth bridge. */
    startDiscordSignIn(): void;
    /**
     * Dev-only: sign in as a synthetic user against the local API server.
     * Only works when `VITE_DEV_AUTH=true`; throws otherwise.
     */
    signInAsDevUser(sub: string, email?: string | null): void;
    /** Sign the user out (clears Cognito local cache). */
    signOut(): void;
}

const Ctx = createContext<CognitoAuthContextValue | null>(null);

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    'https://api.raider-tools.app';

interface ProviderProps {
    children: ReactNode;
}

export function CognitoAuthProvider({ children }: ProviderProps) {
    const devAuth = isDevAuthEnabled();
    const available = isCognitoConfigured();
    // When neither Cognito nor dev-auth is configured we have nothing to
    // initialize — skip the "initializing" gate entirely.
    const [initializing, setInitializing] = useState<boolean>(() => available);
    const [user, setUser] = useState<AuthSession | null>(null);
    // Tracks which user sub we've already run the post-sign-in sync for
    // in this tab, so we don't re-hit the endpoints on every re-render.
    const syncedForSubRef = useRef<string | null>(null);

    // On mount (independent of Cognito availability): hydrate every user-
    // state store from localStorage so the UI renders with the correct
    // data immediately, and install the tab-lifecycle flush hooks.
    useEffect(() => {
        installGlobalFlushHooks();
        void hydrateAllLocal();
    }, []);

    // On mount when sign-in IS configured (Cognito or dev-auth):
    //   - Cognito: 1) consume tokens from the URL fragment if present,
    //              2) hydrate any cached session from the SDK.
    //   - dev-auth: just hydrate whatever is in localStorage.
    useEffect(() => {
        if (!available) return;

        if (!devAuth) {
            const hashParams = parseHashTokens(window.location.hash);
            if (hashParams) {
                try {
                    const session = acceptTokensFromHash(hashParams);
                    setUser(session);
                    // Strip the fragment from the URL without leaving history junk.
                    history.replaceState(null, '', window.location.pathname + window.location.search);
                    setInitializing(false);
                    return;
                } catch (err) {
                    console.warn('Failed to consume hash tokens', err);
                }
            }
        }

        getCurrentSession()
            .then(s => setUser(s))
            .finally(() => setInitializing(false));
    }, [available, devAuth]);

    // Whenever the signed-in user changes, run the post-sign-in sync
    // (migration or server-wins hydrate) exactly once per sub. Failures
    // are surfaced via the sync-status aggregator so the UI can show a
    // banner and the user can retry manually.
    useEffect(() => {
        if (!user) return;
        void setCacheOwner(user.sub);
        if (syncedForSubRef.current === user.sub) return;
        syncedForSubRef.current = user.sub;
        runPostSignInSync()
            .then(() => clearSyncError('post-sign-in'))
            .catch(err => {
                console.error('[raider-tools sync] post-sign-in sync failed', err);
                reportSyncError('post-sign-in', classifyError(err, 'read'));
            });
    }, [user]);

    // Register the retry handler that the banner's Retry button calls.
    // It re-runs the post-sign-in flow for the currently signed-in user.
    useEffect(() => {
        if (!user) {
            setRetryHandler(null);
            return;
        }
        setRetryHandler(async () => {
            try {
                await runPostSignInSync();
                clearSyncError('post-sign-in');
            } catch (err) {
                console.error('[raider-tools sync] post-sign-in retry failed', err);
                reportSyncError('post-sign-in', classifyError(err, 'read'));
                throw err;
            }
        });
        return () => setRetryHandler(null);
    }, [user]);

    const signInWithPassword = useCallback(async (email: string, password: string) => {
        const session = await cognitoSignIn(email, password);
        setUser(session);
    }, []);

    const signUpWithPassword = useCallback(async (email: string, password: string) => {
        await cognitoSignUp(email, password);
    }, []);

    const confirmSignUp = useCallback(async (email: string, code: string) => {
        await cognitoConfirmSignUp(email, code);
    }, []);

    const startDiscordSignIn = useCallback(() => {
        const ret = encodeURIComponent(window.location.origin);
        window.location.href = `${API_BASE}/auth/discord/start?return=${ret}`;
    }, []);

    const signInAsDevUser = useCallback((sub: string, email?: string | null) => {
        if (!isDevAuthEnabled()) {
            throw new Error('Dev auth is not enabled in this build');
        }
        const session = devSignInAs(sub, email ?? null);
        setUser(session);
    }, []);

    const signOut = useCallback(() => {
        // Fire-and-forget the wipe; Cognito sign-out itself is sync and
        // should not wait on HTTP calls that will imminently fail once
        // tokens are gone.
        void runSignOutWipe();
        cognitoSignOut();
        syncedForSubRef.current = null;
        setUser(null);
    }, []);

    const value = useMemo<CognitoAuthContextValue>(() => ({
        available,
        devAuth,
        initializing,
        user,
        signInWithPassword,
        signUpWithPassword,
        confirmSignUp,
        startDiscordSignIn,
        signInAsDevUser,
        signOut,
    }), [available, devAuth, initializing, user, signInWithPassword, signUpWithPassword,
        confirmSignUp, startDiscordSignIn, signInAsDevUser, signOut]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCognitoAuth(): CognitoAuthContextValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useCognitoAuth must be used within CognitoAuthProvider');
    return v;
}

interface HashTokens {
    idToken: string;
    accessToken: string;
    refreshToken: string;
}

function parseHashTokens(hash: string): HashTokens | null {
    if (!hash || !hash.startsWith('#')) return null;
    const params = new URLSearchParams(hash.slice(1));
    const idToken = params.get('id_token');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!idToken || !refreshToken) return null;
    return { idToken, accessToken: accessToken ?? '', refreshToken };
}
