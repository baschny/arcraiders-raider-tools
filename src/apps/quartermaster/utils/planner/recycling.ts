/**
 * Recycling Algorithm
 * See specification section 6.5
 */

import type { ItemsMap } from '../../types/item';
import type { ItemId, Qty, RecycleAction, RecyclePlan } from '../../types/planner';
import { NON_RECYCLABLE_CATEGORIES } from '../../types/item';

interface RecycleCandidate {
  srcItemId: ItemId;
  availableForRecycle: Qty;
  recyclesInto: Record<ItemId, Qty>;
  effectiveYield: number;
  coverageCount: number;
}

/**
 * Check if an item can be recycled
 */
function isRecyclable(
  itemId: ItemId,
  itemsMap: ItemsMap,
  availableForRecycle: Record<ItemId, Qty>,
  intermediateItems: Set<ItemId>,
  requiredFinalItems: Set<ItemId>
): boolean {
  const item = itemsMap[itemId];
  if (!item) return false;

  // Check category
  if (NON_RECYCLABLE_CATEGORIES.has(item.category)) {
    return false;
  }

  // Check availability
  if ((availableForRecycle[itemId] ?? 0) <= 0) {
    return false;
  }

  // Check recyclesInto defined
  if (!item.recyclesInto || Object.keys(item.recyclesInto).length === 0) {
    return false;
  }

  // KEEP precedence: not required for final loadout
  if (requiredFinalItems.has(itemId)) {
    return false;
  }

  // KEEP precedence: not required as intermediate craft ingredient
  if (intermediateItems.has(itemId)) {
    return false;
  }

  return true;
}

/**
 * Build recycle candidates with scoring
 */
function buildCandidates(
  itemsMap: ItemsMap,
  availableForRecycle: Record<ItemId, Qty>,
  deficits: Record<ItemId, Qty>,
  intermediateItems: Set<ItemId>,
  requiredFinalItems: Set<ItemId>
): RecycleCandidate[] {
  const candidates: RecycleCandidate[] = [];

  // Iterate in lexicographic order for determinism
  const sortedItemIds = Object.keys(availableForRecycle).sort();

  for (const srcItemId of sortedItemIds) {
    if (!isRecyclable(srcItemId, itemsMap, availableForRecycle, intermediateItems, requiredFinalItems)) {
      continue;
    }

    const item = itemsMap[srcItemId];
    const recyclesInto = item.recyclesInto!;

    // Find useful materials (those with positive deficit)
    const usefulMaterials: ItemId[] = [];
    for (const [matId, yield_] of Object.entries(recyclesInto)) {
      if ((deficits[matId] ?? 0) > 0 && yield_ > 0) {
        usefulMaterials.push(matId);
      }
    }

    // Skip if no useful materials
    if (usefulMaterials.length === 0) {
      continue;
    }

    // Calculate scores per 1 recycled unit
    const coverageCount = usefulMaterials.length;
    let effectiveYield = 0;
    for (const matId of usefulMaterials) {
      const yield_ = recyclesInto[matId];
      const deficit = deficits[matId] ?? 0;
      effectiveYield += Math.min(deficit, yield_);
    }

    candidates.push({
      srcItemId,
      availableForRecycle: availableForRecycle[srcItemId],
      recyclesInto,
      effectiveYield,
      coverageCount,
    });
  }

  return candidates;
}

/**
 * Select best candidate using deterministic comparator (section 6.5.2)
 * 1. Higher effectiveYield
 * 2. Higher coverageCount
 * 3. Lower srcItemId (lexicographic)
 */
function selectBestCandidate(candidates: RecycleCandidate[]): RecycleCandidate | null {
  if (candidates.length === 0) return null;

  return candidates.reduce((best, curr) => {
    // Higher effectiveYield
    if (curr.effectiveYield > best.effectiveYield) return curr;
    if (curr.effectiveYield < best.effectiveYield) return best;

    // Higher coverageCount
    if (curr.coverageCount > best.coverageCount) return curr;
    if (curr.coverageCount < best.coverageCount) return best;

    // Lower srcItemId
    return curr.srcItemId.localeCompare(best.srcItemId) < 0 ? curr : best;
  });
}

/**
 * Execute recycling algorithm
 * See specification section 6.5.2
 */
export function computeRecyclePlan(
  itemsMap: ItemsMap,
  stash: Record<ItemId, Qty>,
  reserved: Record<ItemId, Qty>,
  deficitsInput: Record<ItemId, Qty>,
  intermediateItems: Set<ItemId>,
  requiredFinalItems: Set<ItemId>
): RecyclePlan {
  const actions: RecycleAction[] = [];
  
  // Working copies
  const deficits = { ...deficitsInput };
  const availableForRecycle: Record<ItemId, Qty> = {};
  
  // Calculate available for recycle: have - reserved
  for (const itemId of Object.keys(stash)) {
    const have = stash[itemId] ?? 0;
    const reservedQty = reserved[itemId] ?? 0;
    availableForRecycle[itemId] = Math.max(0, have - reservedQty);
  }

  // Main recycling loop
  while (true) {
    // Build candidates based on current state
    const candidates = buildCandidates(
      itemsMap,
      availableForRecycle,
      deficits,
      intermediateItems,
      requiredFinalItems
    );

    // Select best candidate
    const best = selectBestCandidate(candidates);
    if (!best) break; // No more useful recycling possible

    // Determine how many units to recycle
    const maxUnits = best.availableForRecycle;
    
    // Calculate units needed to cover deficits
    let unitsNeeded = 0;
    for (const [matId, yield_] of Object.entries(best.recyclesInto)) {
      const deficit = deficits[matId] ?? 0;
      if (deficit > 0 && yield_ > 0) {
        const needed = Math.ceil(deficit / yield_);
        unitsNeeded = Math.max(unitsNeeded, needed);
      }
    }
    unitsNeeded = Math.min(unitsNeeded, maxUnits);

    if (unitsNeeded <= 0) break;

    // Apply recycling unit by unit
    let actualUnitsRecycled = 0;
    const totalYields: Record<ItemId, Qty> = {};

    for (let i = 0; i < unitsNeeded; i++) {
      // Check if recycling still reduces any deficit
      let stillUseful = false;
      for (const [matId, yield_] of Object.entries(best.recyclesInto)) {
        if ((deficits[matId] ?? 0) > 0 && yield_ > 0) {
          stillUseful = true;
          break;
        }
      }
      if (!stillUseful) break;

      // Apply one unit of recycling
      actualUnitsRecycled++;
      for (const [matId, yield_] of Object.entries(best.recyclesInto)) {
        totalYields[matId] = (totalYields[matId] ?? 0) + yield_;
        deficits[matId] = Math.max(0, (deficits[matId] ?? 0) - yield_);
      }
    }

    if (actualUnitsRecycled > 0) {
      // Update available for recycle
      availableForRecycle[best.srcItemId] -= actualUnitsRecycled;

      // Record action
      actions.push({
        srcItemId: best.srcItemId,
        qtyToRecycle: actualUnitsRecycled,
        yields: totalYields,
      });
    }
  }

  return { actions };
}

/**
 * Get total reserved quantities from reservation breakdowns
 */
export function getReservedTotals(
  reservations: { itemId: ItemId; totalReserved: Qty }[]
): Record<ItemId, Qty> {
  const reserved: Record<ItemId, Qty> = {};
  for (const r of reservations) {
    reserved[r.itemId] = r.totalReserved;
  }
  return reserved;
}
