/**
 * Quartermaster Planner
 * Main orchestration of all planner algorithms
 * See specification section 6
 */

import type { ItemsMap, BenchId } from '../../types/item';
import type { StoredLoadout } from '../../types/loadout';
import type { PlannerResult, StashItem, ItemId, Qty } from '../../types/planner';

import { aggregateRequired, generateReservationReasons, allocateReservations, getActiveLoadoutsCount } from './aggregation';
import { expandCraftRequirements, sortCraftSteps } from './craftExpansion';
import { computeRecyclePlan, getReservedTotals } from './recycling';
import { calculateDeficits, buildPlanRows, getMissingItemsCount, buildBlockerSummary } from './deficit';
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
 * Main planner computation
 * Takes all inputs and produces deterministic PlannerResult
 */
export function computePlan(
  itemsMap: ItemsMap,
  loadouts: StoredLoadout[],
  stashItems: StashItem[],
  benchLevels: Record<BenchId, number> = DEFAULT_BENCH_LEVELS
): PlannerResult {
  // Convert stash to record format
  const stash = stashToRecord(stashItems);

  // Step 1: Aggregate required items from loadouts (section 6.1)
  const required = aggregateRequired(loadouts);

  // Step 2: Expand craft requirements with cycle detection (sections 6.2, 6.3)
  const expansionState = expandCraftRequirements(required, itemsMap, benchLevels);

  // Step 3: Generate reservation reasons (section 6.4)
  const reasonsMap = generateReservationReasons(loadouts);
  const reservations = allocateReservations(stash, reasonsMap);
  const reserved = getReservedTotals(reservations);

  // Step 4: Calculate deficits (section 6.6)
  const deficits = calculateDeficits(expansionState.totalRequired, stash);

  // Step 5: Compute recycle plan (section 6.5)
  const requiredFinalItems = new Set(Object.keys(required));
  const recyclePlan = computeRecyclePlan(
    itemsMap,
    stash,
    reserved,
    deficits,
    expansionState.intermediateItems,
    requiredFinalItems
  );

  // Step 6: Generate loot suggestions (section 6.7)
  const lootSuggestions = generateLootSuggestions(itemsMap, deficits);

  // Step 7: Build plan rows for display
  const planRows = buildPlanRows(itemsMap, expansionState.totalRequired, stash, reserved, expansionState);

  // Step 8: Build craft plan
  const craftSteps = sortCraftSteps(expansionState.craftSteps);
  const craftPlan = { steps: craftSteps };

  // Step 9: Build blocker summary
  const blockerData = buildBlockerSummary(itemsMap, deficits, expansionState);
  const blockers = {
    ...blockerData,
    cycleDiagnostics: expansionState.cycleDiagnostics.sort((a, b) => a.itemId.localeCompare(b.itemId)),
  };

  // Build final result
  return {
    required,
    deficit: deficits,

    planRows,
    reservations,

    craftPlan,
    recyclePlan,
    lootSuggestions,

    blockers,

    activeLoadoutsCount: getActiveLoadoutsCount(loadouts),
    totalMissingItemsCount: getMissingItemsCount(deficits),
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
    reservations: [],
    craftPlan: { steps: [] },
    recyclePlan: { actions: [] },
    lootSuggestions: { items: [] },
    blockers: {
      missingNonCraftables: [],
      missingBaseMaterials: [],
      benchBlockers: [],
      blueprintBlockers: [],
      craftCycleBlockers: [],
      cycleDiagnostics: [],
    },
    activeLoadoutsCount: 0,
    totalMissingItemsCount: 0,
    totalRecycleActionsCount: 0,
    totalCraftStepsCount: 0,
  };
}

// Re-export types and utilities for convenience
export type { ExpansionState } from './craftExpansion';
