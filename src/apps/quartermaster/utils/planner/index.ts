/**
 * Quartermaster Planner
 * Main orchestration – Greedy depth≤2 model
 * See CR-MOD-6
 */

import type { ItemsMap, BenchId } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { PlannerResult, OwnedItemQuantity, OwnedItemDisplayRow, ItemId, Qty, RepairPlan } from '../../types/planner';
import { BENCH_ORDER } from '../../types/item';

import { aggregateRequired, getActiveListsCount } from './aggregation';
import { runGreedyPlanner, computeCraftability } from './greedyPlanner';
import { buildPlanRows, getMissingItemsCount, buildBlockerSummary } from './deficit';
import { generateLootSuggestions } from './lootSuggestions';
import { generateInRaidSuggestions } from './inRaidSuggestions';
import { runRepairPrePass, getRepairMaterialIds } from './repairPlanner';

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
 * Convert owned item quantities array to record
 */
function ownedItemsToRecord(ownedItems: OwnedItemQuantity[]): Record<ItemId, Qty> {
  const owned: Record<ItemId, Qty> = {};
  for (const item of ownedItems) {
    owned[item.itemId] = (owned[item.itemId] ?? 0) + item.quantity;
  }
  return owned;
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

function sortWeaponUpgradeSteps(
  steps: PlannerResult['weaponUpgradePlan']['steps'],
): PlannerResult['weaponUpgradePlan']['steps'] {
  return [...steps].sort((a, b) => {
    const fromA = itemsTierSortKey(a.fromItemId);
    const fromB = itemsTierSortKey(b.fromItemId);
    if (fromA !== fromB) return fromA - fromB;
    if (a.fromItemId !== b.fromItemId) return a.fromItemId.localeCompare(b.fromItemId);
    return a.toItemId.localeCompare(b.toItemId);
  });
}

function itemsTierSortKey(itemId: string): number {
  const match = itemId.match(/_(i|ii|iii|iv)$/);
  if (!match) return 0;
  return ['i', 'ii', 'iii', 'iv'].indexOf(match[1]) + 1;
}

/**
 * Main planner computation
 * Takes all inputs and produces deterministic PlannerResult
 */
export function computePlan(
  itemsMap: ItemsMap,
  lists: StoredList[],
  ownedItems: OwnedItemQuantity[],
  benchLevels: Record<BenchId, number> = DEFAULT_BENCH_LEVELS,
  unlockedBlueprintItemIds: Set<ItemId> = new Set(),
  ownedItemRows?: OwnedItemDisplayRow[],
): PlannerResult {
  const owned = ownedItemsToRecord(ownedItems);

  // Step 1: Aggregate required from enabled lists (CR-001, CR-003)
  const { required, targetPriority, requiredSourcesByItemId } = aggregateRequired(lists);

  // Step 1b: Repair pre-pass — consume repair materials from avail before greedy planner
  const listItems = new Set(Object.keys(required));
  let repairPlan = createEmptyRepairPlan();
  let repairMaterialIds = new Set<ItemId>();

  if (ownedItemRows && ownedItemRows.length > 0) {
    const repairResult = runRepairPrePass(
      itemsMap,
      ownedItemRows,
      owned,
      listItems,
      requiredSourcesByItemId,
    );
    repairPlan = repairResult.repairPlan;
    repairMaterialIds = getRepairMaterialIds(itemsMap, ownedItemRows, listItems);

    // Apply consumed materials to owned
    for (const [materialId, qty] of Object.entries(repairResult.updatedAvail)) {
      owned[materialId] = qty;
    }
  }

  // Step 2: Compute deficit (CR-MOD-6.2)
  const deficit: Record<ItemId, Qty> = {};
  for (const [itemId, req] of Object.entries(required)) {
    const d = Math.max(0, req - (owned[itemId] ?? 0));
    if (d > 0) deficit[itemId] = d;
  }

  // Step 3: Run greedy planner with priority ordering (CR-004)
  const greedyResult = runGreedyPlanner(
    itemsMap,
    required,
    owned,
    benchLevels,
    targetPriority,
    unlockedBlueprintItemIds,
    requiredSourcesByItemId,
    repairMaterialIds,
  );

  // Step 3b: Compute craftability map for RED LOCK indicator and tooltip conditions
  const craftability = computeCraftability(itemsMap, benchLevels, unlockedBlueprintItemIds);

  // Step 4: Build sorted craft plan (fully satisfiable only in Craft UI)
  const craftPlan = { steps: sortCraftSteps(greedyResult.craftSteps) };
  const weaponUpgradePlan = { steps: sortWeaponUpgradeSteps(greedyResult.weaponUpgradeSteps) };
  const recyclePlan = { actions: greedyResult.recycleActions };

  // Step 5: Generate loot suggestions (Final Spec Section 4.5 & 5.1)
  // Merge top-level deficits with remaining ingredient deficits from greedy planner
  // Also include repair deficits
  const remainingIngredientDeficits: Record<ItemId, Qty> = { ...greedyResult.remainingDeficits };
  for (const [itemId, qty] of Object.entries(repairPlan.deficits)) {
    remainingIngredientDeficits[itemId] = Math.max(remainingIngredientDeficits[itemId] ?? 0, qty);
  }

  const lootDeficits: Record<ItemId, Qty> = { ...deficit };
  for (const [itemId, qty] of Object.entries(remainingIngredientDeficits)) {
    lootDeficits[itemId] = Math.max(lootDeficits[itemId] ?? 0, qty);
  }
  const lootSuggestions = generateLootSuggestions(itemsMap, lootDeficits, required);

  // Step 5b: Generate In-Raid acquisition suggestions (CR-005)
  const inRaidSuggestions = generateInRaidSuggestions(
    itemsMap,
    lootDeficits,
    required,
    greedyResult.satisfiableTargets,
    requiredSourcesByItemId,
  );

  // Step 6: Build plan rows with badges
  const planRows = buildPlanRows(itemsMap, required, owned, greedyResult);

  // Step 7: Build blocker summary
  const blockers = buildBlockerSummary(itemsMap, deficit, greedyResult);

  return {
    required,
    deficit,
    remainingIngredientDeficits,

    planRows,

    craftPlan,
    weaponUpgradePlan,
    recyclePlan,
    lootSuggestions,
    inRaidSuggestions,

    requiredSourcesByItemId,

    blockers,

    repairPlan,

    satisfiableTargets: greedyResult.satisfiableTargets,

    craftability,

    activeListsCount: getActiveListsCount(lists),
    totalMissingItemsCount: getMissingItemsCount(deficit),
    totalRecycleActionsCount: recyclePlan.actions.length,
    totalCraftStepsCount: craftPlan.steps.length,
    totalWeaponUpgradeStepsCount: weaponUpgradePlan.steps.length,
  };
}

function createEmptyRepairPlan(): RepairPlan {
  return {
    actions: [],
    committedMaterials: {},
    deficits: {},
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
    remainingIngredientDeficits: {},
    planRows: [],
    craftPlan: { steps: [] },
    weaponUpgradePlan: { steps: [] },
    recyclePlan: { actions: [] },
    lootSuggestions: { items: [] },
    inRaidSuggestions: { items: [] },
    requiredSourcesByItemId: {},
    blockers: {
      missingBaseMaterials: [],
      benchBlockers: [],
      blueprintBlockers: [],
      craftCycleBlockers: [],
      cycleDiagnostics: [],
    },
    repairPlan: createEmptyRepairPlan(),
    satisfiableTargets: new Set(),
    craftability: {},
    activeListsCount: 0,
    totalMissingItemsCount: 0,
    totalRecycleActionsCount: 0,
    totalCraftStepsCount: 0,
    totalWeaponUpgradeStepsCount: 0,
  };
}
