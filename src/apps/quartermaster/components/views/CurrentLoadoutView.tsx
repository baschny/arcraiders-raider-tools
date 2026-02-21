/**
 * Current Loadout View Component
 * See specification section 7.3
 */

import { RefreshCw, Backpack } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { CurrentLoadoutItem, PlannerResult, LoadoutBadge } from '../../types/planner';
import { ItemIcon, type ItemIconBadge } from '../ItemIcon';

interface CurrentLoadoutViewProps {
  itemsMap: ItemsMap;
  currentLoadout: CurrentLoadoutItem[];
  plannerResult: PlannerResult;
  onSyncLoadout: () => void;
  isSyncing: boolean;
}

/**
 * Determine loadout badge for an item (CR-MOD-7)
 * HAVE / CAN_CRAFT / MISSING
 */
function getLoadoutBadge(
  itemId: string,
  plannerResult: PlannerResult,
): LoadoutBadge {
  const planRow = plannerResult.planRows.find(r => r.itemId === itemId);
  if (planRow) return planRow.badge;

  // Item not in plan rows → not required, treat as HAVE
  return 'HAVE';
}

export function CurrentLoadoutView({
  itemsMap,
  currentLoadout,
  plannerResult,
  onSyncLoadout,
  isSyncing,
}: CurrentLoadoutViewProps) {
  if (currentLoadout.length === 0) {
    return (
      <div className="current-loadout-view">
        <div className="current-loadout-view__controls">
          <button 
            className="qm-button" 
            onClick={onSyncLoadout}
            disabled={isSyncing}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            Sync Loadout
          </button>
        </div>
        <div className="qm-empty-state">
          <Backpack size={48} />
          <p>No loadout synced. Click &quot;Sync Loadout&quot; to load your current equipment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="current-loadout-view">
      <div style={{ marginBottom: 16 }}>
        <button 
          className="qm-button" 
          onClick={onSyncLoadout}
          disabled={isSyncing}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          Sync Loadout
        </button>
      </div>

      <div className="current-loadout-view__grid">
        <div className="current-loadout-view__section">
          <div className="current-loadout-view__section-title">Backpack Contents</div>
          <div className="current-loadout-view__backpack-grid">
            {currentLoadout.map((loadoutItem, idx) => {
              const item = itemsMap[loadoutItem.itemId];
              if (!item) return null;

              const badge = getLoadoutBadge(loadoutItem.itemId, plannerResult);
              const badges: ItemIconBadge[] = [];

              if (badge === 'HAVE') {
                badges.push({ key: 'badge', label: 'Have', type: 'have', priority: 1 });
              } else if (badge === 'CAN_CRAFT') {
                badges.push({ key: 'badge', label: 'Craft', type: 'can-craft', priority: 1 });
              } else {
                badges.push({ key: 'badge', label: 'Missing', type: 'missing', priority: 1 });
              }

              return (
                <div key={`${loadoutItem.itemId}-${idx}`} className="current-loadout-view__slot">
                  <ItemIcon
                    itemId={item.id}
                    name={item.name}
                    icon={item.icon}
                    rarity={item.rarity}
                    quantity={loadoutItem.quantity}
                    badges={badges}
                    size="sm"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
