/**
 * Stash View Component
 * See specification section 7.2
 */

import { useState, useEffect, useMemo } from 'react';
import { Info, Paperclip, RefreshCw, Search, Package } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { OwnedItemDisplayRow, OwnedItemLocation, PlannerResult } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import {
  getLocalizedQuartermasterCategory,
  getLocalizedQuartermasterRarity,
  getUncraftableReasonLabel,
} from '../../utils/localization';
import { loadStashFilters, saveStashFilters } from '../../utils/preferences';
import { useLocale } from '../../../../shared/context/LocaleContext';

interface StashViewProps {
  itemsMap: ItemsMap;
  ownedItemRows: OwnedItemDisplayRow[];
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onSyncMyItems: () => void;
  isSyncing: boolean;
  syncStep: 'inventory' | 'loadout' | null;
  hasInventoryCache: boolean;
  hasLoadoutCache: boolean;
  showSyncButton?: boolean;
  unknownEmbarkItems?: Array<{
    gameAssetId: number;
    amount?: number;
    context: string;
  }>;
}

export function StashView({
  itemsMap,
  ownedItemRows,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onSyncMyItems,
  isSyncing,
  syncStep,
  hasInventoryCache,
  hasLoadoutCache,
  showSyncButton = true,
  unknownEmbarkItems = [],
}: StashViewProps) {
  const { t, tm, compareText, formatNumber } = useLocale();
  const [filters, setFilters] = useState(() => loadStashFilters());
  const { searchQuery, categoryFilter, rarityFilter, showOnlyUseless } = filters;

  useEffect(() => {
    saveStashFilters(filters);
  }, [filters]);

  // Build sets for quick lookups
  const recycleItemIds = useMemo(() => {
    return new Set(plannerResult.recyclePlan.actions.map(a => a.srcItemId));
  }, [plannerResult.recyclePlan]);
  const upgradeBaseItemIds = useMemo(() => {
    return new Set(plannerResult.weaponUpgradePlan.steps.map(step => step.fromItemId));
  }, [plannerResult.weaponUpgradePlan]);

  const uselessItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ownedItem of ownedItemRows) {
      const insight = itemInsights[ownedItem.itemId];
      const hasRelevance =
        (insight && (insight.finalListNeeds.length > 0 || insight.craftingNeeds.length > 0 || insight.recycleSalvageUsages.length > 0 || insight.repairNeeds.length > 0)) ||
        upgradeBaseItemIds.has(ownedItem.itemId);
      if (!hasRelevance) {
        // For unstacked items, use itemId without the __suffix
        ids.add(ownedItem.itemId);
      }
    }
    return ids;
  }, [ownedItemRows, itemInsights, upgradeBaseItemIds]);

  // Get unique categories from owned items
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of ownedItemRows) {
      const plannerItem = itemsMap[item.itemId];
      if (plannerItem) {
        cats.add(plannerItem.category);
      }
    }
    return Array.from(cats).sort((a, b) => compareText(getLocalizedQuartermasterCategory(t, a), getLocalizedQuartermasterCategory(t, b)));
  }, [ownedItemRows, itemsMap, compareText, t]);

  // Filter and sort owned items
  const filteredItems = useMemo(() => {
    return ownedItemRows
      .filter(ownedItem => {
        const item = itemsMap[ownedItem.itemId];
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

        // Useless filter — show only items with no planner relevance
        if (showOnlyUseless && !uselessItemIds.has(ownedItem.itemId)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const itemA = itemsMap[a.itemId];
        const itemB = itemsMap[b.itemId];
        const nameCompare = compareText(itemA?.name ?? '', itemB?.name ?? '');
        if (nameCompare !== 0) return nameCompare;
        // Secondary sort: durability descending (better condition first)
        const durabilityA = a.durabilityPercent ?? 100;
        const durabilityB = b.durabilityPercent ?? 100;
        return durabilityB - durabilityA;
      });
  }, [ownedItemRows, itemsMap, searchQuery, categoryFilter, rarityFilter, showOnlyUseless, uselessItemIds, compareText]);

  // Calculate total value
  const totalValue = useMemo(() => {
    return ownedItemRows.reduce((sum, ownedItem) => {
      const item = itemsMap[ownedItem.itemId];
      return sum + (item?.value ?? 0) * ownedItem.quantity;
    }, 0);
  }, [ownedItemRows, itemsMap]);
  const planRowsByItemId = useMemo(() => {
    const map = new Map(plannerResult.planRows.map((row) => [row.itemId, row]));
    return map;
  }, [plannerResult.planRows]);
  const ingredientMissingByItemId = useMemo(() => {
    return new Map(Object.entries(plannerResult.remainingIngredientDeficits));
  }, [plannerResult.remainingIngredientDeficits]);

  const tooltipContext = useMemo(() => ({
    itemsMap,
    plannerResult,
    itemInsights,
  }), [itemsMap, plannerResult, itemInsights]);

  const getRequirementListNames = (itemId: string): string[] => {
    const insight = itemInsights[itemId];
    if (!insight) return [];
    const listNames = new Set<string>();
    for (const need of insight.finalListNeeds) listNames.add(need.listName);
    for (const need of insight.craftingNeeds) listNames.add(need.listName);
    return Array.from(listNames).sort(compareText);
  };

  const getRecycleReasonLabel = (itemId: string): string => {
    const action = plannerResult.recyclePlan.actions.find(a => a.srcItemId === itemId);
    if (!action || action.reasons.length === 0) return '';
    const reason = action.reasons[0];
    return `${reason.targetItemName} (${reason.listName})`;
  };

  const getDurabilityColor = (percent: number): string => {
    if (percent < 30) return '#e74c3c';
    if (percent <= 70) return '#f0ad4e';
    return '#27ae60';
  };

  const getRequirementLabel = (listNames: string[]): string => {
    if (listNames.length === 0) return t('quartermaster.stash.activeRequirements');
    if (listNames.length === 1) return listNames[0];
    return tm('quartermaster.stash.acrossLists', { count: listNames.length });
  };

  const getLocationLabels = (locations: OwnedItemLocation[]): string[] => {
    const labels: string[] = [];
    for (const location of locations) {
      switch (location.source) {
        case 'loadout':
          labels.push(t('quartermaster.stash.locations.inCurrentLoadout'));
          break;
        case 'stash_attachment':
          labels.push(tm('quartermaster.stash.locations.attachedInStash', { item: location.parentName }));
          break;
        case 'loadout_attachment':
          labels.push(tm('quartermaster.stash.locations.attachedInLoadout', { item: location.parentName }));
          break;
        default:
          break;
      }
    }

    const uniqueLabels = Array.from(new Set(labels));
    if (uniqueLabels.length <= 2) return uniqueLabels;
    return [
      ...uniqueLabels.slice(0, 2),
      tm('quartermaster.stash.locations.more', { count: uniqueLabels.length - 2 }),
    ];
  };

  const hasCountedAttachments = (locations: OwnedItemLocation[]): boolean => {
    return locations.some((location) =>
      (location.source === 'stash' || location.source === 'loadout') && location.hasAttachments,
    );
  };

  const missingSources = useMemo(() => {
    const sources: string[] = [];
    if (!hasInventoryCache) sources.push(t('quartermaster.stash.inventorySource'));
    if (!hasLoadoutCache) sources.push(t('quartermaster.stash.loadoutSource'));
    return sources;
  }, [hasInventoryCache, hasLoadoutCache, t]);

  const syncLabel = syncStep === 'inventory'
    ? t('quartermaster.stash.syncingInventory')
    : syncStep === 'loadout'
      ? t('quartermaster.stash.syncingLoadout')
      : t('quartermaster.stash.syncMyItems');

  return (
    <div className="stash-view">
      <div className="stash-view__controls">
        {showSyncButton && (
          <button
            className="qm-button"
            onClick={onSyncMyItems}
            disabled={isSyncing}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {syncLabel}
          </button>
        )}

        <div className="stash-view__search">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              className="qm-input"
              placeholder={t('quartermaster.stash.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              style={{ paddingLeft: 28, width: '100%' }}
            />
          </div>
        </div>

        <div className="stash-view__filters">
          <select
            className="qm-input stash-view__filter"
            value={categoryFilter}
            onChange={(e) => setFilters(prev => ({ ...prev, categoryFilter: e.target.value }))}
          >
            <option value="all">{t('quartermaster.stash.allCategories')}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{getLocalizedQuartermasterCategory(t, cat)}</option>
            ))}
          </select>

          <select
            className="qm-input stash-view__filter"
            value={rarityFilter}
            onChange={(e) => setFilters(prev => ({ ...prev, rarityFilter: e.target.value }))}
          >
            <option value="all">{t('quartermaster.stash.allRarities')}</option>
            <option value="Common">{getLocalizedQuartermasterRarity(t, 'Common')}</option>
            <option value="Uncommon">{getLocalizedQuartermasterRarity(t, 'Uncommon')}</option>
            <option value="Rare">{getLocalizedQuartermasterRarity(t, 'Rare')}</option>
            <option value="Epic">{getLocalizedQuartermasterRarity(t, 'Epic')}</option>
            <option value="Legendary">{getLocalizedQuartermasterRarity(t, 'Legendary')}</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }} title={t('quartermaster.stash.showOnlyUselessTooltip')}>
            <input
              type="checkbox"
              checked={showOnlyUseless}
              onChange={(e) => setFilters(prev => ({ ...prev, showOnlyUseless: e.target.checked }))}
            />
            {t('quartermaster.stash.showOnlyUseless')}
          </label>
        </div>

        <div className="stash-view__value">
          {t('quartermaster.stash.totalValue')}: <span>{formatNumber(totalValue)}</span>
        </div>
      </div>

      {unknownEmbarkItems.length > 0 && (
        <details className="stash-view__unknown-items">
          <summary>
            {tm('quartermaster.stash.unknownEmbarkItems', { count: unknownEmbarkItems.length })}
          </summary>
          <div className="stash-view__unknown-list">
            {unknownEmbarkItems.slice(0, 20).map((item, index) => (
              <span key={`${item.gameAssetId}-${index}`} className="stash-view__unknown-item">
                {item.context}: {item.gameAssetId}
                {item.amount ? ` x${item.amount}` : ''}
              </span>
            ))}
          </div>
        </details>
      )}

      {missingSources.length > 0 && (
        <div className="stash-view__warning">
          <Info size={16} />
          <span>
            {tm('quartermaster.stash.syncSetupHint', { sources: missingSources.join(', ') })}
          </span>
        </div>
      )}

      {ownedItemRows.length === 0 ? (
        <div className="qm-empty-state">
          <Package size={48} />
          <p>{t('quartermaster.stash.empty')}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="qm-empty-state">
          <Search size={48} />
          <p>{t('quartermaster.stash.noMatches')}</p>
        </div>
      ) : (
        <table className="qm-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>{t('quartermaster.stash.columns.icon')}</th>
              <th>{t('quartermaster.stash.columns.item')}</th>
              <th>{t('quartermaster.stash.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(ownedItem => {
              const item = itemsMap[ownedItem.itemId];
              if (!item) return null;
              
              const planRow = planRowsByItemId.get(ownedItem.itemId);
              const toRecycle = recycleItemIds.has(ownedItem.itemId);
              const isUpgradeBase = upgradeBaseItemIds.has(ownedItem.itemId);
              const listNames = getRequirementListNames(ownedItem.itemId);
              const requirementLabel = getRequirementLabel(listNames);
              const ingredientMissing = ingredientMissingByItemId.get(ownedItem.itemId) ?? 0;
              const required = planRow?.required ?? (ingredientMissing > 0 ? ownedItem.quantity + ingredientMissing : 0);
              const missing = planRow?.missing ?? ingredientMissing;
              const recycleReason = getRecycleReasonLabel(ownedItem.itemId);
              const hasRequirement = required > 0;
              const locationLabels = getLocationLabels(ownedItem.locations);
              const attachmentsCounted = hasCountedAttachments(ownedItem.locations);

              const rowKey = ownedItem.instanceIndex !== undefined
                ? `${ownedItem.itemId}__${ownedItem.instanceIndex}`
                : ownedItem.itemId;

              return (
                <tr key={rowKey}>
                  <td>
                    <ItemIcon
                      itemId={item.id}
                      name={item.name}
                      icon={item.icon}
                      rarity={item.rarity}
                      quantity={getOwnedQuantity(item.id)}
                      size="sm"
                      showName={false}
                      showQuantity={ownedItem.instanceIndex === undefined}
                      tooltipContext={tooltipContext}
                    />
                  </td>
                  <td>
                    <span className="qm-item-name">{item.name}</span>
                    {locationLabels.length > 0 && (
                      <div className="stash-view__locations">
                        {locationLabels.map((label) => (
                          <div key={label}>{label}</div>
                        ))}
                      </div>
                    )}
                    {attachmentsCounted && (
                      <div className="stash-view__attachment-note">
                        <Paperclip size={12} />
                        {t('quartermaster.stash.attachmentsCounted')}
                      </div>
                    )}
                    {item.repairCost && ownedItem.durabilityPercent !== undefined && (
                      <div className="stash-view__durability">
                        <div className="stash-view__durability-bar-wrapper">
                          <div
                            className="stash-view__durability-bar"
                            style={{
                              width: `${Math.min(100, Math.max(0, ownedItem.durabilityPercent))}%`,
                              backgroundColor: getDurabilityColor(ownedItem.durabilityPercent),
                            }}
                          />
                        </div>
                        <span className="stash-view__durability-label">
                          {ownedItem.durabilityPercent.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="stash-view__status-stack">
                      {missing === 0 && hasRequirement && (
                        <span className="stash-view__indicator stash-view__indicator--have">
                          {tm('quartermaster.stash.status.haveRequired', {
                            owned: ownedItem.quantity,
                            required,
                            source: requirementLabel,
                          })}
                        </span>
                      )}
                      {missing > 0 && (
                        <span className="stash-view__indicator stash-view__indicator--missing">
                          {tm('quartermaster.stash.status.needMore', {
                            missing,
                            source: requirementLabel,
                            required,
                            owned: ownedItem.quantity,
                          })}
                        </span>
                      )}
                      {!hasRequirement && (
                        <span className="stash-view__indicator stash-view__indicator--owned">
                          {tm('quartermaster.stash.status.owned', { owned: ownedItem.quantity })}
                        </span>
                      )}
                      {toRecycle && (
                        <span className="stash-view__indicator stash-view__indicator--recycle">
                          {t('quartermaster.status.recycle')}{recycleReason ? ` · ${recycleReason}` : ''}
                        </span>
                      )}
                      {isUpgradeBase && (
                        <span className="stash-view__indicator stash-view__indicator--have">
                          {t('quartermaster.stash.status.upgradeBase')}
                        </span>
                      )}
                      {planRow?.isUncraftable && (
                        <span className="stash-view__indicator stash-view__indicator--uncraftable">
                          {getUncraftableReasonLabel(t, planRow.uncraftableReason)}
                        </span>
                      )}
                    </div>
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
