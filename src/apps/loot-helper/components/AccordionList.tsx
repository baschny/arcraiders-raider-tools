import { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Filter, LayoutGrid, List } from 'lucide-react';
import type { ItemsMap, ItemRarity } from '../types/item';
import type { ReverseMap } from '../utils/craftingChain';
import { ItemHierarchy } from './ItemHierarchy';
import { ItemIconWithInfo } from './ItemIconWithInfo';
import { ItemDetailModal } from './ItemDetailModal';
import { ActionIcon } from './ActionIcon';
import { getRarityClass, getLocationIcon } from '../utils/dataLoader';
import { getItemAction } from '../utils/itemAction';
import { loadEnabledTypes, saveEnabledTypes, loadEnabledRarities, saveEnabledRarities, loadEnabledLocations, saveEnabledLocations } from '../utils/storage';

interface AccordionListProps {
  itemsMap: ItemsMap;
  goalItemIds: string[];
  reverseMap: ReverseMap;
  stashItemIds: Set<string>;
  onToggleStashItem: (itemId: string) => void;
}

export function AccordionList({ itemsMap, goalItemIds, reverseMap, stashItemIds, onToggleStashItem }: AccordionListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'accordion' | 'grid'>('accordion');
  const [selectedGridItemId, setSelectedGridItemId] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [enabledRarities, setEnabledRarities] = useState<Set<ItemRarity>>(new Set());
  const [enabledLocations, setEnabledLocations] = useState<Set<string>>(new Set());
  const [filtersExpanded, setFiltersExpanded] = useState(true);
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
  const rarityOrder: ItemRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const locationOrder = ['Residential', 'Commercial', 'Old World', 'Technological', 'Medical', 'Mechanical', 'Industrial', 'Electrical', 'Arc', 'Unknown'];
  
  const allPossibleTypes = Array.from(
    new Set(allPossibleItems.map((item) => item.type))
  ).sort();

  const allPossibleRarities = Array.from(
    new Set(allPossibleItems.map((item) => item.rarity))
  ).sort((a, b) => rarityOrder.indexOf(a) - rarityOrder.indexOf(b));

  const allPossibleLocations = Array.from(
    new Set(allPossibleItems.flatMap((item) => item.foundIn || []))
  ).sort((a, b) => {
    const indexA = locationOrder.indexOf(a);
    const indexB = locationOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

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
    .sort((a, b) => a.name.en.localeCompare(b.name.en));

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

  // Initialize enabled types from localStorage or default to all types
  useEffect(() => {
    if (allPossibleTypes.length > 0 && enabledTypes.size === 0) {
      const savedTypes = loadEnabledTypes();
      if (savedTypes && savedTypes.size > 0) {
        setEnabledTypes(savedTypes);
      } else {
        setEnabledTypes(new Set(allPossibleTypes));
      }
    }
  }, [allPossibleTypes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize enabled rarities from localStorage or default to all rarities
  useEffect(() => {
    if (allPossibleRarities.length > 0 && enabledRarities.size === 0) {
      const savedRarities = loadEnabledRarities();
      if (savedRarities && savedRarities.size > 0) {
        setEnabledRarities(savedRarities as Set<ItemRarity>);
      } else {
        setEnabledRarities(new Set(allPossibleRarities));
      }
    }
  }, [allPossibleRarities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize enabled locations from localStorage or default to all locations
  useEffect(() => {
    if (allPossibleLocations.length > 0 && enabledLocations.size === 0) {
      const savedLocations = loadEnabledLocations();
      if (savedLocations && savedLocations.size > 0) {
        setEnabledLocations(savedLocations);
      } else {
        setEnabledLocations(new Set(allPossibleLocations));
      }
    }
  }, [allPossibleLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (searchTerm.trim() && !item.name.en.toLowerCase().includes(searchTerm.toLowerCase())) {
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
    setEnabledTypes(newEnabledTypes);
    saveEnabledTypes(newEnabledTypes);
  };

  const handleEnableAllTypes = () => {
    const allTypesSet = new Set(allPossibleTypes);
    setEnabledTypes(allTypesSet);
    saveEnabledTypes(allTypesSet);
  };

  const handleDisableAllTypes = () => {
    const emptySet = new Set<string>();
    setEnabledTypes(emptySet);
    saveEnabledTypes(emptySet);
  };

  const handleToggleRarity = (rarity: ItemRarity) => {
    const newEnabledRarities = new Set(enabledRarities);
    if (newEnabledRarities.has(rarity)) {
      newEnabledRarities.delete(rarity);
    } else {
      newEnabledRarities.add(rarity);
    }
    setEnabledRarities(newEnabledRarities);
    saveEnabledRarities(newEnabledRarities);
  };

  const handleEnableAllRarities = () => {
    const allRaritiesSet = new Set(allPossibleRarities);
    setEnabledRarities(allRaritiesSet);
    saveEnabledRarities(allRaritiesSet);
  };

  const handleDisableAllRarities = () => {
    const emptySet = new Set<ItemRarity>();
    setEnabledRarities(emptySet);
    saveEnabledRarities(emptySet);
  };

  const handleToggleLocation = (location: string) => {
    const newEnabledLocations = new Set(enabledLocations);
    if (newEnabledLocations.has(location)) {
      newEnabledLocations.delete(location);
    } else {
      newEnabledLocations.add(location);
    }
    setEnabledLocations(newEnabledLocations);
    saveEnabledLocations(newEnabledLocations);
  };

  const handleEnableAllLocations = () => {
    const allLocationsSet = new Set(allPossibleLocations);
    setEnabledLocations(allLocationsSet);
    saveEnabledLocations(allLocationsSet);
  };

  const handleDisableAllLocations = () => {
    const emptySet = new Set<string>();
    setEnabledLocations(emptySet);
    saveEnabledLocations(emptySet);
  };

  const handleToggleFilters = () => {
    const newExpanded = !filtersExpanded;
    setFiltersExpanded(newExpanded);
    
    // Focus search input when expanding
    if (newExpanded) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  // Build summary for collapsed state
  const getFilterSummary = () => {
    return (
      <div className="filters-summary-content">
        {searchTerm.trim() && (
          <span className="filter-summary-search">"{searchTerm}"</span>
        )}
        
        {enabledTypes.size === 0 ? (
          <span className="filter-summary-none">nothing</span>
        ) : enabledTypes.size < allPossibleTypes.length ? (
          <div className="filter-summary-badges">
            {Array.from(enabledTypes).sort().map((type) => (
              <span key={type} className={`filter-summary-badge type-badge ${filtersExpanded ? 'faded' : ''}`}>
                {type}
              </span>
            ))}
          </div>
        ) : null}
        
        {enabledRarities.size === 0 ? (
          <span className="filter-summary-none">nothing</span>
        ) : enabledRarities.size < allPossibleRarities.length ? (
          <div className="filter-summary-badges">
            {Array.from(enabledRarities).sort((a, b) => 
              rarityOrder.indexOf(a) - rarityOrder.indexOf(b)
            ).map((rarity) => (
              <span 
                key={rarity} 
                className={`filter-summary-badge rarity-badge rarity-${rarity.toLowerCase()} ${filtersExpanded ? 'faded' : ''}`}
              >
                {rarity}
              </span>
            ))}
          </div>
        ) : null}
        
        {enabledLocations.size === 0 ? (
          <span className="filter-summary-none">nothing</span>
        ) : enabledLocations.size < allPossibleLocations.length ? (
          <div className="filter-summary-badges">
            {Array.from(enabledLocations).sort((a, b) => {
              const indexA = locationOrder.indexOf(a);
              const indexB = locationOrder.indexOf(b);
              if (indexA === -1 && indexB === -1) return a.localeCompare(b);
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            }).map((location) => {
              const iconFile = getLocationIcon(location);
              return (
                <span 
                  key={location} 
                  className={`filter-summary-badge location-badge ${filtersExpanded ? 'faded' : ''}`}
                  title={location}
                >
                  {iconFile ? (
                    <img 
                      src={`/images/locations/${iconFile}`} 
                      alt={location}
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
          <div className="view-switch">
             <button 
               className={`view-switch-btn ${viewMode === 'accordion' ? 'active' : ''}`}
               onClick={() => handleSetViewMode('accordion')}
               title="List View"
             >
               <List size={18} />
             </button>
             <button 
               className={`view-switch-btn ${viewMode === 'grid' ? 'active' : ''}`}
               onClick={() => handleSetViewMode('grid')}
               title="Grid View"
             >
               <LayoutGrid size={18} />
             </button>
          </div>
        </div>

        {filtersExpanded && (
          <div className="filters-controls">
            <div className="filter-row">
              <label className="filter-label">Search</label>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Type to search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="accordion-search-input"
              />
            </div>

            {allPossibleTypes.length > 0 && (
              <div className="filter-row">
                <label className="filter-label">Type</label>
                <div className="filter-buttons">
                  <button
                    onClick={handleEnableAllTypes}
                    className="filter-action-button"
                    disabled={enabledTypes.size === allPossibleTypes.length}
                  >
                    All
                  </button>
                  <button
                    onClick={handleDisableAllTypes}
                    className="filter-action-button"
                    disabled={enabledTypes.size === 0}
                  >
                    None
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
                        {type}
                        <span className="filter-button-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {allPossibleRarities.length > 0 && (
              <div className="filter-row">
                <label className="filter-label">Rarity</label>
                <div className="filter-buttons">
                  <button
                    onClick={handleEnableAllRarities}
                    className="filter-action-button"
                    disabled={enabledRarities.size === allPossibleRarities.length}
                  >
                    All
                  </button>
                  <button
                    onClick={handleDisableAllRarities}
                    className="filter-action-button"
                    disabled={enabledRarities.size === 0}
                  >
                    None
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
                        {rarity}
                        <span className="filter-button-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {allPossibleLocations.length > 0 && (
              <div className="filter-row">
                <label className="filter-label">Location</label>
                <div className="filter-buttons">
                  <button
                    onClick={handleEnableAllLocations}
                    className="filter-action-button"
                    disabled={enabledLocations.size === allPossibleLocations.length}
                  >
                    All
                  </button>
                  <button
                    onClick={handleDisableAllLocations}
                    className="filter-action-button"
                    disabled={enabledLocations.size === 0}
                  >
                    None
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
                        title={location}
                      >
                        {iconFile ? (
                          <img 
                            src={`/images/locations/${iconFile}`} 
                            alt={location}
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
          <div className="accordion-no-results">No items needed for your goals.</div>
        ) : filteredItems.length === 0 ? (
          <div className="accordion-no-results">No items found matching "{searchTerm}"</div>
        ) : viewMode === 'grid' ? (
          <div className="items-grid">
            {filteredItems.map((item, index) => {
              const goalCount = getGoalCount(item.id);
              const priorityLevel = getPriorityLevel(goalCount);
              const itemAction = getItemAction(item.id, reverseMap);
              
              // Check if this is the first item with this starting letter
              const firstLetter = item.name.en[0].toUpperCase();
              const isFirstOfLetter = index === 0 || 
                filteredItems[index - 1].name.en[0].toUpperCase() !== firstLetter;

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
                  <span className="grid-item-title">{item.name.en}</span>
                </div>
              );
            })}
          </div>
        ) : (
          filteredItems.map((item) => {
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
                    <span className="accordion-item-name">{item.name.en}</span>
                    {isGoal && <span className="accordion-item-goal-badge">Goal</span>}
                  </div>
                  <div className="accordion-item-header-right">
                    {!isGoal && (
                      <button
                        className="accordion-item-stash-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStashItem(item.id);
                        }}
                        title="I have already enough of this material"
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
