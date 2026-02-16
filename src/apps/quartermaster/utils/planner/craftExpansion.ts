/**
 * Craft Expansion with Cycle Detection
 * See specification sections 6.2 and 6.3
 */

import type { ItemsMap, BenchId } from '../../types/item';
import type { ItemId, Qty, CraftStep, CycleDiagnostic, UncraftableReason } from '../../types/planner';
import { MAX_EXPANSION_DEPTH, BENCH_ORDER } from '../../types/item';

export interface ExpansionState {
  /** Total quantities needed for each item (including intermediates) */
  totalRequired: Record<ItemId, Qty>;
  /** Items that need to be crafted (have recipe and bench) */
  craftSteps: Map<ItemId, CraftStep>;
  /** Items marked uncraftable due to cycles */
  cycleBlockers: Set<ItemId>;
  /** Cycle diagnostics for display */
  cycleDiagnostics: CycleDiagnostic[];
  /** Items blocked by blueprint */
  blueprintBlockers: Set<ItemId>;
  /** Items blocked by bench level */
  benchBlockers: Set<ItemId>;
  /** Items required as intermediate crafting ingredients */
  intermediateItems: Set<ItemId>;
}

interface ExpansionContext {
  itemsMap: ItemsMap;
  benchLevels: Record<BenchId, number>;
  visiting: Set<ItemId>;
  stack: ItemId[];
  state: ExpansionState;
}

/**
 * Check if an item can be crafted
 */
function canCraft(
  item: { recipe?: Record<string, number>; craftBench?: BenchId; blueprintLocked: boolean; stationLevelRequired: 1 | 2 | 3 },
  benchLevels: Record<BenchId, number>
): { craftable: boolean; reason?: UncraftableReason } {
  // No recipe or empty recipe
  if (!item.recipe || Object.keys(item.recipe).length === 0) {
    return { craftable: false };
  }

  // No bench defined
  if (!item.craftBench) {
    return { craftable: false };
  }

  // Blueprint locked
  if (item.blueprintLocked) {
    return { craftable: false, reason: 'blueprint_or_bench' };
  }

  // Bench level insufficient
  const requiredLevel = item.stationLevelRequired;
  const currentLevel = benchLevels[item.craftBench] ?? 3; // Default to 3 per spec
  if (currentLevel < requiredLevel) {
    return { craftable: false, reason: 'blueprint_or_bench' };
  }

  return { craftable: true };
}

/**
 * Recursively expand craft requirements
 * Depth-first traversal with sorted dependencies
 */
function expandItem(
  ctx: ExpansionContext,
  itemId: ItemId,
  qtyNeeded: Qty,
  depth: number
): void {
  // Stop at max depth
  if (depth > MAX_EXPANSION_DEPTH) {
    return;
  }

  const item = ctx.itemsMap[itemId];
  if (!item) {
    return; // Unknown item
  }

  // Add to total required
  ctx.state.totalRequired[itemId] = (ctx.state.totalRequired[itemId] ?? 0) + qtyNeeded;

  // Check for cycle
  if (ctx.visiting.has(itemId)) {
    // Cycle detected - record diagnostic
    const cycleStart = ctx.stack.indexOf(itemId);
    const cyclePath = [...ctx.stack.slice(cycleStart), itemId];
    
    ctx.state.cycleDiagnostics.push({
      itemId,
      path: cyclePath,
    });
    ctx.state.cycleBlockers.add(itemId);
    return;
  }

  // Check if craftable
  const { craftable, reason } = canCraft(item, ctx.benchLevels);

  if (!craftable) {
    if (reason === 'blueprint_or_bench') {
      if (item.blueprintLocked) {
        ctx.state.blueprintBlockers.add(itemId);
      } else {
        ctx.state.benchBlockers.add(itemId);
      }
    }
    return; // Base material or uncraftable - stop expansion
  }

  // Mark as visiting for cycle detection
  ctx.visiting.add(itemId);
  ctx.stack.push(itemId);

  // Calculate how many times we need to craft
  const craftQuantity = item.craftQuantity;
  const craftTimes = Math.ceil(qtyNeeded / craftQuantity);
  const totalOutput = craftTimes * craftQuantity;

  // Add or update craft step
  const existingStep = ctx.state.craftSteps.get(itemId);
  if (existingStep) {
    existingStep.qty += totalOutput;
  } else {
    ctx.state.craftSteps.set(itemId, {
      benchId: item.craftBench!,
      itemId,
      qty: totalOutput,
      stationLevelRequired: item.stationLevelRequired,
      blueprintLocked: item.blueprintLocked,
      isUncraftable: false,
    });
  }

  // Expand recipe dependencies (sorted by itemId for determinism)
  const recipe = item.recipe!;
  const ingredientIds = Object.keys(recipe).sort();

  for (const ingredientId of ingredientIds) {
    const ingredientQtyPerCraft = recipe[ingredientId];
    const totalIngredientNeeded = ingredientQtyPerCraft * craftTimes;
    
    // Mark as intermediate
    ctx.state.intermediateItems.add(ingredientId);
    
    // Recursively expand
    expandItem(ctx, ingredientId, totalIngredientNeeded, depth + 1);
  }

  // Done visiting
  ctx.visiting.delete(itemId);
  ctx.stack.pop();
}

/**
 * Expand all required items from loadouts
 * Returns complete expansion state with all intermediate requirements
 */
export function expandCraftRequirements(
  required: Record<ItemId, Qty>,
  itemsMap: ItemsMap,
  benchLevels: Record<BenchId, number>
): ExpansionState {
  const state: ExpansionState = {
    totalRequired: { ...required },
    craftSteps: new Map(),
    cycleBlockers: new Set(),
    cycleDiagnostics: [],
    blueprintBlockers: new Set(),
    benchBlockers: new Set(),
    intermediateItems: new Set(),
  };

  const ctx: ExpansionContext = {
    itemsMap,
    benchLevels,
    visiting: new Set(),
    stack: [],
    state,
  };

  // Process required items in sorted order for determinism
  const sortedItemIds = Object.keys(required).sort();

  for (const itemId of sortedItemIds) {
    const qty = required[itemId];
    expandItem(ctx, itemId, qty, 0);
  }

  // Mark cycle-affected craft steps
  for (const itemId of state.cycleBlockers) {
    const step = state.craftSteps.get(itemId);
    if (step) {
      step.isUncraftable = true;
      step.uncraftableReason = 'cycle';
    }
  }

  return state;
}

/**
 * Sort craft steps by bench order then itemId
 * Returns array for CraftPlan.steps
 */
export function sortCraftSteps(craftSteps: Map<ItemId, CraftStep>): CraftStep[] {
  const steps = Array.from(craftSteps.values());
  
  return steps.sort((a, b) => {
    // First by bench order
    const benchOrderA = BENCH_ORDER.indexOf(a.benchId);
    const benchOrderB = BENCH_ORDER.indexOf(b.benchId);
    if (benchOrderA !== benchOrderB) {
      return benchOrderA - benchOrderB;
    }
    // Then by itemId
    return a.itemId.localeCompare(b.itemId);
  });
}
