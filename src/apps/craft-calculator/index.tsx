import { useState, useEffect, useCallback } from 'react';
import { CraftCalculator } from './components/CraftCalculator';
import { SyncHeader } from './components/SyncHeader';
import { useCognitoAuth } from '../../shared/context/CognitoAuthContext';
import { useLinkedAccounts } from '../../shared/context/LinkedAccountsContext';
import { SignInNudge } from '../../shared/components/SignInNudge';
import { getMe } from '../../shared/services/userApi';
import { getCachedStash, getCachedLoadout } from '../../shared/services/cacheService';
import { syncStashAllPages, syncLoadout } from '../../shared/services/arctrackerApi';
import { withSyncNow } from '../../shared/services/syncNowService';
import { syncEmbarkInventory, type GameDataSource } from '../../shared/services/gameDataApi';
import type { CachedStash, CachedLoadout } from '../../shared/types/arctracker';
import './styles/main.scss';

export function CraftCalculatorApp() {
  const cognito = useCognitoAuth();
  const linkedAccounts = useLinkedAccounts();

  const [gameDataSource, setGameDataSource] = useState<GameDataSource | null>(null);
  const [cachedStash, setCachedStash] = useState<CachedStash | null>(null);
  const [cachedLoadout, setCachedLoadout] = useState<CachedLoadout | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!cognito.user) {
        setGameDataSource(null);
        return;
      }
      try {
        const me = await getMe();
        if (cancelled) return;
        setGameDataSource(me.gameDataSource ?? 'arctracker');
      } catch {
        if (!cancelled) setGameDataSource(null);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [cognito.user]);

  useEffect(() => {
    let cancelled = false;
    async function loadCache() {
      if (!cognito.user) {
        setCachedStash(null);
        setCachedLoadout(null);
        return;
      }
      try {
        const stash = await getCachedStash();
        const loadout = await getCachedLoadout();
        if (cancelled) return;
        setCachedStash(stash ?? null);
        setCachedLoadout(loadout ?? null);
      } catch {
        if (!cancelled) {
          setCachedStash(null);
          setCachedLoadout(null);
        }
      }
    }
    loadCache();
    return () => { cancelled = true; };
  }, [cognito.user]);

  const handleSync = useCallback(async () => {
    setSyncError(null);
    setIsSyncing(true);
    try {
      if (gameDataSource === 'embark') {
        const snapshot = await syncEmbarkInventory();
        setCachedStash(snapshot.stash);
        setCachedLoadout(snapshot.loadout);
      } else {
        const stash = await withSyncNow('stash', () => syncStashAllPages());
        setCachedStash(stash);
        try {
          const loadout = await syncLoadout();
          setCachedLoadout(loadout);
        } catch (err) {
          console.error('Failed to sync loadout:', err);
        }
      }
    } catch (err) {
      console.error('Failed to sync game data:', err);
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [gameDataSource]);

  const arctrackerLinked = linkedAccounts.arctracker.state === 'connected';
  const embarkLinked = linkedAccounts.embark.status?.linked === true;
  const hasLinkedAccount = arctrackerLinked || embarkLinked;
  const showHeader = Boolean(cognito.user) && hasLinkedAccount && gameDataSource !== null;

  return (
    <>
      {showHeader && (
        <SyncHeader
          stashSyncedAt={cachedStash?.syncedAt ?? null}
          loadoutSyncedAt={cachedLoadout?.syncedAt ?? null}
          gameDataSource={gameDataSource}
          isSyncing={isSyncing}
          onSync={handleSync}
        />
      )}
      <SignInNudge />
      {syncError && (
        <div className="cc-sync-error">
          {syncError}
          <button
            className="cc-sync-error__dismiss"
            onClick={() => setSyncError(null)}
            type="button"
          >
            &times;
          </button>
        </div>
      )}
      <div className="container">
        <CraftCalculator
          cachedStash={cachedStash}
          cachedLoadout={cachedLoadout}
        />
      </div>
    </>
  );
}
