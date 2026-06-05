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
import type {
  ItemId,
  Qty,
  CraftStep,
  WeaponUpgradeStep,
  RecycleAction,
  RecycleActionReason,
  RecycleSourcePriorityGroup,
  RecycleSourcePriorityWarning,
  CycleDiagnostic,
  RequiredSource,
  UncraftableReason,
  CraftabilityInfo,
} from '../../types/planner';
import type { TargetPriority } from './aggregation';
import { NON_RECYCLABLE_CATEGORIES } from '../../types/item';

// ---------------------------------------------------------------------------
// Public result
// ---------------------------------------------------------------------------

export interface GreedyPlanResult {
  craftSteps: CraftStep[];
  weaponUpgradeSteps: WeaponUpgradeStep[];
  recycleActions: RecycleAction[];
  satisfiableTargets: Set<ItemId>;
  /** Ingredient deficits remaining after planning (what the planner couldn't source) */
  remainingDeficits: Record<ItemId, Qty>;
  cycleDiagnostics: CycleDiagnostic[];
  blueprintBlockers: Set<ItemId>;
  benchBlockers: Set<ItemId>;
}

type RecycleReasonFactory = (producedItemId: ItemId, quantityCovered: Qty) => RecycleActionReason[];

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PlannerState {
  itemsMap: ItemsMap;
  benchLevels: Record<BenchId, number>;
  unlockedBlueprintItemIds: Set<ItemId>;

  /** Available quantities (owned items minus consumed, plus craft surplus) */
  avail: Record<ItemId, Qty>;

  /** Items eligible for recycling (items produced by recycling are NOT eligible) */
  recycleEligible: Record<ItemId, Qty>;

  /** Items protected from being recycled */
  protectedFromRecycle: Set<ItemId>;

  /** Direct recipe inputs for active list targets; recycled only as a fallback */
  activeDirectRecipeInputSet: Set<ItemId>;

  /** Warning provenance for direct recipe inputs that are recycled as a fallback */
  directRecipeInputWarnings: Map<ItemId, RecycleSourcePriorityWarning[]>;

  /** Accumulated craft steps keyed by itemId */
  craftSteps: Map<ItemId, CraftStep>;

  /** Accumulated weapon upgrade steps keyed by fromItemId->toItemId */
  weaponUpgradeSteps: Map<string, WeaponUpgradeStep>;

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

function getAvail(state: PlannerState, itemId: ItemId): Qty {
  return state.avail[itemId] ?? 0;
}

function consumeAvail(state: PlannerState, itemId: ItemId, qty: Qty): void {
  state.avail[itemId] = Math.max(0, (state.avail[itemId] ?? 0) - qty);
}

function addAvail(state: PlannerState, itemId: ItemId, qty: Qty): void {
  state.avail[itemId] = (state.avail[itemId] ?? 0) + qty;
}

function clonePlannerState(state: PlannerState): PlannerState {
  return {
    ...state,
    avail: { ...state.avail },
    recycleEligible: { ...state.recycleEligible },
    protectedFromRecycle: new Set(state.protectedFromRecycle),
    activeDirectRecipeInputSet: new Set(state.activeDirectRecipeInputSet),
    directRecipeInputWarnings: new Map(
      Array.from(state.directRecipeInputWarnings.entries()).map(([itemId, warnings]) => [
        itemId,
        warnings.map((warning) => ({ ...warning })),
      ]),
    ),
    craftSteps: new Map(
      Array.from(state.craftSteps.entries()).map(([itemId, step]) => [itemId, { ...step }]),
    ),
    weaponUpgradeSteps: new Map(
      Array.from(state.weaponUpgradeSteps.entries()).map(([key, step]) => [
        key,
        { ...step, upgradeCost: { ...step.upgradeCost } },
      ]),
    ),
    recycleActions: state.recycleActions.map((action) => ({
      ...action,
      yields: { ...action.yields },
      reasons: action.reasons.map((reason) => ({
        ...reason,
        chainItemIds: [...reason.chainItemIds],
      })),
      sourcePriorityWarnings: action.sourcePriorityWarnings?.map((warning) => ({ ...warning })),
    })),
    satisfiableTargets: new Set(state.satisfiableTargets),
    cycleDiagnostics: state.cycleDiagnostics.map((diagnostic) => ({ ...diagnostic })),
    blueprintBlockers: new Set(state.blueprintBlockers),
    benchBlockers: new Set(state.benchBlockers),
  };
}

function mergePlannerDiagnostics(target: PlannerState, source: PlannerState): void {
  for (const diagnostic of source.cycleDiagnostics) {
    if (!target.cycleDiagnostics.some((existing) => existing.itemId === diagnostic.itemId)) {
      target.cycleDiagnostics.push({ ...diagnostic });
    }
  }
  for (const itemId of source.blueprintBlockers) {
    target.blueprintBlockers.add(itemId);
  }
  for (const itemId of source.benchBlockers) {
    target.benchBlockers.add(itemId);
  }
}

function formatChainLabel(state: PlannerState, chainItemIds: ItemId[]): string {
  return chainItemIds
    .map((itemId) => state.itemsMap[itemId]?.name ?? itemId)
    .join(' -> ');
}

function buildReasonFactory(
  state: PlannerState,
  targetId: ItemId,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
  chainByProducedItemId: Record<ItemId, ItemId[]>,
): RecycleReasonFactory {
  return (producedItemId, quantityCovered) => {
    const targetItem = state.itemsMap[targetId];
    const producedItem = state.itemsMap[producedItemId];
    const sources = requiredSourcesByItemId[targetId] ?? [];
    const chainItemIds = chainByProducedItemId[producedItemId] ?? [targetId, producedItemId];

    if (!targetItem || !producedItem || sources.length === 0) return [];

    return sources.map((source) => ({
      listId: source.listId,
      listName: source.listName,
      targetItemId: targetId,
      targetItemName: targetItem.name,
      producedItemId,
      producedItemName: producedItem.name,
      chainItemIds,
      chainLabel: formatChainLabel(state, chainItemIds),
      quantityCovered,
    }));
  };
}

function buildDirectRecipeInputWarnings(
  itemsMap: ItemsMap,
  requiredFinal: Record<ItemId, Qty>,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
  targetPriority: Record<ItemId, TargetPriority>,
): { inputSet: Set<ItemId>; warnings: Map<ItemId, RecycleSourcePriorityWarning[]> } {
  const inputSet = new Set<ItemId>();
  const warnings = new Map<ItemId, RecycleSourcePriorityWarning[]>();

  for (const targetId of Object.keys(requiredFinal).sort()) {
    const targetItem = itemsMap[targetId];
    if (!targetItem?.recipe) continue;

    const sources = requiredSourcesByItemId[targetId] ?? [];
    for (const inputId of Object.keys(targetItem.recipe)) {
      inputSet.add(inputId);
      const existing = warnings.get(inputId) ?? [];
      for (const source of sources) {
        existing.push({
          targetItemId: targetId,
          targetItemName: targetItem.name,
          listId: source.listId,
          listName: source.listName,
        });
      }
      warnings.set(inputId, existing);
    }
  }

  for (const [inputId, itemWarnings] of warnings.entries()) {
    const deduped = Array.from(
      new Map(itemWarnings.map((warning) => [
        `${warning.listId}|${warning.targetItemId}`,
        warning,
      ])).values(),
    );

    deduped.sort((a, b) => {
      const prioA = targetPriority[a.targetItemId] ?? { listIndex: Infinity, itemIndex: Infinity };
      const prioB = targetPriority[b.targetItemId] ?? { listIndex: Infinity, itemIndex: Infinity };
      if (prioA.listIndex !== prioB.listIndex) return prioA.listIndex - prioB.listIndex;
      if (prioA.itemIndex !== prioB.itemIndex) return prioA.itemIndex - prioB.itemIndex;
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      return a.targetItemId.localeCompare(b.targetItemId);
    });

    warnings.set(inputId, deduped);
  }

  return { inputSet, warnings };
}

/**
 * Check if an item can be crafted (has recipe, bench, not blueprint-locked, bench level OK)
 * See specification CR-006: formal craftability predicate
 */
function canCraft(
  item: { recipe?: Record<string, number>; craftBench?: BenchId; blueprintLocked: boolean; stationLevelRequired: 1 | 2 | 3 },
  benchLevels: Record<BenchId, number>,
  unlockedBlueprintItemIds: Set<ItemId>,
  itemId: ItemId,
): { ok: boolean; reason?: UncraftableReason } {
  if (!item.recipe || Object.keys(item.recipe).length === 0) {
    return { ok: false };
  }
  if (!item.craftBench) {
    return { ok: false, reason: 'missing_bench' };
  }
  if (item.blueprintLocked && !unlockedBlueprintItemIds.has(itemId)) {
    return { ok: false, reason: 'blueprint_locked' };
  }
  const currentLevel = benchLevels[item.craftBench] ?? 3;
  if (currentLevel < item.stationLevelRequired) {
    return { ok: false, reason: 'insufficient_bench_level' };
  }
  return { ok: true };
}

/**
 * Deterministic recycle comparator (CR-009)
 * 1. Non-direct recipe input sources before direct recipe inputs
 * 2. Higher yield toward missing materials
 * 3. Higher coverage count
 * 4. Lower value
 * 5. Lower itemId
 */
interface RecycleCandidate {
  srcItemId: ItemId;
  availableQty: Qty;
  recyclesInto: Record<ItemId, Qty>;
  effectiveYield: number;
  coverageCount: number;
  sourcePriorityGroup: RecycleSourcePriorityGroup;
  value: number;
}

function buildRecycleCandidates(
  state: PlannerState,
  neededItems: Record<ItemId, Qty>,
  allowDirectRecipeInputSources = true,
): RecycleCandidate[] {
  const candidates: RecycleCandidate[] = [];
  const sortedIds = Object.keys(state.recycleEligible).sort();

  for (const srcId of sortedIds) {
    const eligibleQty = state.recycleEligible[srcId] ?? 0;
    if (eligibleQty <= 0) continue;
    const availableQty = Math.min(eligibleQty, getAvail(state, srcId));
    if (availableQty <= 0) continue;
    if (state.protectedFromRecycle.has(srcId)) continue;

    const item = state.itemsMap[srcId];
    if (!item) continue;
    const sourcePriorityGroup: RecycleSourcePriorityGroup = state.activeDirectRecipeInputSet.has(srcId)
      ? 'direct_recipe_input'
      : 'normal';
    if (!allowDirectRecipeInputSources && sourcePriorityGroup === 'direct_recipe_input') continue;
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
      availableQty,
      recyclesInto: item.recyclesInto,
      effectiveYield,
      coverageCount,
      sourcePriorityGroup,
      value: item.value ?? 0,
    });
  }

  // Sort by deterministic comparator
  candidates.sort((a, b) => {
    if (a.sourcePriorityGroup !== b.sourcePriorityGroup) {
      return a.sourcePriorityGroup === 'normal' ? -1 : 1;
    }
    if (b.effectiveYield !== a.effectiveYield) return b.effectiveYield - a.effectiveYield;
    if (b.coverageCount !== a.coverageCount) return b.coverageCount - a.coverageCount;
    if (a.value !== b.value) return a.value - b.value;
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
  reasonFactory: RecycleReasonFactory,
  options: { allowDirectRecipeInputSources?: boolean } = {},
): void {
  const { allowDirectRecipeInputSources = true } = options;
  const remaining: Record<ItemId, Qty> = {};
  for (const [id, qty] of Object.entries(needed)) {
    if (qty > 0) remaining[id] = qty;
  }

  // Loop until no more useful recycling
  while (true) {
    if (!Object.values(remaining).some((qty) => qty > 0)) break;

    const candidates = buildRecycleCandidates(state, remaining, allowDirectRecipeInputSources);
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
    const reasons: RecycleActionReason[] = [];
    for (const [matId, yieldPer] of Object.entries(best.recyclesInto)) {
      const totalYield = yieldPer * units;
      const deficitBeforeYield = remaining[matId] ?? 0;
      yields[matId] = totalYield;
      remaining[matId] = Math.max(0, (remaining[matId] ?? 0) - totalYield);
      const quantityCovered = Math.min(deficitBeforeYield, totalYield);
      if (quantityCovered > 0) {
        reasons.push(...reasonFactory(matId, quantityCovered));
      }
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
      reasons,
      sourcePriorityGroup: best.sourcePriorityGroup,
      sourcePriorityWarnings: best.sourcePriorityGroup === 'direct_recipe_input'
        ? state.directRecipeInputWarnings.get(best.srcItemId) ?? []
        : undefined,
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

function recordWeaponUpgradeStep(state: PlannerState, fromItemId: ItemId, toItemId: ItemId, qty: Qty): void {
  const toItem = state.itemsMap[toItemId];
  if (!toItem?.upgradeCost) return;

  const key = `${fromItemId}->${toItemId}`;
  const existing = state.weaponUpgradeSteps.get(key);
  if (existing) {
    existing.qty += qty;
  } else {
    state.weaponUpgradeSteps.set(key, {
      benchId: 'weapon_bench',
      fromItemId,
      toItemId,
      qty,
      upgradeCost: { ...toItem.upgradeCost },
      stationLevelRequired: toItem.stationLevelRequired,
      isFullySatisfiable: true,
    });
  }
}

interface PendingCraft {
  itemId: ItemId;
  totalOutput: Qty;
  craftTimes: Qty;
  recipe: Record<ItemId, Qty>;
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

  const { ok, reason } = canCraft(item, state.benchLevels, state.unlockedBlueprintItemIds, targetId);

  if (!ok) {
    if (reason === 'blueprint_locked') {
      state.blueprintBlockers.add(targetId);
    } else if (reason === 'insufficient_bench_level' || reason === 'missing_bench') {
      state.benchBlockers.add(targetId);
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
): { missingSub: Record<ItemId, Qty>; pendingCrafts: PendingCraft[] } {
  const missingSub: Record<ItemId, Qty> = {};
  const pendingCrafts: PendingCraft[] = [];

  const sortedIngIds = Object.keys(missingIngredients).sort();

  for (const ingId of sortedIngIds) {
    const ingNeed = missingIngredients[ingId];
    if (ingNeed <= 0) continue;

    // `missingIngredients` already contains deficits after current availability.
    const ingDeficit = ingNeed;
    if (ingDeficit <= 0) continue;

    const ingItem = state.itemsMap[ingId];
    if (!ingItem) {
      missingSub[ingId] = (missingSub[ingId] ?? 0) + ingDeficit;
      continue;
    }

    const { ok, reason } = canCraft(ingItem, state.benchLevels, state.unlockedBlueprintItemIds, ingId);
    if (!ok) {
      if (reason === 'blueprint_locked') {
        state.blueprintBlockers.add(ingId);
      } else if (reason === 'insufficient_bench_level' || reason === 'missing_bench') {
        state.benchBlockers.add(ingId);
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

    pendingCrafts.push({
      itemId: ingId,
      totalOutput,
      craftTimes,
      recipe: ingRecipe,
    });
  }

  return { missingSub, pendingCrafts };
}

function cloneAvail(state: PlannerState): Record<ItemId, Qty> {
  return { ...state.avail };
}

function consumeFrom(avail: Record<ItemId, Qty>, itemId: ItemId, qty: Qty): void {
  avail[itemId] = Math.max(0, (avail[itemId] ?? 0) - qty);
}

function addTo(avail: Record<ItemId, Qty>, itemId: ItemId, qty: Qty): void {
  avail[itemId] = (avail[itemId] ?? 0) + qty;
}

function getFrom(avail: Record<ItemId, Qty>, itemId: ItemId): Qty {
  return avail[itemId] ?? 0;
}

function applyPendingCraftsIfPossible(
  state: PlannerState,
  pendingCrafts: PendingCraft[],
): { ok: boolean; avail: Record<ItemId, Qty> } {
  const avail = cloneAvail(state);

  for (const craft of pendingCrafts) {
    for (const [subId, qtyPerCraft] of Object.entries(craft.recipe)) {
      const totalNeeded = qtyPerCraft * craft.craftTimes;
      if (getFrom(avail, subId) < totalNeeded) {
        return { ok: false, avail };
      }
    }

    for (const [subId, qtyPerCraft] of Object.entries(craft.recipe)) {
      consumeFrom(avail, subId, qtyPerCraft * craft.craftTimes);
    }
    addTo(avail, craft.itemId, craft.totalOutput);
  }

  return { ok: true, avail };
}

function getCraftableTimesFromAvail(
  state: PlannerState,
  recipe: Record<ItemId, Qty>,
): Qty {
  let craftableTimes = Infinity;

  for (const [ingId, qtyPerCraft] of Object.entries(recipe)) {
    if (qtyPerCraft <= 0) continue;
    craftableTimes = Math.min(craftableTimes, Math.floor(getAvail(state, ingId) / qtyPerCraft));
  }

  return Number.isFinite(craftableTimes) ? craftableTimes : 0;
}

function getRecipeDeficitsFromAvail(
  state: PlannerState,
  recipe: Record<ItemId, Qty>,
  craftTimes: Qty,
): Record<ItemId, Qty> {
  const deficits: Record<ItemId, Qty> = {};

  for (const [ingId, qtyPerCraft] of Object.entries(recipe)) {
    const totalNeeded = qtyPerCraft * craftTimes;
    const have = getAvail(state, ingId);
    if (have < totalNeeded) {
      deficits[ingId] = totalNeeded - have;
    }
  }

  return deficits;
}

function getUpgradeFamilyIds(state: PlannerState, targetId: ItemId): ItemId[] {
  const target = state.itemsMap[targetId];
  if (!target?.weaponBaseId || !target.weaponTier) return [];

  return Object.keys(state.itemsMap)
    .filter((itemId) => {
      const item = state.itemsMap[itemId];
      return item.weaponBaseId === target.weaponBaseId
        && (item.weaponTier ?? 0) >= 1
        && (item.weaponTier ?? 0) <= target.weaponTier!;
    })
    .sort((a, b) => {
      const tierA = state.itemsMap[a]?.weaponTier ?? 0;
      const tierB = state.itemsMap[b]?.weaponTier ?? 0;
      if (tierA !== tierB) return tierA - tierB;
      return a.localeCompare(b);
    });
}

function getWeaponRootId(state: PlannerState, targetId: ItemId): ItemId | null {
  const target = state.itemsMap[targetId];
  if (!target?.weaponBaseId || !target.weaponTier || target.weaponTier <= 1) return null;
  const root = state.itemsMap[target.weaponBaseId];
  return root ? target.weaponBaseId : null;
}

function buildUpgradePath(state: PlannerState, fromItemId: ItemId, targetId: ItemId): ItemId[] | null {
  const path: ItemId[] = [];
  let currentId = fromItemId;
  const visited = new Set<ItemId>([currentId]);

  while (currentId !== targetId) {
    const nextId = state.itemsMap[currentId]?.upgradesTo;
    if (!nextId || !state.itemsMap[nextId] || visited.has(nextId)) return null;
    path.push(nextId);
    visited.add(nextId);
    currentId = nextId;
  }

  return path;
}

function buildNeededFromCost(state: PlannerState, cost: Record<ItemId, Qty>, qty: Qty): Record<ItemId, Qty> {
  const needed: Record<ItemId, Qty> = {};

  for (const [itemId, qtyPerUpgrade] of Object.entries(cost)) {
    const totalNeeded = qtyPerUpgrade * qty;
    const have = getAvail(state, itemId);
    if (have < totalNeeded) {
      needed[itemId] = totalNeeded - have;
    }
  }

  return needed;
}

function consumeCost(state: PlannerState, cost: Record<ItemId, Qty>, qty: Qty): void {
  for (const [itemId, qtyPerUpgrade] of Object.entries(cost)) {
    consumeAvail(state, itemId, qtyPerUpgrade * qty);
  }
}

function satisfyMaterialNeeds(
  state: PlannerState,
  targetId: ItemId,
  needed: Record<ItemId, Qty>,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
  chainPrefix: ItemId[],
): boolean {
  const directRecycleReasonFactory = buildReasonFactory(
    state,
    targetId,
    requiredSourcesByItemId,
    Object.fromEntries(Object.keys(needed).map((itemId) => [itemId, [...chainPrefix, itemId]])),
  );

  if (Object.keys(needed).length > 0) {
    recycleForNeeded(state, needed, directRecycleReasonFactory, {
      allowDirectRecipeInputSources: false,
    });
  }

  const stillMissing: Record<ItemId, Qty> = {};
  for (const [itemId, qty] of Object.entries(needed)) {
    const have = getAvail(state, itemId);
    if (have < qty) {
      stillMissing[itemId] = qty - have;
    }
  }

  let missingSub: Record<ItemId, Qty> = {};
  let pendingCrafts: PendingCraft[] = [];
  if (Object.keys(stillMissing).length > 0) {
    const phaseCResult = phaseC(state, stillMissing);
    missingSub = phaseCResult.missingSub;
    pendingCrafts = phaseCResult.pendingCrafts;
  }

  const pendingCraftItemIds = new Set(pendingCrafts.map((craft) => craft.itemId));
  const missingWithoutPendingCrafts = Object.fromEntries(
    Object.entries(stillMissing).filter(([itemId]) => !pendingCraftItemIds.has(itemId)),
  );
  if (Object.keys(missingWithoutPendingCrafts).length > 0) {
    recycleForNeeded(state, missingWithoutPendingCrafts, directRecycleReasonFactory);
  }

  const subIngredientChains: Record<ItemId, ItemId[]> = {};
  for (const craft of pendingCrafts) {
    for (const subId of Object.keys(craft.recipe)) {
      subIngredientChains[subId] = [...chainPrefix, craft.itemId, subId];
    }
  }
  const subRecycleReasonFactory = buildReasonFactory(
    state,
    targetId,
    requiredSourcesByItemId,
    subIngredientChains,
  );

  if (Object.keys(missingSub).length > 0) {
    recycleForNeeded(state, missingSub, subRecycleReasonFactory);
  }

  const pendingResult = applyPendingCraftsIfPossible(state, pendingCrafts);
  if (!pendingResult.ok) return false;
  state.avail = pendingResult.avail;

  for (const craft of pendingCrafts) {
    recordCraftStep(state, craft.itemId, craft.totalOutput);
  }

  for (const [itemId, qty] of Object.entries(needed)) {
    if (getAvail(state, itemId) < qty) return false;
  }

  return true;
}

function craftItemFullyForUpgrade(
  state: PlannerState,
  itemId: ItemId,
  qty: Qty,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
  targetId: ItemId,
): boolean {
  const item = state.itemsMap[itemId];
  if (!item) return false;

  const { ok, reason } = canCraft(item, state.benchLevels, state.unlockedBlueprintItemIds, itemId);
  if (!ok) {
    if (reason === 'blueprint_locked') {
      state.blueprintBlockers.add(itemId);
    } else if (reason === 'insufficient_bench_level' || reason === 'missing_bench') {
      state.benchBlockers.add(itemId);
    }
    return false;
  }

  if (item.recipe![itemId] !== undefined) {
    state.cycleDiagnostics.push({ itemId });
    return false;
  }

  const craftTimes = Math.ceil(qty / item.craftQuantity);
  const totalOutput = craftTimes * item.craftQuantity;
  const needed = getRecipeDeficitsFromAvail(state, item.recipe!, craftTimes);

  if (!satisfyMaterialNeeds(state, targetId, needed, requiredSourcesByItemId, [targetId, itemId])) {
    return false;
  }

  for (const [ingId, qtyPerCraft] of Object.entries(item.recipe!)) {
    const totalNeeded = qtyPerCraft * craftTimes;
    if (getAvail(state, ingId) < totalNeeded) return false;
  }

  for (const [ingId, qtyPerCraft] of Object.entries(item.recipe!)) {
    consumeAvail(state, ingId, qtyPerCraft * craftTimes);
  }
  addAvail(state, itemId, totalOutput);
  recordCraftStep(state, itemId, totalOutput);

  return getAvail(state, itemId) >= qty;
}

function applyUpgradePath(
  state: PlannerState,
  fromItemId: ItemId,
  targetId: ItemId,
  qty: Qty,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
): boolean {
  const path = buildUpgradePath(state, fromItemId, targetId);
  if (!path || path.length === 0) return false;

  let currentId = fromItemId;
  for (const toItemId of path) {
    const toItem = state.itemsMap[toItemId];
    if (!toItem?.upgradeCost) return false;
    if ((state.benchLevels.weapon_bench ?? 3) < toItem.stationLevelRequired) {
      state.benchBlockers.add(toItemId);
      return false;
    }

    const needed = buildNeededFromCost(state, toItem.upgradeCost, qty);
    if (!satisfyMaterialNeeds(state, targetId, needed, requiredSourcesByItemId, [targetId, toItemId])) {
      return false;
    }

    for (const [matId, matQty] of Object.entries(toItem.upgradeCost)) {
      if (getAvail(state, matId) < matQty * qty) return false;
    }
    if (getAvail(state, currentId) < qty) return false;

    consumeAvail(state, currentId, qty);
    consumeCost(state, toItem.upgradeCost, qty);
    addAvail(state, toItemId, qty);
    recordWeaponUpgradeStep(state, currentId, toItemId, qty);
    currentId = toItemId;
  }

  return true;
}

function planWeaponUpgradeTarget(
  state: PlannerState,
  targetId: ItemId,
  need: Qty,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
): boolean {
  const target = state.itemsMap[targetId];
  const rootId = getWeaponRootId(state, targetId);
  if (!target?.weaponTier || !rootId) return false;

  let remaining = need;
  const familyIds = getUpgradeFamilyIds(state, targetId);
  const lowerTierIds = familyIds
    .filter((itemId) => itemId !== targetId && (state.itemsMap[itemId]?.weaponTier ?? 0) < target.weaponTier!)
    .sort((a, b) => {
      const tierA = state.itemsMap[a]?.weaponTier ?? 0;
      const tierB = state.itemsMap[b]?.weaponTier ?? 0;
      if (tierA !== tierB) return tierB - tierA;
      return a.localeCompare(b);
    });

  for (const lowerTierId of lowerTierIds) {
    if (remaining <= 0) break;
    const usable = Math.min(remaining, getAvail(state, lowerTierId));
    if (usable <= 0) continue;
    if (!applyUpgradePath(state, lowerTierId, targetId, usable, requiredSourcesByItemId)) {
      return false;
    }
    remaining -= usable;
  }

  while (remaining > 0) {
    if (!craftItemFullyForUpgrade(state, rootId, 1, requiredSourcesByItemId, targetId)) {
      if (state.blueprintBlockers.has(rootId)) {
        state.blueprintBlockers.add(targetId);
      }
      return false;
    }
    if (!applyUpgradePath(state, rootId, targetId, 1, requiredSourcesByItemId)) {
      return false;
    }
    remaining -= 1;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Complete target satisfaction (phases B-D + final check + commit)
// ---------------------------------------------------------------------------

/**
 * Run phases B through D and the final satisfiability check for a craftable target.
 * Phase A must have already been run and returned the missing L1 ingredients.
 * On success, the state is mutated: ingredients consumed, output produced, craft steps recorded, target added to satisfiable.
 */
function completeTargetSatisfaction(
  state: PlannerState,
  targetId: ItemId,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
  phaseAResult: Record<ItemId, Qty>,
): boolean {
  const targetItem = state.itemsMap[targetId];
  if (!targetItem?.recipe) return false;

  const totalOutput = phaseAResult['_totalOutput'] ?? 0;
  const craftTimes = phaseAResult['_craftTimes'] ?? 0;
  delete phaseAResult['_totalOutput'];
  delete phaseAResult['_craftTimes'];

  const missingL1 = { ...phaseAResult };
  const directRecycleReasonFactory = buildReasonFactory(
    state,
    targetId,
    requiredSourcesByItemId,
    Object.fromEntries(Object.keys(missingL1).map((itemId) => [itemId, [targetId, itemId]])),
  );

  // Phase B: Recycle once for direct (L1) inputs, using non-direct-input sources first.
  if (Object.keys(missingL1).length > 0) {
    recycleForNeeded(state, missingL1, directRecycleReasonFactory, {
      allowDirectRecipeInputSources: false,
    });
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
  let pendingCrafts: PendingCraft[] = [];
  if (Object.keys(stillMissingL1).length > 0) {
    const phaseCResult = phaseC(state, stillMissingL1);
    missingSub = phaseCResult.missingSub;
    pendingCrafts = phaseCResult.pendingCrafts;
  }

  const pendingCraftItemIds = new Set(pendingCrafts.map((craft) => craft.itemId));
  const missingL1WithoutPendingCrafts = Object.fromEntries(
    Object.entries(stillMissingL1).filter(([ingId]) => !pendingCraftItemIds.has(ingId)),
  );
  if (Object.keys(missingL1WithoutPendingCrafts).length > 0) {
    recycleForNeeded(state, missingL1WithoutPendingCrafts, directRecycleReasonFactory);
  }

  const subIngredientChains: Record<ItemId, ItemId[]> = {};
  for (const craft of pendingCrafts) {
    for (const subId of Object.keys(craft.recipe)) {
      subIngredientChains[subId] = [targetId, craft.itemId, subId];
    }
  }
  const subRecycleReasonFactory = buildReasonFactory(
    state,
    targetId,
    requiredSourcesByItemId,
    subIngredientChains,
  );

  // Phase D: Recycle once for level-2 sub-ingredients
  if (Object.keys(missingSub).length > 0) {
    recycleForNeeded(state, missingSub, subRecycleReasonFactory);
  }

  let pendingResult = applyPendingCraftsIfPossible(state, pendingCrafts);
  if (!pendingResult.ok && pendingCrafts.length > 0) {
    const remainingL1BeforeFallback = getRecipeDeficitsFromAvail(state, targetRecipe, craftTimes);
    recycleForNeeded(state, remainingL1BeforeFallback, directRecycleReasonFactory);
    pendingCrafts = [];
    pendingResult = applyPendingCraftsIfPossible(state, pendingCrafts);
  }

  // Final check: is this target fully satisfiable?
  let fullySatisfiable = true;
  if (!pendingResult.ok) {
    fullySatisfiable = false;
  }
  for (const [ingId, qtyPerCraft] of Object.entries(targetRecipe)) {
    const totalNeeded = qtyPerCraft * craftTimes;
    if (getFrom(pendingResult.avail, ingId) < totalNeeded) {
      fullySatisfiable = false;
      break;
    }
  }

  // If L2 crafts have unmet sub-ingredients, also not satisfiable
  if (fullySatisfiable && Object.keys(stillMissingL1).length > 0) {
    for (const [ingId] of Object.entries(stillMissingL1)) {
      const ingItem = state.itemsMap[ingId];
      if (!ingItem?.recipe) {
        if (getAvail(state, ingId) < (targetRecipe[ingId] ?? 0) * craftTimes) {
          fullySatisfiable = false;
          break;
        }
        continue;
      }
      const { ok } = canCraft(ingItem, state.benchLevels, state.unlockedBlueprintItemIds, ingId);
      if (!ok) {
        if (getFrom(pendingResult.avail, ingId) < (targetRecipe[ingId] ?? 0) * craftTimes) {
          fullySatisfiable = false;
          break;
        }
      }
    }
  }

  if (!fullySatisfiable) return false;

  // Commit: consume ingredients, produce output, record steps
  state.avail = pendingResult.avail;
  for (const [ingId, qtyPerCraft] of Object.entries(targetRecipe)) {
    consumeAvail(state, ingId, qtyPerCraft * craftTimes);
  }
  addAvail(state, targetId, totalOutput);
  for (const craft of pendingCrafts) {
    recordCraftStep(state, craft.itemId, craft.totalOutput);
  }
  recordCraftStep(state, targetId, totalOutput);

  return true;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the greedy planner for all missing targets.
 *
 * @param itemsMap       – Item database
 * @param requiredFinal  – Aggregated required items from lists
 * @param owned          – Current owned quantities
 * @param benchLevels    – Current bench levels
 * @param targetPriority – Priority metadata from list aggregation
 */
export function runGreedyPlanner(
  itemsMap: ItemsMap,
  requiredFinal: Record<ItemId, Qty>,
  owned: Record<ItemId, Qty>,
  benchLevels: Record<BenchId, number>,
  targetPriority: Record<ItemId, TargetPriority> = {},
  unlockedBlueprintItemIds: Set<ItemId> = new Set(),
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {},
  repairMaterialIds: Set<ItemId> = new Set(),
): GreedyPlanResult {
  // Compute missingFinal (CR-MOD-6.2)
  const missingFinal: Record<ItemId, Qty> = {};
  for (const [itemId, req] of Object.entries(requiredFinal)) {
    const deficit = Math.max(0, req - (owned[itemId] ?? 0));
    if (deficit > 0) {
      missingFinal[itemId] = deficit;
    }
  }

  const directRecipeInputPriority = buildDirectRecipeInputWarnings(
    itemsMap,
    requiredFinal,
    requiredSourcesByItemId,
    targetPriority,
  );

  // Sort missing targets: listIndex ASC, itemIndex ASC, value DESC, itemId ASC (CR-004)
  const sortedTargets = Object.keys(missingFinal).sort((a, b) => {
    const prioA = targetPriority[a] ?? { listIndex: Infinity, itemIndex: Infinity };
    const prioB = targetPriority[b] ?? { listIndex: Infinity, itemIndex: Infinity };
    if (prioA.listIndex !== prioB.listIndex) return prioA.listIndex - prioB.listIndex;
    if (prioA.itemIndex !== prioB.itemIndex) return prioA.itemIndex - prioB.itemIndex;
    const valA = itemsMap[a]?.value ?? 0;
    const valB = itemsMap[b]?.value ?? 0;
    if (valB !== valA) return valB - valA;
    return a.localeCompare(b);
  });

  // Initialize state
  let state: PlannerState = {
    itemsMap,
    benchLevels,
    unlockedBlueprintItemIds,
    avail: { ...owned },
    recycleEligible: { ...owned },
    protectedFromRecycle: new Set<ItemId>(),
    activeDirectRecipeInputSet: directRecipeInputPriority.inputSet,
    directRecipeInputWarnings: directRecipeInputPriority.warnings,
    craftSteps: new Map(),
    weaponUpgradeSteps: new Map(),
    recycleActions: [],
    satisfiableTargets: new Set(),
    cycleDiagnostics: [],
    blueprintBlockers: new Set(),
    benchBlockers: new Set(),
  };

  // Protect all non-recyclable-category items and required final items from recycling (CR-005, CR-009)
  for (const itemId of Object.keys(owned)) {
    const item = itemsMap[itemId];
    if (item && NON_RECYCLABLE_CATEGORIES.has(item.category)) {
      state.protectedFromRecycle.add(itemId);
    }
  }
  for (const itemId of Object.keys(requiredFinal)) {
    state.protectedFromRecycle.add(itemId);
  }

  // Protect repair materials from recycling so the repair pre-pass can consume them
  for (const itemId of repairMaterialIds) {
    state.protectedFromRecycle.add(itemId);
  }

  // L1 ingredients are not hard-protected: they are lower-priority recycle sources
  // and can be sacrificed only after normal recycle candidates and craft paths fail.

  // Process each target greedily
  for (const targetId of sortedTargets) {
    const need = missingFinal[targetId];
    if (need <= 0) continue;

    const targetItem = itemsMap[targetId];
    if (!targetItem) continue;

    const trialState = clonePlannerState(state);

    if (targetItem.weaponTier && targetItem.weaponTier > 1 && targetItem.weaponBaseId) {
      const fullySatisfiable = planWeaponUpgradeTarget(
        trialState,
        targetId,
        need,
        requiredSourcesByItemId,
      );

      if (fullySatisfiable) {
        trialState.satisfiableTargets.add(targetId);
        state = trialState;
      } else {
        mergePlannerDiagnostics(state, trialState);
      }
      continue;
    }

    if (!targetItem.recipe || !targetItem.craftBench) {
      const directTargetRecycleReasonFactory = buildReasonFactory(
        trialState,
        targetId,
        requiredSourcesByItemId,
        { [targetId]: [targetId] },
      );

      recycleForNeeded(trialState, { [targetId]: need }, directTargetRecycleReasonFactory);

      if (getAvail(trialState, targetId) >= (requiredFinal[targetId] ?? 0)) {
        trialState.satisfiableTargets.add(targetId);
        state = trialState;
      }
      continue;
    }

    // Phase A: Direct Craft
    const phaseAResult = phaseA(trialState, targetId, need);
    if (!phaseAResult) {
      mergePlannerDiagnostics(state, trialState);
      continue; // Not craftable
    }

    // Attempt full satisfaction with recycling + L2 crafting
    if (completeTargetSatisfaction(trialState, targetId, requiredSourcesByItemId, phaseAResult)) {
      trialState.satisfiableTargets.add(targetId);
      state = trialState;
      continue;
    }

    // Full need failed — merge diagnostics
    mergePlannerDiagnostics(state, trialState);

    // Binary search for max satisfiable quantity using full pipeline (recycling + L2)
    const targetRecipe = targetItem.recipe!;
    let bestQty = 0;
    let lo = 0;
    let hi = need - 1;

    while (lo <= hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const testState = clonePlannerState(state);
      const midPhaseAResult = phaseA(testState, targetId, mid);
      if (midPhaseAResult && completeTargetSatisfaction(testState, targetId, requiredSourcesByItemId, midPhaseAResult)) {
        bestQty = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
        if (midPhaseAResult) {
          mergePlannerDiagnostics(state, testState);
        }
      }
    }

    // Commit the best quantity found via full pipeline
    if (bestQty > 0) {
      const commitState = clonePlannerState(state);
      const commitPhaseAResult = phaseA(commitState, targetId, bestQty);
      if (commitPhaseAResult && completeTargetSatisfaction(commitState, targetId, requiredSourcesByItemId, commitPhaseAResult)) {
        state = commitState;
      }
    }

    // Partial craft fallback from directly available L1 materials for remaining need
    if (bestQty < need && targetItem.recipe) {
      const remaining = need - bestQty;
      const craftTimes = Math.ceil(remaining / targetItem.craftQuantity);
      const partialCraftTimes = Math.min(craftTimes, getCraftableTimesFromAvail(state, targetRecipe));
      if (partialCraftTimes > 0) {
        const partialOutput = partialCraftTimes * targetItem.craftQuantity;
        for (const [ingId, qtyPerCraft] of Object.entries(targetRecipe)) {
          consumeAvail(state, ingId, qtyPerCraft * partialCraftTimes);
        }
        addAvail(state, targetId, partialOutput);
        recordCraftStep(state, targetId, partialOutput);
      }
    }
  }

  // Compute remaining deficits: for each missing target, check what ingredients
  // the planner still couldn't source after all phases
  const remainingDeficits: Record<ItemId, Qty> = {};
  for (const targetId of sortedTargets) {
    const need = Math.max(0, (requiredFinal[targetId] ?? 0) - getAvail(state, targetId));
    if (need <= 0) continue;
    if (state.satisfiableTargets.has(targetId)) continue;

    const item = itemsMap[targetId];
    if (!item) continue;

    if (item.weaponTier && item.weaponTier > 1 && item.weaponBaseId) {
      const root = itemsMap[item.weaponBaseId];
      if (root?.recipe) {
        const rootHave = getAvail(state, item.weaponBaseId);
        const rootNeed = Math.max(0, need - rootHave);
        if (rootNeed > 0) {
          const craftTimes = Math.ceil(rootNeed / root.craftQuantity);
          for (const [ingId, qtyPerCraft] of Object.entries(root.recipe)) {
            const totalNeeded = qtyPerCraft * craftTimes;
            const have = getAvail(state, ingId);
            if (have < totalNeeded) {
              remainingDeficits[ingId] = (remainingDeficits[ingId] ?? 0) + (totalNeeded - have);
            }
          }
        }
      }

      const familyIds = getUpgradeFamilyIds(state, targetId);
      const targetTier = item.weaponTier;
      for (const stepTargetId of familyIds) {
        const stepTarget = itemsMap[stepTargetId];
        if (!stepTarget?.upgradeCost || !stepTarget.weaponTier || stepTarget.weaponTier > targetTier) continue;
        if (stepTarget.weaponTier <= 1) continue;
        for (const [matId, qtyPerUpgrade] of Object.entries(stepTarget.upgradeCost)) {
          const totalNeeded = qtyPerUpgrade * need;
          const have = getAvail(state, matId);
          if (have < totalNeeded) {
            remainingDeficits[matId] = (remainingDeficits[matId] ?? 0) + (totalNeeded - have);
          }
        }
      }
      continue;
    }

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
    weaponUpgradeSteps: Array.from(state.weaponUpgradeSteps.values()),
    recycleActions: state.recycleActions,
    satisfiableTargets: state.satisfiableTargets,
    remainingDeficits,
    cycleDiagnostics: state.cycleDiagnostics,
    blueprintBlockers: state.blueprintBlockers,
    benchBlockers: state.benchBlockers,
  };
}

// ---------------------------------------------------------------------------
// Craftability computation for RED LOCK indicator
// ---------------------------------------------------------------------------

/**
 * Compute CraftabilityInfo for every item that has a recipe.
 * Used by ItemIcon (RED LOCK) and ItemTooltip (craft condition rows).
 */
export function computeCraftability(
  itemsMap: ItemsMap,
  benchLevels: Record<BenchId, number>,
  unlockedBlueprintItemIds: Set<ItemId>,
): Record<ItemId, CraftabilityInfo> {
  const result: Record<ItemId, CraftabilityInfo> = {};

  for (const [itemId, item] of Object.entries(itemsMap)) {
    const hasRecipe = !!item.recipe && Object.keys(item.recipe).length > 0;

    if (!hasRecipe) {
      result[itemId] = { hasRecipe: false, canCraft: true };
      continue;
    }

    const { ok, reason } = canCraft(item, benchLevels, unlockedBlueprintItemIds, itemId);

    const info: CraftabilityInfo = {
      hasRecipe: true,
      canCraft: ok,
    };

    // Blueprint condition
    if (item.blueprintLocked) {
      const isUnlocked = unlockedBlueprintItemIds.has(itemId);
      info.blueprint = {
        satisfied: isUnlocked,
        label: 'Blueprint',
        detail: isUnlocked ? 'Learned' : 'Not learned',
      };
    }

    // Bench condition
    if (item.craftBench) {
      const currentLevel = benchLevels[item.craftBench] ?? 3;
      const met = currentLevel >= item.stationLevelRequired;
      const benchName = item.craftBench
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      info.bench = {
        satisfied: met,
        label: benchName,
        detail: met
          ? `Tier ${item.stationLevelRequired} ✓`
          : `Tier ${item.stationLevelRequired} required, you have Tier ${currentLevel}`,
      };
    } else if (reason === 'missing_bench') {
      info.bench = {
        satisfied: false,
        label: 'No workbench',
        detail: 'Cannot be crafted at any workbench',
      };
    }

    result[itemId] = info;
  }

  // Propagate blueprint lock and bench info from tier 1 base weapons to higher-tier family members.
  for (const [itemId, item] of Object.entries(itemsMap)) {
    if (!item.weaponTier || item.weaponTier <= 1 || !item.weaponBaseId) continue;
    const baseInfo = result[item.weaponBaseId];
    const existingInfo = result[itemId];
    const hasBlueprintLock = baseInfo?.blueprint && !baseInfo.blueprint.satisfied;
    const hasBenchInfo = !!baseInfo?.bench;
    if (!hasBlueprintLock && !hasBenchInfo) continue;
    result[itemId] = {
      ...(hasBlueprintLock
        ? { hasRecipe: true as const, canCraft: false as const, blueprint: { ...baseInfo.blueprint! } }
        : { hasRecipe: existingInfo.hasRecipe, canCraft: existingInfo.canCraft }),
      ...(hasBenchInfo ? { bench: { ...baseInfo.bench! } } : {}),
    };
  }

  return result;
}
