import type { Item, ItemsMap } from '../types/item';
import type { ReverseMap } from '../utils/craftingChain';
import { ItemIconWithInfo } from './ItemIconWithInfo';
import { getRarityClass } from '../utils/dataLoader';
import { Recycle, Wrench } from 'lucide-react';

/**
 * Check if salvaging an item is safe (doesn't lose materials compared to recycling)
 * Returns true if:
 * - Item has only recyclesInto (database inconsistency - treat as salvagesInto)
 * - Item has salvagesInto but no recyclesInto
 * - Item has both, but salvage yields >= recycle for all materials
 */
function isSafeSalvage(item: Item): boolean {
  const { salvagesInto, recyclesInto } = item;
  
  // If only recyclesInto exists (no salvagesInto), treat as safe salvage
  if (recyclesInto && !salvagesInto) {
    return true;
  }
  
  // If no salvage data at all, not applicable
  if (!salvagesInto) {
    return false;
  }
  
  // If no recycle data, salvaging is safe
  if (!recyclesInto) {
    return true;
  }
  
  // Check if all recycle materials are present in salvage with >= quantity
  for (const [materialId, recycleQty] of Object.entries(recyclesInto)) {
    const salvageQty = salvagesInto[materialId] || 0;
    if (salvageQty < recycleQty) {
      return false;
    }
  }
  
  return true;
}

interface ItemHierarchyProps {
  itemId: string;
  itemsMap: ItemsMap;
  reverseMap: ReverseMap;
  goalItemIds: string[];
  onNavigateToItem: (itemId: string) => void;
  maxDepth?: number;
  currentDepth?: number;
  visitedPath?: Set<string>;
}

export function ItemHierarchy({
  itemId,
  itemsMap,
  reverseMap,
  goalItemIds,
  onNavigateToItem,
  maxDepth = 10,
  currentDepth = 0,
  visitedPath = new Set(),
}: ItemHierarchyProps) {
  const item = itemsMap[itemId];
  const usages = reverseMap.get(itemId) || [];

  if (!item || currentDepth >= maxDepth) {
    return null;
  }

  // Add current item to visited path
  const currentVisitedPath = new Set(visitedPath);
  currentVisitedPath.add(itemId);

  const isGoal = goalItemIds.includes(itemId);

  return (
    <div className="item-hierarchy">
      {usages.length === 0 && !isGoal ? (
        <div className="hierarchy-leaf">
          This item is not used in any of your goal items.
        </div>
      ) : (
        <>
          {usages.map((usage, index) => {
            const parentItem = itemsMap[usage.parentItemId];
            if (!parentItem) return null;

            // Skip if we've already visited this item in the current path (loop detection)
            if (currentVisitedPath.has(usage.parentItemId)) {
              return null;
            }

            // Check if salvaging is safe for this item
            const safeSalvage = usage.relationship === 'salvage' && isSafeSalvage(parentItem);
            
            let relationshipText: string;
            let relationshipIcon: React.ReactNode = null;
            let quantityToShow = 1;
            
            if (usage.relationship === 'recycle') {
              quantityToShow = item.recyclesInto?.[usage.parentItemId] || 1;
              relationshipText = 'recycles into';
              relationshipIcon = <Recycle size={14} strokeWidth={2} className="hierarchy-relationship-icon action-recycle" />;
            } else if (usage.relationship === 'salvage') {
              // Check salvagesInto first, then fall back to recyclesInto for database inconsistency
              quantityToShow = item.salvagesInto?.[usage.parentItemId] || item.recyclesInto?.[usage.parentItemId] || 1;
              relationshipText = safeSalvage ? 'salvages into (safe)' : 'salvages into';
              relationshipIcon = <Wrench size={14} strokeWidth={2} className="hierarchy-relationship-icon action-salvage" />;
            } else {
              // For recipes: show how many of current material needed to build ONE parent item
              quantityToShow = parentItem.recipe?.[itemId] || 1;
              relationshipText = 'used to build';
            }

            const parentUsages = reverseMap.get(usage.parentItemId) || [];
            const parentIsGoal = goalItemIds.includes(usage.parentItemId);

            return (
              <div key={`${usage.parentItemId}-${index}`} className="hierarchy-branch">
                <div className="hierarchy-item">
                  <span className="hierarchy-relationship">
                    {usage.relationship === 'recipe' && quantityToShow > 1 && (
                      <span className="hierarchy-item-quantity">×{quantityToShow}</span>
                    )}
                    {relationshipIcon}
                    {relationshipText}:
                  </span>
                  <div
                    className="hierarchy-item-link"
                    onClick={() => onNavigateToItem(usage.parentItemId)}
                  >
                    {parentItem.imageFilename && (
                      <ItemIconWithInfo
                        item={parentItem}
                        itemsMap={itemsMap}
                        className={`hierarchy-item-icon ${getRarityClass(parentItem.rarity)}`}
                      />
                    )}
                    <span className="hierarchy-item-name">{parentItem.name.en}</span>
                    {(usage.relationship === 'salvage' || usage.relationship === 'recycle') && quantityToShow > 0 && (
                      <span className="hierarchy-item-quantity">×{quantityToShow}</span>
                    )}
                  </div>
                  {parentIsGoal && (
                    <span className="hierarchy-goal-badge">Goal</span>
                  )}
                </div>
                {parentUsages.length > 0 && (
                  <div className="hierarchy-nested">
                    <ItemHierarchy
                      itemId={usage.parentItemId}
                      itemsMap={itemsMap}
                      reverseMap={reverseMap}
                      goalItemIds={goalItemIds}
                      onNavigateToItem={onNavigateToItem}
                      maxDepth={maxDepth}
                      currentDepth={currentDepth + 1}
                      visitedPath={currentVisitedPath}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
