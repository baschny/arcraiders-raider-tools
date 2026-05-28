/**
 * Auth Context (ArcTracker link state).
 *
 * Despite the name, this context represents the *ArcTracker integration*
 * status — whether the user has linked an ArcTracker account, and what
 * their ArcTracker username is. The user's *identity* lives in
 * `CognitoAuthContext`.
 *
 * The ArcTracker token is available only for signed-in users and is stored
 * server-side, KMS-encrypted in production.
 *
 * The public API is unchanged so existing call sites keep working.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { cacheClear, setCacheSource } from '../services/cacheService';
import { serverTokenLink } from '../auth/tokenLink';
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

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const revalidate = useCallback(async () => {
    setIsValidating(true);
    setError(null);
    try {
      if (!cognito.user) {
        setIsAuthenticated(false);
        setUsername(null);
        return;
      }
      const snap = await serverTokenLink.refresh();
      setIsAuthenticated(snap.isLinked);
      setUsername(snap.username);
    } catch {
      setError('Unable to verify session. Please check your connection.');
    } finally {
      setIsValidating(false);
    }
  }, [cognito.user]);

  const login = useCallback(
    async (token: string): Promise<boolean> => {
      setIsValidating(true);
      setError(null);
      try {
        if (!cognito.user) {
          setError('Please sign in before linking ArcTracker.');
          return false;
        }
        const validatedUsername = await serverTokenLink.link(token);
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
    [cognito.user],
  );

  const logout = useCallback(async () => {
    try {
      if (cognito.user) await serverTokenLink.unlink();
    } catch (err) {
      console.warn('Failed to unlink ArcTracker token', err);
    }
    await cacheClear();
    await setCacheSource(null);
    setIsAuthenticated(false);
    setUsername(null);
    setError(null);
  }, [cognito.user]);

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
