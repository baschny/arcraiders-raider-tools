/**
 * Auth Context
 * Provides global authentication state for the application.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getToken, setToken, clearToken } from '../utils/tokenStorage';
import { validateToken } from '../services/arctrackerApi';
import { cacheClear } from '../services/cacheService';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Validate the stored token on mount.
   */
  const revalidate = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      setUsername(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const validatedUsername = await validateToken(token);
      if (validatedUsername) {
        setIsAuthenticated(true);
        setUsername(validatedUsername);
      } else {
        // Token is invalid, clear it
        clearToken();
        setIsAuthenticated(false);
        setUsername(null);
        setError('Session expired. Please log in again.');
      }
    } catch {
      // Keep existing state on network error, don't clear token
      setError('Unable to verify session. Please check your connection.');
    } finally {
      setIsValidating(false);
    }
  }, []);

  /**
   * Login with a new token.
   * Returns true if successful, false otherwise.
   */
  const login = useCallback(async (token: string): Promise<boolean> => {
    setIsValidating(true);
    setError(null);

    try {
      const validatedUsername = await validateToken(token);
      if (validatedUsername) {
        setToken(token);
        setIsAuthenticated(true);
        setUsername(validatedUsername);
        setIsValidating(false);
        return true;
      } else {
        setError('Invalid token. Please check your API token and try again.');
        setIsValidating(false);
        return false;
      }
    } catch {
      setError('Failed to validate token. Please try again.');
      setIsValidating(false);
      return false;
    }
  }, []);

  /**
   * Logout: clear token and cached data.
   */
  const logout = useCallback(async () => {
    clearToken();
    await cacheClear();
    setIsAuthenticated(false);
    setUsername(null);
    setError(null);
  }, []);

  // Validate token on mount
  useEffect(() => {
    revalidate();
  }, [revalidate]);

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

/**
 * Hook to access auth context.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
