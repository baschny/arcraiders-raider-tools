/**
 * Current Loadout View Component
 * See specification section 7.3
 */

import { RefreshCw, Backpack } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { CurrentLoadoutItem, PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { ItemIcon } from '../ItemIcon';

interface CurrentLoadoutViewProps {
  itemsMap: ItemsMap;
  currentLoadout: CurrentLoadoutItem[];
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onSyncLoadout: () => void;
  isSyncing: boolean;
}

export function CurrentLoadoutView({
  itemsMap,
  currentLoadout,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onSyncLoadout,
  isSyncing,
}: CurrentLoadoutViewProps) {
  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };
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

              return (
                <div key={`${loadoutItem.itemId}-${idx}`} className="current-loadout-view__slot">
                  <ItemIcon
                    itemId={item.id}
                    name={item.name}
                    icon={item.icon}
                    rarity={item.rarity}
                    quantity={getOwnedQuantity(item.id)}
                    size="sm"
                    tooltipContext={tooltipContext}
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
