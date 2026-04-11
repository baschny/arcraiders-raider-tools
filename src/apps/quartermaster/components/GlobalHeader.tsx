/**
 * Global Header Component
 * See specification section 7.1.2
 */

import type { PlannerResult } from '../types/planner';
import { useLocale } from '../../../shared/context/LocaleContext';

interface GlobalHeaderProps {
  plannerResult: PlannerResult;
  stashSyncedAt: string | null;
  loadoutSyncedAt: string | null;
}

/**
 * Format ISO timestamp for display
 * Uses CachedStash.syncedAt / CachedLoadout.syncedAt per spec section 3.4
 */
export function GlobalHeader({
  plannerResult,
  stashSyncedAt,
  loadoutSyncedAt,
}: GlobalHeaderProps) {
  const { t, formatDate } = useLocale();
  const {
    activeListsCount,
    totalMissingItemsCount,
    totalRecycleActionsCount,
    totalCraftStepsCount,
  } = plannerResult;

  const formatTimestamp = (isoString: string | null): string => {
    if (!isoString) return t('quartermaster.globalHeader.never');
    try {
      return formatDate(new Date(isoString), { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t('quartermaster.globalHeader.invalid');
    }
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
        <div className="qm-global-header__timestamp">
          {t('quartermaster.globalHeader.stash')}: <span>{formatTimestamp(stashSyncedAt)}</span>
        </div>
        <div className="qm-global-header__timestamp">
          {t('quartermaster.globalHeader.loadout')}: <span>{formatTimestamp(loadoutSyncedAt)}</span>
        </div>
      </div>
    </div>
  );
}
