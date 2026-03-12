/**
 * Global Header Component
 * See specification section 7.1.2
 */

import type { PlannerResult } from '../types/planner';

interface GlobalHeaderProps {
  plannerResult: PlannerResult;
  stashSyncedAt: string | null;
  loadoutSyncedAt: string | null;
}

/**
 * Format ISO timestamp for display
 * Uses CachedStash.syncedAt / CachedLoadout.syncedAt per spec section 3.4
 */
function formatTimestamp(isoString: string | null): string {
  if (!isoString) return 'Never';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Invalid';
  }
}

export function GlobalHeader({
  plannerResult,
  stashSyncedAt,
  loadoutSyncedAt,
}: GlobalHeaderProps) {
  const {
    activeListsCount,
    totalMissingItemsCount,
    totalRecycleActionsCount,
    totalCraftStepsCount,
  } = plannerResult;

  return (
    <div className="qm-global-header">
      <div className="qm-global-header__stats">
        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">Active Lists</span>
          <span className="qm-global-header__stat-value">{activeListsCount}</span>
        </div>

        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">Missing Items</span>
          <span className={`qm-global-header__stat-value ${totalMissingItemsCount > 0 ? 'qm-global-header__stat-value--error' : 'qm-global-header__stat-value--success'}`}>
            {totalMissingItemsCount}
          </span>
        </div>

        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">Recycle Actions</span>
          <span className={`qm-global-header__stat-value ${totalRecycleActionsCount > 0 ? 'qm-global-header__stat-value--warning' : ''}`}>
            {totalRecycleActionsCount}
          </span>
        </div>

        <div className="qm-global-header__stat">
          <span className="qm-global-header__stat-label">Craft Steps</span>
          <span className="qm-global-header__stat-value">{totalCraftStepsCount}</span>
        </div>
      </div>

      <div className="qm-global-header__timestamps">
        <div className="qm-global-header__timestamp">
          Stash: <span>{formatTimestamp(stashSyncedAt)}</span>
        </div>
        <div className="qm-global-header__timestamp">
          Loadout: <span>{formatTimestamp(loadoutSyncedAt)}</span>
        </div>
      </div>
    </div>
  );
}
