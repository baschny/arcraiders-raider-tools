/**
 * Stash View Component
 * See specification section 7.2
 */

import { useState, useMemo } from 'react';
import { RefreshCw, Search, Package } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { PlannerResult, StashItem } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';

interface StashViewProps {
  itemsMap: ItemsMap;
  stashItems: StashItem[];
  plannerResult: PlannerResult;
  onSyncStash: () => void;
  isSyncing: boolean;
}

export function StashView({
  itemsMap,
  stashItems,
  plannerResult,
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

  const requiredItemIds = useMemo(() => {
    return new Set(Object.keys(plannerResult.required));
  }, [plannerResult.required]);

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

  // Get plan row for an item
  const getPlanRow = (itemId: string) => {
    return plannerResult.planRows.find(r => r.itemId === itemId);
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
              <th style={{ width: 60 }}>Icon</th>
              <th>Item</th>
              <th style={{ width: 80 }}>Quantity</th>
              <th style={{ width: 80 }}>Reserved</th>
              <th style={{ width: 80 }}>Available</th>
              <th style={{ width: 80 }}>Required</th>
              <th style={{ width: 80 }}>Missing</th>
              <th>Indicators</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(stashItem => {
              const item = itemsMap[stashItem.itemId];
              if (!item) return null;
              
              const planRow = getPlanRow(stashItem.itemId);
              const isRequired = requiredItemIds.has(stashItem.itemId);
              const toRecycle = recycleItemIds.has(stashItem.itemId);

              return (
                <tr key={stashItem.itemId}>
                  <td>
                    <ItemIcon
                      itemId={item.id}
                      name={item.name}
                      icon={item.icon}
                      rarity={item.rarity}
                      quantity={stashItem.quantity}
                      size="sm"
                      showName={false}
                    />
                  </td>
                  <td>{item.name}</td>
                  <td>{stashItem.quantity}</td>
                  <td>{planRow?.reserved ?? 0}</td>
                  <td>{planRow?.available ?? stashItem.quantity}</td>
                  <td>{planRow?.required ?? 0}</td>
                  <td style={{ color: (planRow?.missing ?? 0) > 0 ? '#f44336' : 'inherit' }}>
                    {planRow?.missing ?? 0}
                  </td>
                  <td>
                    {isRequired && (
                      <span className="stash-view__indicator stash-view__indicator--crafting">
                        🔧 Crafting
                      </span>
                    )}
                    {toRecycle && (
                      <span className="stash-view__indicator stash-view__indicator--recycle">
                        🔄 Recycle
                      </span>
                    )}
                    {(planRow?.missing ?? 0) > 0 && (
                      <span className="stash-view__indicator stash-view__indicator--missing">
                        ⚠ Missing
                      </span>
                    )}
                    {planRow?.isUncraftable && (
                      <span className="stash-view__indicator stash-view__indicator--uncraftable">
                        🚫 Uncraftable
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
