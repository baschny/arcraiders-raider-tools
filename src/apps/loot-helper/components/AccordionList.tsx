import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, Filter, LayoutGrid, List, Inbox, Recycle, Hammer } from 'lucide-react';
import type { Item, ItemsMap, ItemRarity } from '../types/item';
import type { ReverseMap } from '../utils/craftingChain';
import { ItemHierarchy } from './ItemHierarchy';
import { ItemIconWithInfo } from './ItemIconWithInfo';
import { ItemDetailModal } from './ItemDetailModal';
import { ActionIcon } from './ActionIcon';
import { getRarityClass, getLocationIcon } from '../utils/dataLoader';
import { getItemAction, type ItemAction } from '../utils/itemAction';
import {
  getItemDisplayName,
  getLocalizedLootHelperLocation,
  getLocalizedLootHelperRarity,
  getLocalizedLootHelperType,
  getLootHelperItemName,
  LOOT_HELPER_LOCATION_ORDER,
  LOOT_HELPER_RARITY_ORDER,
} from '../utils/localization';
import { useLocale } from '../../../shared/context/LocaleContext';
import { lootStore, useStore } from '../../../shared/state/stores';

const FILTERS_EXPANDED_STORAGE_KEY = 'loot-helper:filters-expanded';
const GROUP_BY_STORAGE_KEY = 'loot-helper:group-by';

type GroupBy = 'alphabet' | 'salvage' | 'goals';
const VALID_GROUP_BYS: readonly GroupBy[] = ['alphabet', 'salvage', 'goals'] as const;

interface ItemGroup {
  key: string;
  /** When undefined, the group renders without a header (used for the
   *  default "alphabet" grouping which is a single flat list). */
  header?: ReactNode;
  items: Item[];
  /** When true, the header is clickable to collapse/expand the group. */
  collapsible?: boolean;
  /** Optional CSS hook for action-coloured headers (salvage grouping). */
  action?: ItemAction;
}

interface AccordionListProps {
  itemsMap: ItemsMap;
  goalItemIds: string[];
  reverseMap: ReverseMap;
  stashItemIds: Set<string>;
  onToggleStashItem: (itemId: string) => void;
}

export function AccordionList({ itemsMap, goalItemIds, reverseMap, stashItemIds, onToggleStashItem }: AccordionListProps) {
  const { t, tm, compareText } = useLocale();
  const [lootState, setLootState] = useStore(lootStore);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'accordion' | 'grid'>('accordion');
  const [selectedGridItemId, setSelectedGridItemId] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(FILTERS_EXPANDED_STORAGE_KEY);
      return saved === null ? true : JSON.parse(saved);
    } catch {
      return true;
    }
  });
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    try {
      const saved = localStorage.getItem(GROUP_BY_STORAGE_KEY);
      if (saved && (VALID_GROUP_BYS as readonly string[]).includes(saved)) {
        return saved as GroupBy;
      }
    } catch {
      // ignore
    }
    return 'alphabet';
  });
  const [collapsedGoalGroups, setCollapsedGoalGroups] = useState<Set<string>>(new Set());
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get all items that are in the reverse map (i.e., needed for crafting)
  // Exclude goal items and stash items from the list
  const requiredItemIds = Array.from(reverseMap.keys()).filter(
    (id) => !goalItemIds.includes(id) && !stashItemIds.has(id)
  );

  // Get all possible items from the entire itemsMap (for filter options)
  // Use the same filter logic as findSalvageableSources in craftingChain.ts
  const allPossibleItems = Object.values(itemsMap).filter((item) => {
    // Skip Basic Materials
    if (item.type === 'Basic Material') return false;
    
    // Skip weapons and modifications
    if (item.isWeapon || item.type === 'Modification') return false;
    
    // Include items that can be salvaged, recycled, or used in recipes
    const hasSalvage = item.salvagesInto && Object.keys(item.salvagesInto).length > 0;
    const hasRecycle = item.recyclesInto && Object.keys(item.recyclesInto).length > 0;
    
    // Check if item is used in any recipe
    const isUsedInRecipe = Object.values(itemsMap).some((otherItem) => {
      return otherItem.recipe && Object.keys(otherItem.recipe).includes(item.id);
    });
    
    return hasSalvage || hasRecycle || isUsedInRecipe;
  });

  // Get all unique types, rarities, and locations from all items
  const rarityOrder: ItemRarity[] = LOOT_HELPER_RARITY_ORDER;
  const locationOrder = LOOT_HELPER_LOCATION_ORDER;
  
  const allPossibleTypes = Array.from(
    new Set(allPossibleItems.map((item) => item.type))
  ).sort((a, b) => compareText(getLocalizedLootHelperType(t, a), getLocalizedLootHelperType(t, b)));

  const allPossibleRarities = Array.from(
    new Set(allPossibleItems.map((item) => item.rarity))
  ).sort((a, b) => rarityOrder.indexOf(a) - rarityOrder.indexOf(b));

  const allPossibleLocations = Array.from(
    new Set(allPossibleItems.flatMap((item) => item.foundIn || []))
  ).sort((a, b) => {
    const indexA = locationOrder.indexOf(a);
    const indexB = locationOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) {
      return compareText(getLocalizedLootHelperLocation(t, a), getLocalizedLootHelperLocation(t, b));
    }
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const enabledTypes = useMemo(
    () => new Set(lootState.enabledTypes ?? allPossibleTypes),
    [allPossibleTypes, lootState.enabledTypes]
  );
  const enabledRarities = useMemo(
    () => new Set<ItemRarity>((lootState.enabledRarities as ItemRarity[] | null) ?? allPossibleRarities),
    [allPossibleRarities, lootState.enabledRarities]
  );
  const enabledLocations = useMemo(
    () => new Set(lootState.enabledLocations ?? allPossibleLocations),
    [allPossibleLocations, lootState.enabledLocations]
  );
  const patchLootFilters = (next: {
    enabledTypes?: string[];
    enabledRarities?: string[];
    enabledLocations?: string[];
  }) => {
    setLootState({ ...lootStore.get(), ...next });
  };

  // Get items and sort alphabetically (this is the filtered list)
  // Filter out Basic Materials, weapons, and modifications (same as allPossibleItems filter)
  const sortedItems = requiredItemIds
    .map((id) => itemsMap[id])
    .filter((item) => {
      if (!item) return false;
      // Skip Basic Materials
      if (item.type === 'Basic Material') return false;
      // Skip weapons and modifications
      if (item.isWeapon || item.type === 'Modification') return false;
      return true;
    })
    .sort((a, b) => compareText(getItemDisplayName(a), getItemDisplayName(b)));

  // Initialize view mode from localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('view-mode') as 'accordion' | 'grid';
    if (savedViewMode) {
      setViewMode(savedViewMode);
    }
  }, []);

  const handleSetViewMode = (mode: 'accordion' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('view-mode', mode);
  };

  // Calculate match counts for each filter option
  const typeMatchCounts = new Map<string, number>();
  const rarityMatchCounts = new Map<ItemRarity, number>();
  const locationMatchCounts = new Map<string, number>();

  sortedItems.forEach((item) => {
    // Count types
    typeMatchCounts.set(item.type, (typeMatchCounts.get(item.type) || 0) + 1);
    
    // Count rarities
    rarityMatchCounts.set(item.rarity, (rarityMatchCounts.get(item.rarity) || 0) + 1);
    
    // Count locations
    if (item.foundIn) {
      item.foundIn.forEach((location) => {
        locationMatchCounts.set(location, (locationMatchCounts.get(location) || 0) + 1);
      });
    }
  });

  // Filter based on search term, enabled types, enabled rarities, and enabled locations
  const filteredItems = sortedItems.filter((item) => {
    // Filter by search term
    if (searchTerm.trim() && !getItemDisplayName(item).toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    // Filter by type
    if (!enabledTypes.has(item.type)) {
      return false;
    }
    // Filter by rarity
    if (!enabledRarities.has(item.rarity)) {
      return false;
    }
    // Filter by location - item must have at least one enabled location
    if (item.foundIn && item.foundIn.length > 0) {
      const hasEnabledLocation = item.foundIn.some((location) => enabledLocations.has(location));
      if (!hasEnabledLocation) {
        return false;
      }
    }
    return true;
  });

  const getGoalCount = (itemId: string) => {
    const usageInfo = reverseMap.get(itemId) || [];
    return new Set(
      usageInfo.flatMap((usage) => usage.goalItemIds)
    ).size;
  };

  const getPriorityLevel = (goalCount: number) => {
    if (goalCount >= 4) return 'high';
    if (goalCount >= 2) return 'medium';
    return 'default';
  };

  // Auto-expand when only one result
  useEffect(() => {
    if (filteredItems.length === 1 && searchTerm.trim()) {
      setExpandedItemId(filteredItems[0].id);
    }
  }, [filteredItems, searchTerm]);

  const handleToggleItem = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const handleNavigateToItem = (itemId: string) => {
    setExpandedItemId(itemId);
    
    // Scroll to the item
    setTimeout(() => {
      const element = itemRefs.current.get(itemId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleToggleType = (type: string) => {
    const newEnabledTypes = new Set(enabledTypes);
    if (newEnabledTypes.has(type)) {
      newEnabledTypes.delete(type);
    } else {
      newEnabledTypes.add(type);
    }
    patchLootFilters({ enabledTypes: Array.from(newEnabledTypes) });
  };

  const handleEnableAllTypes = () => {
    const allTypesSet = new Set(allPossibleTypes);
    patchLootFilters({ enabledTypes: Array.from(allTypesSet) });
  };

  const handleDisableAllTypes = () => {
    const emptySet = new Set<string>();
    patchLootFilters({ enabledTypes: Array.from(emptySet) });
  };

  const handleToggleRarity = (rarity: ItemRarity) => {
    const newEnabledRarities = new Set(enabledRarities);
    if (newEnabledRarities.has(rarity)) {
      newEnabledRarities.delete(rarity);
    } else {
      newEnabledRarities.add(rarity);
    }
    patchLootFilters({ enabledRarities: Array.from(newEnabledRarities) });
  };

  const handleEnableAllRarities = () => {
    const allRaritiesSet = new Set(allPossibleRarities);
    patchLootFilters({ enabledRarities: Array.from(allRaritiesSet) });
  };

  const handleDisableAllRarities = () => {
    const emptySet = new Set<ItemRarity>();
    patchLootFilters({ enabledRarities: Array.from(emptySet) });
  };

  const handleToggleLocation = (location: string) => {
    const newEnabledLocations = new Set(enabledLocations);
    if (newEnabledLocations.has(location)) {
      newEnabledLocations.delete(location);
    } else {
      newEnabledLocations.add(location);
    }
    patchLootFilters({ enabledLocations: Array.from(newEnabledLocations) });
  };

  const handleEnableAllLocations = () => {
    const allLocationsSet = new Set(allPossibleLocations);
    patchLootFilters({ enabledLocations: Array.from(allLocationsSet) });
  };

  const handleDisableAllLocations = () => {
    const emptySet = new Set<string>();
    patchLootFilters({ enabledLocations: Array.from(emptySet) });
  };

  const handleSetGroupBy = (mode: GroupBy) => {
    setGroupBy(mode);
    try {
      localStorage.setItem(GROUP_BY_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }
  };

  const toggleGoalGroupCollapsed = (goalId: string) => {
    setCollapsedGoalGroups((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  };

  const handleToggleFilters = () => {
    const newExpanded = !filtersExpanded;
    setFiltersExpanded(newExpanded);
    try {
      localStorage.setItem(FILTERS_EXPANDED_STORAGE_KEY, JSON.stringify(newExpanded));
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }

    // Focus search input when expanding
    if (newExpanded) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  /**
   * Compute the groups to render based on the current groupBy setting.
   * Each group preserves alphabetical ordering of its items.
   */
  const itemGroups: ItemGroup[] = (() => {
    if (groupBy === 'salvage') {
      const buckets: Record<'keep' | 'recycle' | 'salvage', Item[]> = {
        keep: [],
        recycle: [],
        salvage: [],
      };
      for (const item of filteredItems) {
        const action = getItemAction(item.id, reverseMap);
        if (action === 'keep' || action === 'recycle' || action === 'salvage') {
          buckets[action].push(item);
        }
      }
      const renderHeader = (action: 'keep' | 'recycle' | 'salvage', label: string, Icon: typeof Inbox, count: number) => (
        <>
          <div className={`item-group-title action-${action}`}>
            <Icon size={18} />
            <span>{label}</span>
          </div>
          <span className="item-group-count">{count}</span>
        </>
      );
      return [
        {
          key: 'keep',
          action: 'keep' as ItemAction,
          items: buckets.keep,
          header: renderHeader('keep', t('lootHelper.actions.keep'), Inbox, buckets.keep.length),
        },
        {
          key: 'recycle',
          action: 'recycle' as ItemAction,
          items: buckets.recycle,
          header: renderHeader('recycle', t('lootHelper.actions.recycle'), Recycle, buckets.recycle.length),
        },
        {
          key: 'salvage',
          action: 'salvage' as ItemAction,
          items: buckets.salvage,
          header: renderHeader('salvage', t('lootHelper.actions.salvage'), Hammer, buckets.salvage.length),
        },
      ];
    }

    if (groupBy === 'goals') {
      // One group per enabled goal, in the order the user arranged them.
      // `goalItemIds` here is already filtered to enabled goals at the call site.
      return goalItemIds
        .map((goalId): ItemGroup | null => {
          const goalItem = itemsMap[goalId];
          if (!goalItem) return null;
          const items = filteredItems.filter((item) => {
            const usages = reverseMap.get(item.id);
            if (!usages) return false;
            return usages.some((u) => u.goalItemIds.includes(goalId));
          });
          return {
            key: `goal-${goalId}`,
            collapsible: true,
            items,
            header: (
              <>
                <div className="item-group-title">
                  {goalItem.imageFilename && (
                    <img
                      src={goalItem.imageFilename}
                      alt={getLootHelperItemName(goalItem)}
                      className={`item-group-goal-icon ${getRarityClass(goalItem.rarity)}`}
                    />
                  )}
                  <span>{getLootHelperItemName(goalItem)}</span>
                </div>
                <span className="item-group-count">{items.length}</span>
              </>
            ),
          };
        })
        .filter((g): g is ItemGroup => g !== null);
    }

    // 'alphabet' (default): a single flat group with no header.
    return [{ key: 'all', items: filteredItems }];
  })();

  /** Render a single grid tile. `prevItemName` is used to decide whether
   *  a letter badge should appear (so badges reset within each group). */
  const renderGridItem = (item: Item, prevItemName: string | null) => {
    const goalCount = getGoalCount(item.id);
    const priorityLevel = getPriorityLevel(goalCount);
    const itemAction = getItemAction(item.id, reverseMap);

    const firstLetter = getItemDisplayName(item)[0].toUpperCase();
    const isFirstOfLetter =
      prevItemName === null || prevItemName[0].toUpperCase() !== firstLetter;

    return (
      <div
        key={item.id}
        className={`grid-item priority-${priorityLevel}`}
        onClick={() => setSelectedGridItemId(item.id)}
      >
        {isFirstOfLetter && (
          <div className="grid-item-letter-badge">{firstLetter}</div>
        )}
        <div className="grid-item-icon-container">
          <ItemIconWithInfo
            item={item}
            itemsMap={itemsMap}
            className={`grid-item-icon ${getRarityClass(item.rarity)}`}
          />
          <ActionIcon
            action={itemAction}
            size={16}
            className="grid-item-action-icon"
          />
        </div>
        <span className="grid-item-title">{getItemDisplayName(item)}</span>
      </div>
    );
  };

  /** Render a single accordion item. */
  const renderAccordionItem = (item: Item) => {
    const isExpanded = expandedItemId === item.id;
    const isGoal = goalItemIds.includes(item.id);
    const goalCount = getGoalCount(item.id);
    const priorityLevel = getPriorityLevel(goalCount);
    const itemAction = getItemAction(item.id, reverseMap);

    return (
      <div
        key={item.id}
        ref={(el) => {
          if (el) {
            itemRefs.current.set(item.id, el);
          } else {
            itemRefs.current.delete(item.id);
          }
        }}
        className={`accordion-item ${isExpanded ? 'expanded' : ''} ${
          isGoal ? 'goal-item' : ''
        } priority-${priorityLevel}`}
      >
        <div
          className="accordion-item-header"
          onClick={() => handleToggleItem(item.id)}
        >
          <div className="accordion-item-header-content">
            {item.imageFilename && (
              <ItemIconWithInfo
                item={item}
                itemsMap={itemsMap}
                className={`accordion-item-icon ${getRarityClass(item.rarity)}`}
              />
            )}
            <ActionIcon
              action={itemAction}
              size={18}
              className="accordion-item-action-icon"
            />
            <span className="accordion-item-name">{getItemDisplayName(item)}</span>
            {isGoal && <span className="accordion-item-goal-badge">{t('lootHelper.badges.goal')}</span>}
          </div>
          <div className="accordion-item-header-right">
            {!isGoal && (
              <button
                className="accordion-item-stash-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStashItem(item.id);
                }}
                title={t('lootHelper.sidebar.stashEnoughTitle')}
              >
                −
              </button>
            )}
            {goalCount > 0 && (
              <span className={`accordion-item-goal-count priority-${priorityLevel}`}>
                ×{goalCount}
              </span>
            )}
            <span className="accordion-item-toggle">
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="accordion-item-content">
            <ItemHierarchy
              itemId={item.id}
              itemsMap={itemsMap}
              reverseMap={reverseMap}
              goalItemIds={goalItemIds}
              onNavigateToItem={handleNavigateToItem}
            />
          </div>
        )}
      </div>
    );
  };

  // Build summary for collapsed state
  const getFilterSummary = () => {
    return (
      <div className="filters-summary-content">
        {searchTerm.trim() && (
          <span className="filter-summary-search">"{searchTerm}"</span>
        )}
        
        {enabledTypes.size === 0 ? (
          <span className="filter-summary-none">{t('lootHelper.filters.none')}</span>
        ) : enabledTypes.size < allPossibleTypes.length ? (
          <div className="filter-summary-badges">
            {Array.from(enabledTypes).sort().map((type) => (
              <span key={type} className={`filter-summary-badge type-badge ${filtersExpanded ? 'faded' : ''}`}>
                {getLocalizedLootHelperType(t, type)}
              </span>
            ))}
          </div>
        ) : null}
        
        {enabledRarities.size === 0 ? (
          <span className="filter-summary-none">{t('lootHelper.filters.none')}</span>
        ) : enabledRarities.size < allPossibleRarities.length ? (
          <div className="filter-summary-badges">
            {Array.from(enabledRarities).sort((a, b) => 
              rarityOrder.indexOf(a) - rarityOrder.indexOf(b)
            ).map((rarity) => (
              <span 
                key={rarity} 
                className={`filter-summary-badge rarity-badge rarity-${rarity.toLowerCase()} ${filtersExpanded ? 'faded' : ''}`}
              >
                {getLocalizedLootHelperRarity(t, rarity)}
              </span>
            ))}
          </div>
        ) : null}
        
        {enabledLocations.size === 0 ? (
          <span className="filter-summary-none">{t('lootHelper.filters.none')}</span>
        ) : enabledLocations.size < allPossibleLocations.length ? (
          <div className="filter-summary-badges">
            {Array.from(enabledLocations).sort((a, b) => {
              const indexA = locationOrder.indexOf(a);
              const indexB = locationOrder.indexOf(b);
              if (indexA === -1 && indexB === -1) {
                return compareText(getLocalizedLootHelperLocation(t, a), getLocalizedLootHelperLocation(t, b));
              }
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            }).map((location) => {
              const iconFile = getLocationIcon(location);
              return (
                <span 
                  key={location} 
                  className={`filter-summary-badge location-badge ${filtersExpanded ? 'faded' : ''}`}
                  title={getLocalizedLootHelperLocation(t, location)}
                >
                  {iconFile ? (
                    <img 
                      src={`/images/locations/${iconFile}`} 
                      alt={getLocalizedLootHelperLocation(t, location)}
                      className="location-badge-icon"
                    />
                  ) : (
                    <span className="location-badge-text">?</span>
                  )}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className="filters-section">
        <div className="list-controls">
          <div 
            className="filters-header"
            onClick={handleToggleFilters}
          >
            <div className="filters-header-content">
              <Filter size={16} />
              {getFilterSummary()}
            </div>
            <span className="filters-toggle">
              {filtersExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </div>
          <div className="group-by-switch" title={t('lootHelper.grouping.label')}>
            <select
              className="group-by-select"
              value={groupBy}
              onChange={(e) => handleSetGroupBy(e.target.value as GroupBy)}
              aria-label={t('lootHelper.grouping.label')}
            >
              <option value="alphabet">{t('lootHelper.grouping.alphabet')}</option>
              <option value="salvage">{t('lootHelper.grouping.salvage')}</option>
              <option value="goals" disabled={goalItemIds.length === 0}>
                {t('lootHelper.grouping.goals')}
              </option>
            </select>
          </div>
          <div className="view-switch">
             <button 
               className={`view-switch-btn ${viewMode === 'accordion' ? 'active' : ''}`}
               onClick={() => handleSetViewMode('accordion')}
               title={t('lootHelper.filters.listView')}
             >
               <List size={18} />
             </button>
             <button 
               className={`view-switch-btn ${viewMode === 'grid' ? 'active' : ''}`}
               onClick={() => handleSetViewMode('grid')}
               title={t('lootHelper.filters.gridView')}
             >
               <LayoutGrid size={18} />
             </button>
          </div>
        </div>

        {filtersExpanded && (
          <div className="filters-controls">
            <div className="filter-row">
              <label className="filter-label">{t('lootHelper.filters.search')}</label>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('lootHelper.filters.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="accordion-search-input"
              />
            </div>

            {allPossibleTypes.length > 0 && (
              <div className="filter-row">
                <label className="filter-label">{t('lootHelper.filters.type')}</label>
                <div className="filter-buttons">
                  <button
                    onClick={handleEnableAllTypes}
                    className="filter-action-button"
                    disabled={enabledTypes.size === allPossibleTypes.length}
                  >
                    {t('lootHelper.filters.all')}
                  </button>
                  <button
                    onClick={handleDisableAllTypes}
                    className="filter-action-button"
                    disabled={enabledTypes.size === 0}
                  >
                    {t('lootHelper.filters.none')}
                  </button>
                  {allPossibleTypes.map((type) => {
                    const count = typeMatchCounts.get(type) || 0;
                    return (
                      <button
                        key={type}
                        onClick={() => handleToggleType(type)}
                        className={`filter-button ${
                          enabledTypes.has(type) ? 'enabled' : 'disabled'
                        } ${count === 0 ? 'no-matches' : 'has-matches'}`}
                      >
                        {getLocalizedLootHelperType(t, type)}
                        <span className="filter-button-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {allPossibleRarities.length > 0 && (
              <div className="filter-row">
                <label className="filter-label">{t('lootHelper.filters.rarity')}</label>
                <div className="filter-buttons">
                  <button
                    onClick={handleEnableAllRarities}
                    className="filter-action-button"
                    disabled={enabledRarities.size === allPossibleRarities.length}
                  >
                    {t('lootHelper.filters.all')}
                  </button>
                  <button
                    onClick={handleDisableAllRarities}
                    className="filter-action-button"
                    disabled={enabledRarities.size === 0}
                  >
                    {t('lootHelper.filters.none')}
                  </button>
                  {allPossibleRarities.map((rarity) => {
                    const count = rarityMatchCounts.get(rarity) || 0;
                    return (
                      <button
                        key={rarity}
                        onClick={() => handleToggleRarity(rarity)}
                        className={`filter-button filter-rarity rarity-${rarity.toLowerCase()} ${
                          enabledRarities.has(rarity) ? 'enabled' : 'disabled'
                        } ${count === 0 ? 'no-matches' : 'has-matches'}`}
                      >
                        {getLocalizedLootHelperRarity(t, rarity)}
                        <span className="filter-button-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {allPossibleLocations.length > 0 && (
              <div className="filter-row">
                <label className="filter-label">{t('lootHelper.filters.location')}</label>
                <div className="filter-buttons">
                  <button
                    onClick={handleEnableAllLocations}
                    className="filter-action-button"
                    disabled={enabledLocations.size === allPossibleLocations.length}
                  >
                    {t('lootHelper.filters.all')}
                  </button>
                  <button
                    onClick={handleDisableAllLocations}
                    className="filter-action-button"
                    disabled={enabledLocations.size === 0}
                  >
                    {t('lootHelper.filters.none')}
                  </button>
                  {allPossibleLocations.map((location) => {
                    const iconFile = getLocationIcon(location);
                    const count = locationMatchCounts.get(location) || 0;
                    return (
                      <button
                        key={location}
                        onClick={() => handleToggleLocation(location)}
                        className={`filter-button filter-location ${
                          enabledLocations.has(location) ? 'enabled' : 'disabled'
                        } ${count === 0 ? 'no-matches' : 'has-matches'}`}
                        title={getLocalizedLootHelperLocation(t, location)}
                      >
                        {iconFile ? (
                          <img 
                            src={`/images/locations/${iconFile}`} 
                            alt={getLocalizedLootHelperLocation(t, location)}
                            className="location-filter-icon"
                          />
                        ) : (
                          <span className="location-filter-text">?</span>
                        )}
                        <span className="filter-button-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="accordion-items">
        {sortedItems.length === 0 ? (
          <div className="accordion-no-results">{t('lootHelper.results.noItemsNeeded')}</div>
        ) : filteredItems.length === 0 ? (
          <div className="accordion-no-results">{tm('lootHelper.results.noSearchResults', { query: searchTerm })}</div>
        ) : (
          itemGroups.map((group) => {
            const isCollapsed = group.collapsible && collapsedGoalGroups.has(
              group.key.startsWith('goal-') ? group.key.slice('goal-'.length) : group.key
            );
            return (
              <div
                key={group.key}
                className={`item-group ${group.action ? `item-group-${group.action}` : ''}`}
              >
                {group.header && (
                  <div
                    className={`item-group-header ${group.collapsible ? 'collapsible' : ''}`}
                    onClick={
                      group.collapsible
                        ? () =>
                            toggleGoalGroupCollapsed(
                              group.key.startsWith('goal-')
                                ? group.key.slice('goal-'.length)
                                : group.key
                            )
                        : undefined
                    }
                  >
                    {group.header}
                    {group.collapsible && (
                      <span className="item-group-toggle">
                        {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                      </span>
                    )}
                  </div>
                )}
                {!isCollapsed &&
                  (group.items.length === 0 ? (
                    <div className="accordion-no-results">{t('lootHelper.results.noItemsForGroup')}</div>
                  ) : viewMode === 'grid' ? (
                    <div className="items-grid">
                      {group.items.map((item, index) =>
                        renderGridItem(
                          item,
                          index === 0 ? null : getItemDisplayName(group.items[index - 1])
                        )
                      )}
                    </div>
                  ) : (
                    group.items.map((item) => renderAccordionItem(item))
                  ))}
              </div>
            );
          })
        )}
      </div>

      {selectedGridItemId && (
        <ItemDetailModal
          itemId={selectedGridItemId}
          itemsMap={itemsMap}
          reverseMap={reverseMap}
          goalItemIds={goalItemIds}
          onToggleStashItem={onToggleStashItem}
          onClose={() => setSelectedGridItemId(null)}
          onNavigateToItem={(id) => setSelectedGridItemId(id)}
        />
      )}
    </>
  );
}
