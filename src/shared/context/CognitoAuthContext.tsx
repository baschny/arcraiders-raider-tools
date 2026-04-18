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

interface CognitoAuthContextValue {
    /** True when the SPA has Cognito env vars configured. */
    available: boolean;
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
    const available = isCognitoConfigured();
    // When Cognito is not configured we have nothing to initialize — skip the
    // "initializing" gate entirely so `set-state-in-effect` is not needed.
    const [initializing, setInitializing] = useState<boolean>(() => available);
    const [user, setUser] = useState<AuthSession | null>(null);

    // On mount when Cognito IS configured: 1) consume tokens from the URL
    // fragment if present, 2) hydrate any cached session from the SDK.
    useEffect(() => {
        if (!available) return;

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

        getCurrentSession()
            .then(s => setUser(s))
            .finally(() => setInitializing(false));
    }, [available]);

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

    const signOut = useCallback(() => {
        cognitoSignOut();
        setUser(null);
    }, []);

    const value = useMemo<CognitoAuthContextValue>(() => ({
        available,
        initializing,
        user,
        signInWithPassword,
        signUpWithPassword,
        confirmSignUp,
        startDiscordSignIn,
        signOut,
    }), [available, initializing, user, signInWithPassword, signUpWithPassword,
        confirmSignUp, startDiscordSignIn, signOut]);

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
