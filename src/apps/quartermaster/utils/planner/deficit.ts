/**
 * Deficit & Plan Row Computation
 * See CR-MOD-6.2, CR-MOD-7
 */

import type { ItemsMap } from '../../types/item';
import type { ItemId, Qty, PlanRow, LoadoutBadge, UncraftableReason, BlockerSummary } from '../../types/planner';
import type { GreedyPlanResult } from './greedyPlanner';

/**
 * Compute ingredient demands from craft steps.
 * For each craft step, derive how many of each ingredient are needed.
 */
function computeIngredientDemands(
  itemsMap: ItemsMap,
  craftSteps: GreedyPlanResult['craftSteps'],
  weaponUpgradeSteps: GreedyPlanResult['weaponUpgradeSteps'],
  owned: Record<ItemId, Qty>,
): Record<ItemId, Qty> {
  const demands: Record<ItemId, Qty> = {};

  for (const step of craftSteps) {
    const item = itemsMap[step.itemId];
    if (!item?.recipe) continue;

    const craftTimes = Math.ceil(step.qty / item.craftQuantity);
    for (const [ingId, qtyPerCraft] of Object.entries(item.recipe)) {
      demands[ingId] = (demands[ingId] ?? 0) + qtyPerCraft * craftTimes;
    }
  }

  for (const step of weaponUpgradeSteps) {
    const ownedBaseQty = Math.min(step.qty, owned[step.fromItemId] ?? 0);
    if (ownedBaseQty > 0) {
      demands[step.fromItemId] = (demands[step.fromItemId] ?? 0) + ownedBaseQty;
    }
    for (const [itemId, qtyPerUpgrade] of Object.entries(step.upgradeCost)) {
      demands[itemId] = (demands[itemId] ?? 0) + qtyPerUpgrade * step.qty;
    }
  }

  return demands;
}

/**
 * Build plan rows with HAVE / CAN_CRAFT / MISSING badges.
 * Includes both loadout-required items AND crafting ingredients.
 */
export function buildPlanRows(
  itemsMap: ItemsMap,
  required: Record<ItemId, Qty>,
  owned: Record<ItemId, Qty>,
  greedyResult: GreedyPlanResult,
): PlanRow[] {
  // Merge loadout requirements with ingredient demands from craft plan
  const ingredientDemands = computeIngredientDemands(
    itemsMap,
    greedyResult.craftSteps,
    greedyResult.weaponUpgradeSteps,
    owned,
  );
  const totalRequired: Record<ItemId, Qty> = { ...required };
  for (const [itemId, qty] of Object.entries(ingredientDemands)) {
    totalRequired[itemId] = (totalRequired[itemId] ?? 0) + qty;
  }

  const rows: PlanRow[] = [];
  const itemIds = Object.keys(totalRequired).sort();

  for (const itemId of itemIds) {
    if (!itemsMap[itemId]) continue;

    const have = owned[itemId] ?? 0;
    const req = totalRequired[itemId] ?? 0;
    const missing = Math.max(0, req - have);

    // Determine badge (CR-MOD-7)
    let badge: LoadoutBadge;
    if (have >= req) {
      badge = 'HAVE';
    } else if (greedyResult.satisfiableTargets.has(itemId)) {
      badge = 'CAN_CRAFT';
    } else {
      badge = 'MISSING';
    }

    // Uncraftable status
    let isUncraftable = false;
    let uncraftableReason: UncraftableReason | undefined;

    const isCycleBlocked = greedyResult.cycleDiagnostics.some(d => d.itemId === itemId);
    if (isCycleBlocked) {
      isUncraftable = true;
      uncraftableReason = 'cycle';
    } else if (greedyResult.blueprintBlockers.has(itemId)) {
      isUncraftable = true;
      uncraftableReason = 'blueprint_locked';
    } else if (greedyResult.benchBlockers.has(itemId)) {
      isUncraftable = true;
      // Check if item has no bench at all vs insufficient level
      const plannerItem = itemsMap[itemId];
      uncraftableReason = plannerItem?.craftBench ? 'insufficient_bench_level' : 'missing_bench';
    }

    rows.push({
      itemId,
      have,
      required: req,
      missing,
      badge,
      isUncraftable,
      uncraftableReason,
    });
  }

  return rows.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/**
 * Get count of missing items (items with deficit > 0)
 */
export function getMissingItemsCount(deficits: Record<ItemId, Qty>): number {
  return Object.values(deficits).filter(d => d > 0).length;
}

/**
 * Build blocker summary from greedy planner result
 */
export function buildBlockerSummary(
  itemsMap: ItemsMap,
  deficits: Record<ItemId, Qty>,
  greedyResult: GreedyPlanResult,
): BlockerSummary {
  const missingBaseMaterials: ItemId[] = [];

  for (const itemId of Object.keys(deficits).sort()) {
    if (deficits[itemId] <= 0) continue;

    const item = itemsMap[itemId];
    if (!item) continue;

    const hasRecipe = item.recipe && Object.keys(item.recipe).length > 0;
    const hasUpgradePath = item.weaponTier && item.weaponTier > 1 && item.weaponBaseId;
    const hasBench = !!item.craftBench;

    if ((!hasRecipe || !hasBench) && !hasUpgradePath) {
      missingBaseMaterials.push(itemId);
    }
  }

  const cycleIds = new Set(greedyResult.cycleDiagnostics.map(d => d.itemId));

  return {
    missingBaseMaterials,
    benchBlockers: Array.from(greedyResult.benchBlockers).sort(),
    blueprintBlockers: Array.from(greedyResult.blueprintBlockers).sort(),
    craftCycleBlockers: Array.from(cycleIds).sort(),
    cycleDiagnostics: greedyResult.cycleDiagnostics.sort((a, b) => a.itemId.localeCompare(b.itemId)),
  };
}
