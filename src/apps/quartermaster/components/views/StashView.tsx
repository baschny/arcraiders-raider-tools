/**
 * Stash View Component
 * See specification section 7.2
 */

import { useState, useMemo } from 'react';
import { RefreshCw, Search, Package } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { PlannerResult, StashItem } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';
import type { ItemInsightsMap } from '../../utils/itemInsights';

interface StashViewProps {
  itemsMap: ItemsMap;
  stashItems: StashItem[];
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onSyncStash: () => void;
  isSyncing: boolean;
}

export function StashView({
  itemsMap,
  stashItems,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onSyncStash,
  isSyncing,
}: StashViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [showOnlyRecyclable, setShowOnlyRecyclable] = useState(false);

  // Build sets for quick lookups
  const recycleItemIds = useMemo(() => {
    return new Set(plannerResult.recyclePlan.actions.map(a => a.srcItemId));
  }, [plannerResult.recyclePlan]);

  // Get unique categories from stash items
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of stashItems) {
      const plannerItem = itemsMap[item.itemId];
      if (plannerItem) {
        cats.add(plannerItem.category);
      }
    }
    return Array.from(cats).sort();
  }, [stashItems, itemsMap]);

  // Filter and sort stash items
  const filteredItems = useMemo(() => {
    return stashItems
      .filter(stashItem => {
        const item = itemsMap[stashItem.itemId];
        if (!item) return false;

        // Search filter
        if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }

        // Category filter
        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
          return false;
        }

        // Rarity filter
        if (rarityFilter !== 'all' && item.rarity !== rarityFilter) {
          return false;
        }

        // Recyclable filter
        if (showOnlyRecyclable && !recycleItemIds.has(stashItem.itemId)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const itemA = itemsMap[a.itemId];
        const itemB = itemsMap[b.itemId];
        return (itemA?.name ?? '').localeCompare(itemB?.name ?? '');
      });
  }, [stashItems, itemsMap, searchQuery, categoryFilter, rarityFilter, showOnlyRecyclable, recycleItemIds]);

  // Calculate total value
  const totalValue = useMemo(() => {
    return stashItems.reduce((sum, stashItem) => {
      const item = itemsMap[stashItem.itemId];
      return sum + (item?.value ?? 0) * stashItem.quantity;
    }, 0);
  }, [stashItems, itemsMap]);
  const planRowsByItemId = useMemo(() => {
    const map = new Map(plannerResult.planRows.map((row) => [row.itemId, row]));
    return map;
  }, [plannerResult.planRows]);

  const tooltipContext = useMemo(() => ({
    itemsMap,
    plannerResult,
    itemInsights,
  }), [itemsMap, plannerResult, itemInsights]);

  const getMissingOriginLabel = (itemId: string): string => {
    const insight = itemInsights[itemId];
    if (!insight) return '';
    const listNames = new Set<string>();
    for (const need of insight.finalListNeeds) listNames.add(need.listName);
    for (const need of insight.craftingNeeds) listNames.add(need.listName);
    return Array.from(listNames).sort().join(', ');
  };

  const getRecycleReasonLabel = (itemId: string): string => {
    const insight = itemInsights[itemId];
    if (!insight) return '';
    const recycleNeeds = insight.recycleSalvageNeeds.filter((need) => need.mode === 'recycle');
    if (recycleNeeds.length === 0) return '';
    const firstNeed = recycleNeeds[0];
    return `${firstNeed.targetItemName} (${firstNeed.listName})`;
  };

  return (
    <div className="stash-view">
      <div className="stash-view__controls">
        <button 
          className="qm-button" 
          onClick={onSyncStash}
          disabled={isSyncing}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          Sync Inventory
        </button>

        <div className="stash-view__search">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              className="qm-input"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 28, width: '100%' }}
            />
          </div>
        </div>

        <div className="stash-view__filters">
          <select
            className="qm-input stash-view__filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            className="qm-input stash-view__filter"
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
          >
            <option value="all">All Rarities</option>
            <option value="Common">Common</option>
            <option value="Uncommon">Uncommon</option>
            <option value="Rare">Rare</option>
            <option value="Epic">Epic</option>
            <option value="Legendary">Legendary</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlyRecyclable}
              onChange={(e) => setShowOnlyRecyclable(e.target.checked)}
            />
            Show Only Recyclable
          </label>
        </div>

        <div className="stash-view__value">
          Total Value: <span>{totalValue.toLocaleString()}</span>
        </div>
      </div>

      {stashItems.length === 0 ? (
        <div className="qm-empty-state">
          <Package size={48} />
          <p>No items in stash. Click &quot;Sync Inventory&quot; to load your stash.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="qm-empty-state">
          <Search size={48} />
          <p>No items match your filters.</p>
        </div>
      ) : (
        <table className="qm-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Icon</th>
              <th>Item</th>
              <th style={{ width: 140 }}>Need</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(stashItem => {
              const item = itemsMap[stashItem.itemId];
              if (!item) return null;
              
              const planRow = planRowsByItemId.get(stashItem.itemId);
              const toRecycle = recycleItemIds.has(stashItem.itemId);
              const required = planRow?.required ?? 0;
              const missing = planRow?.missing ?? 0;
              const missingOriginLabel = getMissingOriginLabel(stashItem.itemId);
              const recycleReason = getRecycleReasonLabel(stashItem.itemId);
              const hasRequirement = required > 0;

              return (
                <tr key={stashItem.itemId}>
                  <td>
                    <ItemIcon
                      itemId={item.id}
                      name={item.name}
                      icon={item.icon}
                      rarity={item.rarity}
                      quantity={getOwnedQuantity(item.id)}
                      size="sm"
                      showName={false}
                      tooltipContext={tooltipContext}
                    />
                  </td>
                  <td>
                    <span className="qm-item-name">{item.name}</span>
                  </td>
                  <td className={missing > 0 ? 'stash-view__need stash-view__need--missing' : 'stash-view__need'}>
                    {hasRequirement ? `${missing}/${required} Missing` : '0/0 Missing'}
                  </td>
                  <td>
                    {(planRow?.missing ?? 0) === 0 && hasRequirement && (
                      <span className="stash-view__indicator stash-view__indicator--have">
                        ✓ Have
                      </span>
                    )}
                    {(planRow?.missing ?? 0) > 0 && (
                      <span className="stash-view__indicator stash-view__indicator--missing">
                        ⚠ Missing{missingOriginLabel ? ` · ${missingOriginLabel}` : ''}
                      </span>
                    )}
                    {toRecycle && (
                      <span className="stash-view__indicator stash-view__indicator--recycle">
                        🔄 Recycle{recycleReason ? ` · ${recycleReason}` : ''}
                      </span>
                    )}
                    {planRow?.isUncraftable && (
                      <span className="stash-view__indicator stash-view__indicator--uncraftable">
                        {planRow.uncraftableReason === 'blueprint_locked' && '🔒 Blueprint Locked'}
                        {planRow.uncraftableReason === 'insufficient_bench_level' && '🚫 Bench Level Too Low'}
                        {planRow.uncraftableReason === 'missing_bench' && '🚫 No Craft Bench'}
                        {planRow.uncraftableReason === 'cycle' && '🚫 Craft Cycle'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
