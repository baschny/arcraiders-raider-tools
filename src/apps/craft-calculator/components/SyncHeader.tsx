import { useLocale } from '../../../shared/context/LocaleContext';
import { formatAgeShort } from '../../../shared/utils/ageFormat';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SyncHeaderProps {
  stashSyncedAt: string | null;
  loadoutSyncedAt: string | null;
  gameDataSource: 'arctracker' | 'embark';
  isSyncing: boolean;
  onSync: () => void;
}

export function SyncHeader({
  stashSyncedAt,
  loadoutSyncedAt,
  gameDataSource,
  isSyncing,
  onSync,
}: SyncHeaderProps) {
  const { t } = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const ageLabel = (syncedAt: string | null): string =>
    formatAgeShort(syncedAt, nowMs) ?? t('craftCalculator.syncHeader.never');

  const syncedMs = stashSyncedAt ? Date.parse(stashSyncedAt) : NaN;
  const elapsedSeconds = Number.isFinite(syncedMs)
    ? Math.max(0, Math.floor((nowMs - syncedMs) / 1000))
    : Infinity;
  const syncIsRecent = elapsedSeconds < 3600;

  return (
    <div className="cc-sync-header">
      {gameDataSource === 'embark' ? (
        <>
          <button
            type="button"
            className={`cc-sync-header__button${syncIsRecent ? '' : ' cc-sync-header__button--primary'}`}
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing
              ? t('craftCalculator.syncHeader.syncingGameData')
              : t('craftCalculator.syncHeader.syncGameData')}
          </button>
          <div className="cc-sync-header__timestamps">
            <div className="cc-sync-header__timestamp">
              {t('craftCalculator.syncHeader.gameDataLastSync')}:{' '}
              <span>{ageLabel(stashSyncedAt)}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="cc-sync-header__button"
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing
              ? t('craftCalculator.syncHeader.syncingInventory')
              : t('craftCalculator.syncHeader.syncMyItems')}
          </button>
          <div className="cc-sync-header__timestamps">
            <span className="cc-sync-header__last-sync">{t('craftCalculator.syncHeader.lastSync')}</span>
            <div className="cc-sync-header__timestamp">
              {t('craftCalculator.syncHeader.stash')}: <span>{ageLabel(stashSyncedAt)}</span>
            </div>
            <div className="cc-sync-header__timestamp">
              {t('craftCalculator.syncHeader.loadout')}: <span>{ageLabel(loadoutSyncedAt)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
