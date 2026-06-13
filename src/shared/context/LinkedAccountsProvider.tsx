import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ARCTRACKER_LINK_INVALID_EVENT } from '../auth/arctrackerLinkEvents';
import { useEmbarkLinkStatus } from '../hooks/useEmbarkLinkStatus';
import { getCachedProfile } from '../services/cacheService';
import { syncProfile } from '../services/arctrackerApi';
import { useAuth } from './AuthContext';
import { useCognitoAuth } from './CognitoAuthContext';
import { LinkedAccountsContext, type ArctrackerConnectionState } from './LinkedAccountsContext';

const PROFILE_TTL_MS = 5 * 60_000;

export function LinkedAccountsProvider({ children }: { children: ReactNode }) {
  const cognito = useCognitoAuth();
  const {
    isAuthenticated,
    isValidating,
    username,
    revalidate,
  } = useAuth();
  const [invalidForSub, setInvalidForSub] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [profileUpdating, setProfileUpdating] = useState(false);
  const embark = useEmbarkLinkStatus(Boolean(cognito.user), { pollIntervalMs: null });
  const currentSub = cognito.user?.sub ?? null;

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setIsSubscribed(false);
      return;
    }
    const profile = await getCachedProfile();
    setIsSubscribed(profile?.isSubscribed ?? false);

    if (profile && Date.now() - profile.cachedAt > PROFILE_TTL_MS) {
      try {
        const fresh = await syncProfile();
        setIsSubscribed(fresh.isSubscribed ?? false);
      } catch {
        // silent — stale data is better than nothing
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    setProfileUpdating(true);
    try {
      const fresh = await syncProfile();
      setIsSubscribed(fresh.isSubscribed ?? false);
    } finally {
      setProfileUpdating(false);
    }
  }, []);

  const arctrackerState = useMemo<ArctrackerConnectionState>(() => {
    if (!isAuthenticated) return 'none';
    return currentSub && invalidForSub === currentSub ? 'invalid' : 'connected';
  }, [isAuthenticated, currentSub, invalidForSub]);

  useEffect(() => {
    function handleInvalid() {
      if (!isAuthenticated || !currentSub) return;
      setInvalidForSub(currentSub);
    }

    window.addEventListener(ARCTRACKER_LINK_INVALID_EVENT, handleInvalid);
    return () => window.removeEventListener(ARCTRACKER_LINK_INVALID_EVENT, handleInvalid);
  }, [isAuthenticated, currentSub]);

  const refreshArctracker = useCallback(async () => {
    await revalidate();
    setInvalidForSub(null);
  }, [revalidate]);

  const markArctrackerInvalid = useCallback(() => {
    if (!isAuthenticated || !currentSub) return;
    setInvalidForSub(currentSub);
  }, [isAuthenticated, currentSub]);

  const value = useMemo(
    () => ({
      arctracker: {
        state: arctrackerState,
        username,
        loading: isValidating || cognito.initializing,
        refresh: refreshArctracker,
        markInvalid: markArctrackerInvalid,
        isSubscribed,
        refreshProfile,
        profileUpdating,
      },
      embark: {
        status: embark.status,
        loading: embark.loading,
        error: embark.error,
        refresh: embark.refresh,
        setStatus: embark.setStatus,
      },
    }),
    [
      arctrackerState,
      username,
      isValidating,
      cognito.initializing,
      refreshArctracker,
      markArctrackerInvalid,
      isSubscribed,
      refreshProfile,
      profileUpdating,
      embark.status,
      embark.loading,
      embark.error,
      embark.refresh,
      embark.setStatus,
    ],
  );

  return (
    <LinkedAccountsContext.Provider value={value}>
      {children}
    </LinkedAccountsContext.Provider>
  );
}
