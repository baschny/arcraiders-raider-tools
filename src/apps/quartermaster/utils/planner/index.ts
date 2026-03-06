/**
 * Quartermaster Planner
 * Main orchestration – Greedy depth≤2 model
 * See CR-MOD-6
 */

import type { ItemsMap, BenchId } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { PlannerResult, StashItem, ItemId, Qty } from '../../types/planner';
import { BENCH_ORDER } from '../../types/item';

import { aggregateRequired, getActiveListsCount } from './aggregation';
import { runGreedyPlanner } from './greedyPlanner';
import { buildPlanRows, getMissingItemsCount, buildBlockerSummary } from './deficit';
import { generateLootSuggestions } from './lootSuggestions';

/**
 * Default bench levels (all at max per spec v1)
 */
const DEFAULT_BENCH_LEVELS: Record<BenchId, number> = {
  equipment_bench: 3,
  explosives_bench: 3,
  med_station: 3,
  refiner: 3,
  utility_bench: 3,
  weapon_bench: 3,
  workbench: 3,
};

/**
 * Convert stash items array to record
 */
function stashToRecord(stashItems: StashItem[]): Record<ItemId, Qty> {
  const stash: Record<ItemId, Qty> = {};
  for (const item of stashItems) {
    stash[item.itemId] = (stash[item.itemId] ?? 0) + item.quantity;
  }
  return stash;
}

/**
 * Sort craft steps by bench order then itemId
 */
function sortCraftSteps(steps: PlannerResult['craftPlan']['steps']): PlannerResult['craftPlan']['steps'] {
  return [...steps].sort((a, b) => {
    const benchA = BENCH_ORDER.indexOf(a.benchId);
    const benchB = BENCH_ORDER.indexOf(b.benchId);
    if (benchA !== benchB) return benchA - benchB;
    return a.itemId.localeCompare(b.itemId);
  });
}

/**
 * Main planner computation
 * Takes all inputs and produces deterministic PlannerResult
 */
export function computePlan(
  itemsMap: ItemsMap,
  lists: StoredList[],
  stashItems: StashItem[],
  benchLevels: Record<BenchId, number> = DEFAULT_BENCH_LEVELS
): PlannerResult {
  const stash = stashToRecord(stashItems);

  // Step 1: Aggregate required from enabled lists (CR-001)
  const { required, targetPriority } = aggregateRequired(lists);

  // Step 2: Compute deficit (CR-MOD-6.2)
  const deficit: Record<ItemId, Qty> = {};
  for (const [itemId, req] of Object.entries(required)) {
    const d = Math.max(0, req - (stash[itemId] ?? 0));
    if (d > 0) deficit[itemId] = d;
  }

  // Step 3: Run greedy planner with priority ordering (CR-004)
  const greedyResult = runGreedyPlanner(itemsMap, required, stash, benchLevels, targetPriority);

  // Step 4: Build sorted craft plan (fully satisfiable only in Craft UI)
  const craftPlan = { steps: sortCraftSteps(greedyResult.craftSteps) };
  const recyclePlan = { actions: greedyResult.recycleActions };

  // Step 5: Generate loot suggestions (CR-MOD-6.5)
  // Merge top-level deficits with remaining ingredient deficits from greedy planner
  const lootDeficits: Record<ItemId, Qty> = { ...deficit };
  for (const [itemId, qty] of Object.entries(greedyResult.remainingDeficits)) {
    lootDeficits[itemId] = Math.max(lootDeficits[itemId] ?? 0, qty);
  }
  const lootSuggestions = generateLootSuggestions(itemsMap, lootDeficits, required);

  // Step 6: Build plan rows with badges
  const planRows = buildPlanRows(itemsMap, required, stash, greedyResult);

  // Step 7: Build blocker summary
  const blockers = buildBlockerSummary(itemsMap, deficit, greedyResult);

  return {
    required,
    deficit,

    planRows,

    craftPlan,
    recyclePlan,
    lootSuggestions,

    blockers,

    satisfiableTargets: greedyResult.satisfiableTargets,

    activeListsCount: getActiveListsCount(lists),
    totalMissingItemsCount: getMissingItemsCount(deficit),
    totalRecycleActionsCount: recyclePlan.actions.length,
    totalCraftStepsCount: craftPlan.steps.length,
  };
}

/**
 * Create an empty planner result
 * Used when no loadouts are configured
 */
export function createEmptyResult(): PlannerResult {
  return {
    required: {},
    deficit: {},
    planRows: [],
    craftPlan: { steps: [] },
    recyclePlan: { actions: [] },
    lootSuggestions: { items: [] },
    blockers: {
      missingBaseMaterials: [],
      benchBlockers: [],
      blueprintBlockers: [],
      craftCycleBlockers: [],
      cycleDiagnostics: [],
    },
    satisfiableTargets: new Set(),
    activeListsCount: 0,
    totalMissingItemsCount: 0,
    totalRecycleActionsCount: 0,
    totalCraftStepsCount: 0,
  };
}
