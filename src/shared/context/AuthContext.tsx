/**
 * Auth Context (ArcTracker link state).
 *
 * Despite the name, this context represents the *ArcTracker integration*
 * status — whether the user has linked an ArcTracker account, and what
 * their ArcTracker username is. The user's *identity* lives in
 * `CognitoAuthContext`.
 *
 * The backing store automatically switches:
 *   - Cognito user signed in   -> remote (server-side, KMS-encrypted).
 *   - Anonymous mode           -> local (`localStorage`), as before.
 *
 * The public API is unchanged so existing call sites keep working.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { cacheClear } from '../services/cacheService';
import {
  type ArctrackerTokenLink,
  localTokenLink,
  remoteTokenLink,
} from '../auth/tokenLink';
import { useCognitoAuth } from './CognitoAuthContext';

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  isValidating: boolean;
  error: string | null;
  login: (token: string) => Promise<boolean>;
  logout: () => Promise<void>;
  revalidate: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const cognito = useCognitoAuth();

  // Pick the active backend: server-side when the user is signed in,
  // local-storage otherwise. This is recomputed when sign-in state flips.
  const link: ArctrackerTokenLink = useMemo(
    () => (cognito.user ? remoteTokenLink : localTokenLink),
    [cognito.user],
  );

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const revalidate = useCallback(async () => {
    setIsValidating(true);
    setError(null);
    try {
      const snap = await link.refresh();
      setIsAuthenticated(snap.isLinked);
      setUsername(snap.username);
      if (!snap.isLinked && link.kind === 'local') {
        // Existing UX: stale local token → mention session expiry.
        setError(prev => prev);
      }
    } catch {
      setError('Unable to verify session. Please check your connection.');
    } finally {
      setIsValidating(false);
    }
  }, [link]);

  const login = useCallback(
    async (token: string): Promise<boolean> => {
      setIsValidating(true);
      setError(null);
      try {
        const validatedUsername = await link.link(token);
        if (validatedUsername) {
          setIsAuthenticated(true);
          setUsername(validatedUsername);
          return true;
        }
        setError('Invalid token. Please check your API token and try again.');
        return false;
      } catch {
        setError('Failed to validate token. Please try again.');
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    [link],
  );

  const logout = useCallback(async () => {
    try {
      await link.unlink();
    } catch (err) {
      console.warn('Failed to unlink ArcTracker token', err);
    }
    await cacheClear();
    setIsAuthenticated(false);
    setUsername(null);
    setError(null);
  }, [link]);

  // Re-check link state whenever the active backend changes (sign in / out).
  useEffect(() => {
    if (cognito.initializing) return;
    revalidate();
  }, [cognito.initializing, revalidate]);

  const value: AuthContextValue = {
    isAuthenticated,
    username,
    isValidating,
    error,
    login,
    logout,
    revalidate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
