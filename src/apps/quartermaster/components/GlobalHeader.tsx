/**
 * Global Header Component
 * See specification section 7.1.2
 */

import { useLocale } from '../../../shared/context/LocaleContext';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface GlobalHeaderProps {
  stashSyncedAt: string | null;
  loadoutSyncedAt: string | null;
  gameDataSource: 'arctracker' | 'embark';
  embarkSyncedAt: string | null;
  embarkUnknownCount: number;
  isSyncingEmbark: boolean;
  onSyncEmbark: () => void;
}

/**
 * Format ISO timestamp for display
 * Uses CachedStash.syncedAt / CachedLoadout.syncedAt per spec section 3.4
 */
export function GlobalHeader({
  stashSyncedAt,
  loadoutSyncedAt,
  gameDataSource,
  embarkSyncedAt,
  embarkUnknownCount,
  isSyncingEmbark,
  onSyncEmbark,
}: GlobalHeaderProps) {
  const { t, tm, formatDate } = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (gameDataSource !== 'embark') return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(intervalId);
  }, [gameDataSource]);

  const formatTimestamp = (isoString: string | null): string => {
    if (!isoString) return t('quartermaster.globalHeader.never');
    try {
      return formatDate(new Date(isoString), { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t('quartermaster.globalHeader.invalid');
    }
  };

  const formatElapsedTimestamp = (isoString: string | null): string => {
    if (!isoString) return t('quartermaster.globalHeader.never');
    const syncedMs = Date.parse(isoString);
    if (!Number.isFinite(syncedMs)) return t('quartermaster.globalHeader.invalid');

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncedMs) / 1000));
    if (elapsedSeconds < 60) {
      return `${tm('quartermaster.globalHeader.elapsedSeconds', { count: elapsedSeconds })} ago`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return `${tm('quartermaster.globalHeader.elapsedMinutes', { count: elapsedMinutes })} ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    const remainingMinutes = elapsedMinutes % 60;
    if (elapsedHours < 24) {
      return `${tm('quartermaster.globalHeader.elapsedHours', {
        hours: elapsedHours,
        minutes: String(remainingMinutes).padStart(2, '0'),
      })} ago`;
    }

    return `${tm('quartermaster.globalHeader.elapsedDays', { count: Math.floor(elapsedHours / 24) })} ago`;
  };

  const syncedMs = embarkSyncedAt ? Date.parse(embarkSyncedAt) : NaN;
  const elapsedSeconds = Number.isFinite(syncedMs)
    ? Math.max(0, Math.floor((nowMs - syncedMs) / 1000))
    : Infinity;
  const syncIsRecent = elapsedSeconds < 3600;

  return (
    <div className="qm-global-header">
      {gameDataSource === 'embark' && (
        <button
          type="button"
          className={`qm-button${syncIsRecent ? '' : ' qm-button--primary'}`}
          onClick={onSyncEmbark}
          disabled={isSyncingEmbark}
          title={t('quartermaster.globalHeader.embarkSyncTooltip')}
        >
          <RefreshCw size={16} className={isSyncingEmbark ? 'animate-spin' : ''} />
          {isSyncingEmbark
            ? t('quartermaster.globalHeader.syncingGameData')
            : t('quartermaster.globalHeader.syncGameData')}
        </button>
      )}

      <div className="qm-global-header__timestamps">
        {gameDataSource === 'embark' ? (
          <>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.source')}: <span>Embark</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.gameDataLastSync')}:{' '}
              <span title={embarkSyncedAt ? formatTimestamp(embarkSyncedAt) : undefined}>
                {formatElapsedTimestamp(embarkSyncedAt)}
              </span>
            </div>
            {embarkUnknownCount > 0 && (
              <div
                className="qm-global-header__timestamp qm-global-header__timestamp--warning"
                title={t('quartermaster.globalHeader.unknownEmbarkIdsTooltip')}
              >
                <AlertTriangle size={14} />
                <span>{t('quartermaster.globalHeader.unknownEmbarkIds')}: {embarkUnknownCount}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.stash')}: <span>{formatTimestamp(stashSyncedAt)}</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.loadout')}: <span>{formatTimestamp(loadoutSyncedAt)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
