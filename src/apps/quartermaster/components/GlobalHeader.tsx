/**
 * Global Header Component
 * See specification section 7.1.2
 */

import type { PlannerResult } from '../types/planner';
import { useLocale } from '../../../shared/context/LocaleContext';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface GlobalHeaderProps {
  plannerResult: PlannerResult;
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
  plannerResult,
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
  const {
    activeListsCount,
    totalMissingItemsCount,
    totalRecycleActionsCount,
    totalCraftStepsCount,
  } = plannerResult;

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
      return tm('quartermaster.globalHeader.elapsedSeconds', { count: elapsedSeconds });
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return tm('quartermaster.globalHeader.elapsedMinutes', { count: elapsedMinutes });
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    const remainingMinutes = elapsedMinutes % 60;
    if (elapsedHours < 24) {
      return tm('quartermaster.globalHeader.elapsedHours', {
        hours: elapsedHours,
        minutes: String(remainingMinutes).padStart(2, '0'),
      });
    }

    return tm('quartermaster.globalHeader.elapsedDays', { count: Math.floor(elapsedHours / 24) });
  };

  return (
    <div className="qm-global-header">
      <div className="qm-global-header__stats">
        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">{t('quartermaster.globalHeader.activeLists')}</span>
          <span className="qm-global-header__stat-value">{activeListsCount}</span>
        </div>

        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">{t('quartermaster.globalHeader.missingItems')}</span>
          <span className={`qm-global-header__stat-value ${totalMissingItemsCount > 0 ? 'qm-global-header__stat-value--error' : 'qm-global-header__stat-value--success'}`}>
            {totalMissingItemsCount}
          </span>
        </div>

        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">{t('quartermaster.globalHeader.recycleActions')}</span>
          <span className={`qm-global-header__stat-value ${totalRecycleActionsCount > 0 ? 'qm-global-header__stat-value--warning' : ''}`}>
            {totalRecycleActionsCount}
          </span>
        </div>

        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">{t('quartermaster.globalHeader.craftSteps')}</span>
          <span className="qm-global-header__stat-value">{totalCraftStepsCount}</span>
        </div>
      </div>

      <div className="qm-global-header__timestamps">
        {gameDataSource === 'embark' ? (
          <>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.source')}: <span>Embark</span>
            </div>
            <div className="qm-global-header__timestamp">
              {t('quartermaster.globalHeader.inventory')}:{' '}
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
            <button
              type="button"
              className="qm-button qm-button--small"
              onClick={onSyncEmbark}
              disabled={isSyncingEmbark}
              title={t('quartermaster.globalHeader.embarkSyncTooltip')}
            >
              <RefreshCw size={14} className={isSyncingEmbark ? 'animate-spin' : ''} />
              {isSyncingEmbark
                ? t('quartermaster.globalHeader.syncingInventory')
                : t('quartermaster.globalHeader.sync')}
            </button>
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
