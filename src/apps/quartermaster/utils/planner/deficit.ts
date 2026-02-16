/**
 * Deficit Calculation
 * See specification section 6.6
 */

import type { ItemsMap } from '../../types/item';
import type { ItemId, Qty, PlanRow, UncraftableReason } from '../../types/planner';
import type { ExpansionState } from './craftExpansion';

/**
 * Calculate deficits for all required items
 * deficit[itemId] = max(0, required[itemId] - have[itemId])
 */
export function calculateDeficits(
  totalRequired: Record<ItemId, Qty>,
  stash: Record<ItemId, Qty>
): Record<ItemId, Qty> {
  const deficits: Record<ItemId, Qty> = {};

  for (const [itemId, required] of Object.entries(totalRequired)) {
    const have = stash[itemId] ?? 0;
    const deficit = Math.max(0, required - have);
    if (deficit > 0) {
      deficits[itemId] = deficit;
    }
  }

  return deficits;
}

/**
 * Build plan rows for display
 * Combines stash, reservation, and requirement data
 */
export function buildPlanRows(
  itemsMap: ItemsMap,
  totalRequired: Record<ItemId, Qty>,
  stash: Record<ItemId, Qty>,
  reserved: Record<ItemId, Qty>,
  expansionState: ExpansionState
): PlanRow[] {
  const rows: PlanRow[] = [];

  // Get all unique itemIds from required
  const itemIds = Object.keys(totalRequired).sort();

  for (const itemId of itemIds) {
    // Skip unknown items
    if (!itemsMap[itemId]) {
      continue;
    }

    const have = stash[itemId] ?? 0;
    const reservedQty = reserved[itemId] ?? 0;
    const available = Math.max(0, have - reservedQty);
    const required = totalRequired[itemId] ?? 0;
    const missing = Math.max(0, required - have);

    // Determine uncraftable status
    let isUncraftable = false;
    let uncraftableReason: UncraftableReason | undefined;

    if (expansionState.cycleBlockers.has(itemId)) {
      isUncraftable = true;
      uncraftableReason = 'cycle';
    } else if (expansionState.blueprintBlockers.has(itemId) || expansionState.benchBlockers.has(itemId)) {
      isUncraftable = true;
      uncraftableReason = 'blueprint_or_bench';
    }

    rows.push({
      itemId,
      have,
      reserved: reservedQty,
      available,
      required,
      missing,
      isUncraftable,
      uncraftableReason,
    });
  }

  // Sort by itemId (ASCII ascending)
  return rows.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/**
 * Get count of missing items (items with deficit > 0)
 */
export function getMissingItemsCount(deficits: Record<ItemId, Qty>): number {
  return Object.values(deficits).filter(d => d > 0).length;
}

/**
 * Build blocker summary from expansion state
 */
export function buildBlockerSummary(
  itemsMap: ItemsMap,
  deficits: Record<ItemId, Qty>,
  expansionState: ExpansionState
): {
  missingNonCraftables: ItemId[];
  missingBaseMaterials: ItemId[];
  benchBlockers: ItemId[];
  blueprintBlockers: ItemId[];
  craftCycleBlockers: ItemId[];
} {
  const missingNonCraftables: ItemId[] = [];
  const missingBaseMaterials: ItemId[] = [];

  // Items with deficit that have no recipe (base materials)
  for (const itemId of Object.keys(deficits).sort()) {
    if (deficits[itemId] <= 0) continue;
    
    const item = itemsMap[itemId];
    if (!item) continue;

    const hasRecipe = item.recipe && Object.keys(item.recipe).length > 0;
    const hasBench = !!item.craftBench;

    if (!hasRecipe || !hasBench) {
      missingBaseMaterials.push(itemId);
    }
  }

  return {
    missingNonCraftables,
    missingBaseMaterials,
    benchBlockers: Array.from(expansionState.benchBlockers).sort(),
    blueprintBlockers: Array.from(expansionState.blueprintBlockers).sort(),
    craftCycleBlockers: Array.from(expansionState.cycleBlockers).sort(),
  };
}
