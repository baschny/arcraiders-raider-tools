/**
 * Greedy Planner – Depth≤2 Bounded Planning Model
 * See CR-MOD-6.4
 *
 * Phases per target:
 *   A – Direct Craft (depth 1)
 *   B – Recycle Once for direct inputs
 *   C – Indirect Craft (depth 2)
 *   D – Recycle Once for level-2 inputs
 */

import type { ItemsMap, BenchId } from '../../types/item';
import type { ItemId, Qty, CraftStep, RecycleAction, CycleDiagnostic, UncraftableReason } from '../../types/planner';
import { NON_RECYCLABLE_CATEGORIES } from '../../types/item';
import { LOADOUT_CATEGORY_ORDER } from '../../types/loadout';

// ---------------------------------------------------------------------------
// Public result
// ---------------------------------------------------------------------------

export interface GreedyPlanResult {
  craftSteps: CraftStep[];
  recycleActions: RecycleAction[];
  satisfiableTargets: Set<ItemId>;
  /** Ingredient deficits remaining after planning (what the planner couldn't source) */
  remainingDeficits: Record<ItemId, Qty>;
  cycleDiagnostics: CycleDiagnostic[];
  blueprintBlockers: Set<ItemId>;
  benchBlockers: Set<ItemId>;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PlannerState {
  itemsMap: ItemsMap;
  benchLevels: Record<BenchId, number>;

  /** Available quantities (stash minus consumed, plus craft surplus) */
  avail: Record<ItemId, Qty>;

  /** Items eligible for recycling (items produced by recycling are NOT eligible) */
  recycleEligible: Record<ItemId, Qty>;

  /** Items protected from being recycled */
  protectedFromRecycle: Set<ItemId>;

  /** Accumulated craft steps keyed by itemId */
  craftSteps: Map<ItemId, CraftStep>;

  /** Accumulated recycle actions */
  recycleActions: RecycleAction[];

  /** Targets that were fully satisfied */
  satisfiableTargets: Set<ItemId>;

  /** Cycle guardrail */
  cycleDiagnostics: CycleDiagnostic[];
  blueprintBlockers: Set<ItemId>;
  benchBlockers: Set<ItemId>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOADOUT_CATEGORIES = new Set<string>(LOADOUT_CATEGORY_ORDER);

function getAvail(state: PlannerState, itemId: ItemId): Qty {
  return state.avail[itemId] ?? 0;
}

function consumeAvail(state: PlannerState, itemId: ItemId, qty: Qty): void {
  state.avail[itemId] = Math.max(0, (state.avail[itemId] ?? 0) - qty);
}

function addAvail(state: PlannerState, itemId: ItemId, qty: Qty): void {
  state.avail[itemId] = (state.avail[itemId] ?? 0) + qty;
}

/**
 * Check if an item can be crafted (has recipe, bench, not blueprint-locked, bench level OK)
 */
function canCraft(
  item: { recipe?: Record<string, number>; craftBench?: BenchId; blueprintLocked: boolean; stationLevelRequired: 1 | 2 | 3 },
  benchLevels: Record<BenchId, number>,
): { ok: boolean; reason?: UncraftableReason } {
  if (!item.recipe || Object.keys(item.recipe).length === 0 || !item.craftBench) {
    return { ok: false };
  }
  if (item.blueprintLocked) {
    return { ok: false, reason: 'blueprint_or_bench' };
  }
  const currentLevel = benchLevels[item.craftBench] ?? 3;
  if (currentLevel < item.stationLevelRequired) {
    return { ok: false, reason: 'blueprint_or_bench' };
  }
  return { ok: true };
}

/**
 * Deterministic recycle comparator (CR-ADD-6.X)
 * 1. Higher yield toward missing materials
 * 2. Higher coverage count
 * 3. Lower itemId
 */
interface RecycleCandidate {
  srcItemId: ItemId;
  availableQty: Qty;
  recyclesInto: Record<ItemId, Qty>;
  effectiveYield: number;
  coverageCount: number;
}

function buildRecycleCandidates(
  state: PlannerState,
  neededItems: Record<ItemId, Qty>,
): RecycleCandidate[] {
  const candidates: RecycleCandidate[] = [];
  const sortedIds = Object.keys(state.recycleEligible).sort();

  for (const srcId of sortedIds) {
    const eligibleQty = state.recycleEligible[srcId] ?? 0;
    if (eligibleQty <= 0) continue;
    if (state.protectedFromRecycle.has(srcId)) continue;

    const item = state.itemsMap[srcId];
    if (!item) continue;
    if (NON_RECYCLABLE_CATEGORIES.has(item.category)) continue;
    if (!item.recyclesInto || Object.keys(item.recyclesInto).length === 0) continue;

    let effectiveYield = 0;
    let coverageCount = 0;

    for (const [matId, yieldPerUnit] of Object.entries(item.recyclesInto)) {
      const need = neededItems[matId] ?? 0;
      if (need > 0 && yieldPerUnit > 0) {
        effectiveYield += Math.min(need, yieldPerUnit);
        coverageCount++;
      }
    }

    if (coverageCount === 0) continue;

    candidates.push({
      srcItemId: srcId,
      availableQty: eligibleQty,
      recyclesInto: item.recyclesInto,
      effectiveYield,
      coverageCount,
    });
  }

  // Sort by deterministic comparator
  candidates.sort((a, b) => {
    if (b.effectiveYield !== a.effectiveYield) return b.effectiveYield - a.effectiveYield;
    if (b.coverageCount !== a.coverageCount) return b.coverageCount - a.coverageCount;
    return a.srcItemId.localeCompare(b.srcItemId);
  });

  return candidates;
}

/**
 * Attempt to recycle items to satisfy `needed` quantities.
 * Single-hop only: items produced by recycling are NOT added to recycleEligible.
 */
function recycleForNeeded(
  state: PlannerState,
  needed: Record<ItemId, Qty>,
): void {
  // Loop until no more useful recycling
  while (true) {
    // Rebuild remaining need
    const remaining: Record<ItemId, Qty> = {};
    let anyNeed = false;
    for (const [id, qty] of Object.entries(needed)) {
      const deficit = qty - getAvail(state, id);
      if (deficit > 0) {
        remaining[id] = deficit;
        anyNeed = true;
      }
    }
    if (!anyNeed) break;

    const candidates = buildRecycleCandidates(state, remaining);
    if (candidates.length === 0) break;

    const best = candidates[0];

    // How many units to recycle
    let unitsNeeded = 0;
    for (const [matId, yieldPer] of Object.entries(best.recyclesInto)) {
      const deficit = remaining[matId] ?? 0;
      if (deficit > 0 && yieldPer > 0) {
        unitsNeeded = Math.max(unitsNeeded, Math.ceil(deficit / yieldPer));
      }
    }
    const units = Math.min(unitsNeeded, best.availableQty);
    if (units <= 0) break;

    // Apply recycling
    const yields: Record<ItemId, Qty> = {};
    for (const [matId, yieldPer] of Object.entries(best.recyclesInto)) {
      const totalYield = yieldPer * units;
      yields[matId] = totalYield;
      // Add to avail but NOT to recycleEligible (no chaining)
      addAvail(state, matId, totalYield);
    }

    // Consume source
    consumeAvail(state, best.srcItemId, units);
    state.recycleEligible[best.srcItemId] = Math.max(0, (state.recycleEligible[best.srcItemId] ?? 0) - units);

    state.recycleActions.push({
      srcItemId: best.srcItemId,
      qtyToRecycle: units,
      yields,
    });
  }
}

/**
 * Record a craft step (or merge into existing)
 */
function recordCraftStep(state: PlannerState, itemId: ItemId, totalOutput: Qty): void {
  const item = state.itemsMap[itemId];
  if (!item || !item.craftBench) return;

  const existing = state.craftSteps.get(itemId);
  if (existing) {
    existing.qty += totalOutput;
  } else {
    state.craftSteps.set(itemId, {
      benchId: item.craftBench,
      itemId,
      qty: totalOutput,
      stationLevelRequired: item.stationLevelRequired,
      blueprintLocked: item.blueprintLocked,
      isFullySatisfiable: true, // will be set properly per target
    });
  }
}

// ---------------------------------------------------------------------------
// Phase implementations
// ---------------------------------------------------------------------------

/**
 * Phase A: Direct Craft – attempt to craft the target at depth 1
 * Returns the missing ingredients (quantities still needed after avail).
 */
function phaseA(
  state: PlannerState,
  targetId: ItemId,
  need: Qty,
): Record<ItemId, Qty> | null {
  const item = state.itemsMap[targetId];
  if (!item) return null;

  const { ok, reason } = canCraft(item, state.benchLevels);

  if (!ok) {
    if (reason === 'blueprint_or_bench') {
      if (item.blueprintLocked) {
        state.blueprintBlockers.add(targetId);
      } else {
        state.benchBlockers.add(targetId);
      }
    }
    return null; // Cannot craft
  }

  // Check for self-referencing recipe (trivial cycle)
  if (item.recipe![targetId] !== undefined) {
    state.cycleDiagnostics.push({ itemId: targetId });
    return null;
  }

  const craftQuantity = item.craftQuantity;
  const craftTimes = Math.ceil(need / craftQuantity);
  const totalOutput = craftTimes * craftQuantity;

  // Determine ingredient needs
  const missingIngredients: Record<ItemId, Qty> = {};
  const recipe = item.recipe!;

  for (const [ingId, qtyPerCraft] of Object.entries(recipe)) {
    const totalNeeded = qtyPerCraft * craftTimes;
    const have = getAvail(state, ingId);
    if (have < totalNeeded) {
      missingIngredients[ingId] = totalNeeded - have;
    }
  }

  return { _totalOutput: totalOutput, _craftTimes: craftTimes, ...missingIngredients } as Record<ItemId, Qty>;
}

/**
 * Phase C: Indirect Craft (level 2) – for each missing ingredient, try to craft it
 * Returns missing sub-ingredients.
 */
function phaseC(
  state: PlannerState,
  missingIngredients: Record<ItemId, Qty>,
): Record<ItemId, Qty> {
  const missingSub: Record<ItemId, Qty> = {};

  const sortedIngIds = Object.keys(missingIngredients).sort();

  for (const ingId of sortedIngIds) {
    const ingNeed = missingIngredients[ingId];
    if (ingNeed <= 0) continue;

    // Check what we still need after avail
    const ingDeficit = ingNeed - getAvail(state, ingId);
    if (ingDeficit <= 0) continue;

    const ingItem = state.itemsMap[ingId];
    if (!ingItem) {
      missingSub[ingId] = (missingSub[ingId] ?? 0) + ingDeficit;
      continue;
    }

    const { ok, reason } = canCraft(ingItem, state.benchLevels);
    if (!ok) {
      if (reason === 'blueprint_or_bench') {
        if (ingItem.blueprintLocked) {
          state.blueprintBlockers.add(ingId);
        } else {
          state.benchBlockers.add(ingId);
        }
      }
      missingSub[ingId] = (missingSub[ingId] ?? 0) + ingDeficit;
      continue;
    }

    const craftQuantity = ingItem.craftQuantity;
    const craftTimes = Math.ceil(ingDeficit / craftQuantity);
    const totalOutput = craftTimes * craftQuantity;

    // Check sub-ingredients
    const ingRecipe = ingItem.recipe!;
    let canCraftAll = true;
    const subNeeds: Record<ItemId, Qty> = {};

    for (const [subId, qtyPerCraft] of Object.entries(ingRecipe)) {
      // Cycle guard: sub-ingredient references itself or the original target
      if (subId === ingId) {
        state.cycleDiagnostics.push({ itemId: ingId });
        canCraftAll = false;
        break;
      }
      const totalSubNeeded = qtyPerCraft * craftTimes;
      const subHave = getAvail(state, subId);
      if (subHave < totalSubNeeded) {
        subNeeds[subId] = totalSubNeeded - subHave;
      }
    }

    if (!canCraftAll) {
      missingSub[ingId] = (missingSub[ingId] ?? 0) + ingDeficit;
      continue;
    }

    // Accumulate missing sub-ingredients (will try recycle in Phase D)
    for (const [subId, subQty] of Object.entries(subNeeds)) {
      missingSub[subId] = (missingSub[subId] ?? 0) + subQty;
    }

    // Protect level-2 sub-ingredients from recycling
    for (const subId of Object.keys(ingRecipe)) {
      state.protectedFromRecycle.add(subId);
    }

    // Record the L2 craft step (tentative – will validate after phase D)
    recordCraftStep(state, ingId, totalOutput);

    // The craft will produce surplus → add to avail
    const surplus = totalOutput - ingDeficit;
    if (surplus > 0) {
      addAvail(state, ingId, surplus);
    }
  }

  return missingSub;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the greedy planner for all missing targets.
 *
 * @param itemsMap       – Item database
 * @param requiredFinal  – Aggregated required items from loadouts
 * @param stash          – Current stash quantities
 * @param benchLevels    – Current bench levels
 */
export function runGreedyPlanner(
  itemsMap: ItemsMap,
  requiredFinal: Record<ItemId, Qty>,
  stash: Record<ItemId, Qty>,
  benchLevels: Record<BenchId, number>,
): GreedyPlanResult {
  // Compute missingFinal (CR-MOD-6.2)
  const missingFinal: Record<ItemId, Qty> = {};
  for (const [itemId, req] of Object.entries(requiredFinal)) {
    const deficit = Math.max(0, req - (stash[itemId] ?? 0));
    if (deficit > 0) {
      missingFinal[itemId] = deficit;
    }
  }

  // Sort missing targets: value desc, itemId asc (CR-MOD-5.3)
  const sortedTargets = Object.keys(missingFinal).sort((a, b) => {
    const valA = itemsMap[a]?.value ?? 0;
    const valB = itemsMap[b]?.value ?? 0;
    if (valB !== valA) return valB - valA;
    return a.localeCompare(b);
  });

  // Initialize state
  const state: PlannerState = {
    itemsMap,
    benchLevels,
    avail: { ...stash },
    recycleEligible: { ...stash },
    protectedFromRecycle: new Set<ItemId>(),
    craftSteps: new Map(),
    recycleActions: [],
    satisfiableTargets: new Set(),
    cycleDiagnostics: [],
    blueprintBlockers: new Set(),
    benchBlockers: new Set(),
  };

  // Protect all loadout-category items and required final items from recycling
  for (const itemId of Object.keys(stash)) {
    const item = itemsMap[itemId];
    if (item && LOADOUT_CATEGORIES.has(item.category)) {
      state.protectedFromRecycle.add(itemId);
    }
  }
  for (const itemId of Object.keys(requiredFinal)) {
    state.protectedFromRecycle.add(itemId);
  }

  // Precompute L1 ingredient sets for all targets → protect from recycling
  for (const targetId of sortedTargets) {
    const item = itemsMap[targetId];
    if (item?.recipe) {
      for (const ingId of Object.keys(item.recipe)) {
        state.protectedFromRecycle.add(ingId);
      }
    }
  }

  // Process each target greedily
  for (const targetId of sortedTargets) {
    const need = missingFinal[targetId];
    if (need <= 0) continue;

    const targetItem = itemsMap[targetId];
    if (!targetItem) continue;

    // Phase A: Direct Craft
    const phaseAResult = phaseA(state, targetId, need);
    if (!phaseAResult) continue; // Not craftable

    // Extract metadata
    const totalOutput = phaseAResult['_totalOutput'] ?? 0;
    const craftTimes = phaseAResult['_craftTimes'] ?? 0;
    delete phaseAResult['_totalOutput'];
    delete phaseAResult['_craftTimes'];

    const missingL1 = { ...phaseAResult };

    // Phase B: Recycle once for direct (L1) inputs
    if (Object.keys(missingL1).length > 0) {
      recycleForNeeded(state, missingL1);
    }

    // Re-check L1 deficits after recycling
    const targetRecipe = targetItem.recipe!;
    const stillMissingL1: Record<ItemId, Qty> = {};
    for (const [ingId, qtyPerCraft] of Object.entries(targetRecipe)) {
      const totalNeeded = qtyPerCraft * craftTimes;
      const have = getAvail(state, ingId);
      if (have < totalNeeded) {
        stillMissingL1[ingId] = totalNeeded - have;
      }
    }

    // Phase C: Indirect Craft (level 2) for remaining missing L1 ingredients
    let missingSub: Record<ItemId, Qty> = {};
    if (Object.keys(stillMissingL1).length > 0) {
      missingSub = phaseC(state, stillMissingL1);
    }

    // Phase D: Recycle once for level-2 sub-ingredients
    if (Object.keys(missingSub).length > 0) {
      recycleForNeeded(state, missingSub);
    }

    // Final check: is this target fully satisfiable?
    let fullySatisfiable = true;
    for (const [ingId, qtyPerCraft] of Object.entries(targetRecipe)) {
      const totalNeeded = qtyPerCraft * craftTimes;
      if (getAvail(state, ingId) < totalNeeded) {
        fullySatisfiable = false;
        break;
      }
    }

    // If L2 crafts have unmet sub-ingredients, also not satisfiable
    if (fullySatisfiable && Object.keys(stillMissingL1).length > 0) {
      for (const [ingId] of Object.entries(stillMissingL1)) {
        const ingItem = state.itemsMap[ingId];
        if (!ingItem?.recipe) {
          // Base material still missing
          if (getAvail(state, ingId) < (targetRecipe[ingId] ?? 0) * craftTimes) {
            fullySatisfiable = false;
            break;
          }
          continue;
        }
        // Check if L2 craft sub-ingredients are satisfied
        const { ok } = canCraft(ingItem, state.benchLevels);
        if (!ok) {
          if (getAvail(state, ingId) < (targetRecipe[ingId] ?? 0) * craftTimes) {
            fullySatisfiable = false;
            break;
          }
        }
      }
    }

    if (fullySatisfiable) {
      state.satisfiableTargets.add(targetId);

      // Consume ingredients and produce output
      for (const [ingId, qtyPerCraft] of Object.entries(targetRecipe)) {
        consumeAvail(state, ingId, qtyPerCraft * craftTimes);
      }
      addAvail(state, targetId, totalOutput);

      // Record the L1 craft step
      recordCraftStep(state, targetId, totalOutput);

      // surplus from over-production already in avail from addAvail above
    }
  }

  // Compute remaining deficits: for each missing target, check what ingredients
  // the planner still couldn't source after all phases
  const remainingDeficits: Record<ItemId, Qty> = {};
  for (const targetId of sortedTargets) {
    const need = missingFinal[targetId];
    if (need <= 0) continue;
    if (state.satisfiableTargets.has(targetId)) continue;

    const item = itemsMap[targetId];
    if (!item) continue;

    if (!item.recipe || !item.craftBench) {
      // Base material, not craftable – deficit is the item itself
      const d = need - getAvail(state, targetId);
      if (d > 0) remainingDeficits[targetId] = (remainingDeficits[targetId] ?? 0) + d;
      continue;
    }

    // Craftable target that wasn't fully satisfied – report ingredient deficits
    const craftTimes = Math.ceil(need / item.craftQuantity);
    for (const [ingId, qtyPerCraft] of Object.entries(item.recipe)) {
      const totalNeeded = qtyPerCraft * craftTimes;
      const have = getAvail(state, ingId);
      if (have < totalNeeded) {
        remainingDeficits[ingId] = (remainingDeficits[ingId] ?? 0) + (totalNeeded - have);
      }
    }
  }

  return {
    craftSteps: Array.from(state.craftSteps.values()),
    recycleActions: state.recycleActions,
    satisfiableTargets: state.satisfiableTargets,
    remainingDeficits,
    cycleDiagnostics: state.cycleDiagnostics,
    blueprintBlockers: state.blueprintBlockers,
    benchBlockers: state.benchBlockers,
  };
}
