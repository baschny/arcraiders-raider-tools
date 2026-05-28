/**
 * Loot Suggestions
 * See Final Spec Section 4.5 & 5.1
 */

import type { ItemsMap } from '../../types/item';
import type { ItemId, Qty, LootSuggestion, LootReason, LootBadge, LootSuggestionList } from '../../types/planner';
import { NON_RECYCLABLE_CATEGORIES } from '../../types/item';

/**
 * Fixed enum order for reasons
 */
const REASON_ORDER: LootReason[] = [
  'missing_direct',
  'recycle_yields_missing',
  'salvage_yields_missing',
];

/**
 * Compute the set of items appearing as recipe ingredients or recipe outputs
 */
function computeRecipeRelevantSet(itemsMap: ItemsMap): Set<ItemId> {
  const relevant = new Set<ItemId>();

  for (const [itemId, item] of Object.entries(itemsMap)) {
    if (item.recipe && Object.keys(item.recipe).length > 0 && item.craftBench) {
      // Item is a recipe output
      relevant.add(itemId);
      // Its ingredients are recipe-relevant
      for (const ingId of Object.keys(item.recipe)) {
        relevant.add(ingId);
      }
    }
    if (item.upgradeCost && Object.keys(item.upgradeCost).length > 0) {
      relevant.add(itemId);
      for (const ingId of Object.keys(item.upgradeCost)) {
        relevant.add(ingId);
      }
    }
  }

  return relevant;
}

/**
 * Check if an item is crafting-relevant (CR-ADD-6.X)
 * Not in loadout categories AND (in recipeRelevantSet OR recycles into recipeRelevantSet)
 */
function isCraftingRelevant(
  itemId: ItemId,
  item: { category: string; recyclesInto?: Record<string, number> },
  recipeRelevantSet: Set<ItemId>,
): boolean {
  if (NON_RECYCLABLE_CATEGORIES.has(item.category)) return false;
  if (recipeRelevantSet.has(itemId)) return true;
  if (item.recyclesInto) {
    for (const yieldId of Object.keys(item.recyclesInto)) {
      if (recipeRelevantSet.has(yieldId)) return true;
    }
  }
  return false;
}

/**
 * Determine loot badge (Final Spec Section 4.5)
 * Salvage yields missing → CAN_SALVAGE, otherwise BRING_HOME
 */
function determineBadge(
  item: { recyclesInto?: Record<string, number>; salvagesInto?: Record<string, number> },
  neededMaterials: Set<ItemId>,
): LootBadge {
  const recycleUseful = new Set<string>();
  const salvageUseful = new Set<string>();

  if (item.recyclesInto) {
    for (const [matId, qty] of Object.entries(item.recyclesInto)) {
      if (qty > 0 && neededMaterials.has(matId)) recycleUseful.add(matId);
    }
  }
  if (item.salvagesInto) {
    for (const [matId, qty] of Object.entries(item.salvagesInto)) {
      if (qty > 0 && neededMaterials.has(matId)) salvageUseful.add(matId);
    }
  }

  // If recycle yields something salvage doesn't → BRING_HOME
  const recycleExclusive = [...recycleUseful].filter(m => !salvageUseful.has(m));
  if (recycleExclusive.length > 0) return 'BRING_HOME';
  if (salvageUseful.size > 0) return 'CAN_SALVAGE';
  return 'BRING_HOME';
}

/**
 * Calculate impacted targets count
 */
function calculateImpactedTargets(
  itemId: ItemId,
  item: { recyclesInto?: Record<string, number>; salvagesInto?: Record<string, number> },
  deficits: Record<ItemId, Qty>,
): number {
  const impacted = new Set<ItemId>();

  if (deficits[itemId] > 0) impacted.add(itemId);

  if (item.recyclesInto) {
    for (const [matId, qty] of Object.entries(item.recyclesInto)) {
      if (qty > 0 && deficits[matId] > 0) impacted.add(matId);
    }
  }
  if (item.salvagesInto) {
    for (const [matId, qty] of Object.entries(item.salvagesInto)) {
      if (qty > 0 && deficits[matId] > 0) impacted.add(matId);
    }
  }

  return impacted.size;
}

/**
 * Generate loot suggestions based on deficits
 * Only crafting-relevant items, excluding loadout categories (Final Spec Section 5.1)
 */
export function generateLootSuggestions(
  itemsMap: ItemsMap,
  deficits: Record<ItemId, Qty>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _requiredFinal: Record<ItemId, Qty>,
): LootSuggestionList {
  const recipeRelevantSet = computeRecipeRelevantSet(itemsMap);
  const neededMaterials = new Set(
    Object.keys(deficits).filter(matId => deficits[matId] > 0),
  );

  const suggestions: LootSuggestion[] = [];

  const addSuggestion = (itemId: ItemId, reason: LootReason) => {
    let suggestion = suggestions.find(s => s.itemId === itemId);
    if (!suggestion) {
      suggestion = { itemId, reasons: [], badge: 'BRING_HOME' };
      suggestions.push(suggestion);
    }
    if (!suggestion.reasons.includes(reason)) {
      suggestion.reasons.push(reason);
    }
  };

  const allItemIds = Object.keys(itemsMap).sort();

  for (const itemId of allItemIds) {
    const item = itemsMap[itemId];

    // Skip non-recyclable category items entirely (CR-005)
    if (NON_RECYCLABLE_CATEGORIES.has(item.category)) continue;

    // Skip non-crafting-relevant items
    if (!isCraftingRelevant(itemId, item, recipeRelevantSet)) continue;

    // Direct missing material → BRING_HOME
    if (deficits[itemId] > 0) {
      addSuggestion(itemId, 'missing_direct');
    }

    // Salvage yields missing material → CAN_SALVAGE
    if (item.salvagesInto) {
      for (const [matId, qty] of Object.entries(item.salvagesInto)) {
        if (qty > 0 && neededMaterials.has(matId)) {
          addSuggestion(itemId, 'salvage_yields_missing');
          break;
        }
      }
    }

    // Recycle yields missing material → BRING_HOME
    if (item.recyclesInto) {
      for (const [matId, qty] of Object.entries(item.recyclesInto)) {
        if (qty > 0 && neededMaterials.has(matId)) {
          addSuggestion(itemId, 'recycle_yields_missing');
          break;
        }
      }
    }
  }

  // Finalize: sort reasons, determine badge, calculate impacts
  for (const suggestion of suggestions) {
    const item = itemsMap[suggestion.itemId];
    suggestion.reasons.sort((a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b));
    suggestion.badge = determineBadge(item, neededMaterials);
    suggestion.impactedTargetsCount = calculateImpactedTargets(suggestion.itemId, item, deficits);
  }

  // Sort by itemId ascending (deterministic)
  suggestions.sort((a, b) => a.itemId.localeCompare(b.itemId));

  return { items: suggestions };
}
