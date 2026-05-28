/**
 * In-Raid Acquisition Suggestions (CR-005)
 *
 * Replaces the crafting-only loot suggestion model with a broader model
 * that generates suggestions from two independent pipelines:
 *   1. Direct loot targets – missing final targets not satisfiable via local crafting
 *   2. Craft-support materials – missing direct/L2 inputs (crafting-relevant only)
 *
 * See change-04 sections CR-004 through CR-016.
 * See Final Spec Section 6.5
 */

import type { ItemsMap } from '../../types/item';
import type {
  ItemId,
  Qty,
  InRaidSuggestion,
  InRaidSuggestionList,
  InRaidReason,
  LootBadge,
  RequiredSource,
} from '../../types/planner';
import { calculateProvenance } from './provenance';
import { NON_RECYCLABLE_CATEGORIES } from '../../types/item';

// ---------------------------------------------------------------------------
// Helpers (carried over from lootSuggestions.ts)
// ---------------------------------------------------------------------------

/**
 * Compute the set of items appearing as recipe ingredients or recipe outputs.
 */
function computeRecipeRelevantSet(itemsMap: ItemsMap): Set<ItemId> {
  const relevant = new Set<ItemId>();

  for (const [itemId, item] of Object.entries(itemsMap)) {
    if (item.recipe && Object.keys(item.recipe).length > 0 && item.craftBench) {
      relevant.add(itemId);
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
 * Check if an item is crafting-relevant (section 6.3.3).
 * Not in nonRecyclableCategories AND (in recipeRelevantSet OR recycles into recipeRelevantSet).
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
 * Determine badge for a suggestion item.
 * Salvage-only path → CAN_SALVAGE, otherwise BRING_HOME.
 */
function determineBadge(
  item: { recyclesInto?: Record<string, number>; salvagesInto?: Record<string, number> },
  neededMaterials: Set<ItemId>,
  shouldBringHome: boolean,
): LootBadge {
  // Final targets and directly needed craft materials are always BRING_HOME.
  if (shouldBringHome) return 'BRING_HOME';

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

  const recycleExclusive = [...recycleUseful].filter(m => !salvageUseful.has(m));
  if (recycleExclusive.length > 0) return 'BRING_HOME';
  if (salvageUseful.size > 0) return 'CAN_SALVAGE';
  return 'BRING_HOME';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate In-Raid acquisition suggestions.
 *
 * @param itemsMap           - Full item database
 * @param deficits           - Merged deficits (top-level + remaining ingredient deficits)
 * @param requiredFinal      - Aggregated required items from lists
 * @param satisfiableTargets - Set of target itemIds fully satisfiable by planner
 * @param requiredSourcesByItemId - List provenance per target item
 */
export function generateInRaidSuggestions(
  itemsMap: ItemsMap,
  deficits: Record<ItemId, Qty>,
  requiredFinal: Record<ItemId, Qty>,
  satisfiableTargets: Set<ItemId>,
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>,
): InRaidSuggestionList {
  const recipeRelevantSet = computeRecipeRelevantSet(itemsMap);

  // All materials the planner still needs
  const neededMaterials = new Set(
    Object.keys(deficits).filter(matId => deficits[matId] > 0),
  );

  // Accumulator keyed by itemId for deduplication (CR-006)
  const suggestionMap = new Map<ItemId, InRaidSuggestion>();

  const getOrCreate = (itemId: ItemId): InRaidSuggestion => {
    let s = suggestionMap.get(itemId);
    if (!s) {
      s = { itemId, reasons: [], badge: 'BRING_HOME', impactedTargetItemIds: [] };
      suggestionMap.set(itemId, s);
    }
    return s;
  };

  const addReason = (itemId: ItemId, reason: InRaidReason) => {
    const s = getOrCreate(itemId);
    if (!s.reasons.includes(reason)) {
      s.reasons.push(reason);
    }
  };

  // -----------------------------------------------------------------------
  // Pipeline 1: Direct loot targets (CR-004)
  //   Missing final targets not locally satisfiable.
  //   Included regardless of crafting-relevance and nonRecyclableCategories.
  // -----------------------------------------------------------------------
  for (const itemId of Object.keys(requiredFinal).sort()) {
    if ((deficits[itemId] ?? 0) <= 0) continue;
    if (satisfiableTargets.has(itemId)) continue;

    const item = itemsMap[itemId];
    if (!item) continue;

    addReason(itemId, 'BRING_HOME_FINAL_TARGET');

    // Attach list provenance (handled in Finalize for all pipelines)
  }

  // -----------------------------------------------------------------------
  // Pipeline 2: Craft-support materials
  //   Only crafting-relevant items (existing logic), but nonRecyclableCategories
  //   exclusion applies only to recycle/salvage paths, not direct-target inclusion.
  // -----------------------------------------------------------------------
  const allItemIds = Object.keys(itemsMap).sort();

  for (const itemId of allItemIds) {
    const item = itemsMap[itemId];

    // Direct missing material (crafting-relevant only)
    if (deficits[itemId] > 0 && isCraftingRelevant(itemId, item, recipeRelevantSet)) {
      addReason(itemId, 'BRING_HOME_DIRECT_MATERIAL');
    }

    // Salvage yields missing material (skip nonRecyclableCategories for salvage path)
    if (!NON_RECYCLABLE_CATEGORIES.has(item.category) && item.salvagesInto) {
      for (const [matId, qty] of Object.entries(item.salvagesInto)) {
        if (qty > 0 && neededMaterials.has(matId)) {
          if (isCraftingRelevant(itemId, item, recipeRelevantSet)) {
            addReason(itemId, 'SALVAGE_FOR_MATERIAL');
          }
          break;
        }
      }
    }

    // Recycle yields missing material (skip nonRecyclableCategories for recycle path)
    if (!NON_RECYCLABLE_CATEGORIES.has(item.category) && item.recyclesInto) {
      for (const [matId, qty] of Object.entries(item.recyclesInto)) {
        if (qty > 0 && neededMaterials.has(matId)) {
          if (isCraftingRelevant(itemId, item, recipeRelevantSet)) {
            addReason(itemId, 'BRING_HOME_FOR_RECYCLE_YIELD');
          }
          break;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Pipeline 3: Pre-compute deep material dependencies for provenance
  // -----------------------------------------------------------------------
  const provenanceMap = calculateProvenance(itemsMap, requiredSourcesByItemId, deficits);

  // -----------------------------------------------------------------------
  // Pipeline 4: Craftable materials — deep ingredients that are not in deficit
  //   but can be crafted into a needed material
  // -----------------------------------------------------------------------
  for (const itemId of allItemIds) {
    // Skip items already suggested by previous pipelines
    if (suggestionMap.has(itemId)) continue;

    const item = itemsMap[itemId];
    if (!item) continue;

    // Check if this item is a deep dependency of a target with a deficit
    const provenanceSources = provenanceMap[itemId];
    if (!provenanceSources?.length) continue;

    // Item must NOT already be in deficit (avoid duplicates with BRING_HOME_DIRECT_MATERIAL)
    if ((deficits[itemId] ?? 0) > 0) continue;

    // Item must not be in non-recyclable categories
    if (NON_RECYCLABLE_CATEGORIES.has(item.category)) continue;

    // Item must have at least one impacted target with a deficit that is NOT satisfiable
    const hasImpactedDeficit = provenanceSources.some(
      (source) => source.impactedTargetItemIds.some(
        (tid) => (deficits[tid] ?? 0) > 0 && !satisfiableTargets.has(tid),
      ),
    );
    if (!hasImpactedDeficit) continue;

    addReason(itemId, 'CRAFTING_INGREDIENT_FOR_DEFICIT');
  }

  // -----------------------------------------------------------------------
  // Finalize: compute badges, impacted targets, sort reasons
  // -----------------------------------------------------------------------
  const REASON_ORDER: InRaidReason[] = [
    'BRING_HOME_FINAL_TARGET',
    'BRING_HOME_DIRECT_MATERIAL',
    'SALVAGE_FOR_MATERIAL',
    'BRING_HOME_FOR_RECYCLE_YIELD',
    'CRAFTING_INGREDIENT_FOR_DEFICIT',
  ];

  const suggestions = Array.from(suggestionMap.values());

  for (const suggestion of suggestions) {
    const item = itemsMap[suggestion.itemId];
    if (!item) continue;

    // Sort reasons deterministically
    suggestion.reasons.sort(
      (a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b),
    );

    // Badge: keep/direct-material/ingredient reasons take precedence over recycle/salvage yields.
    const isFinalTarget = suggestion.reasons.includes('BRING_HOME_FINAL_TARGET');
    const isDirectMaterial = suggestion.reasons.includes('BRING_HOME_DIRECT_MATERIAL');
    const isCraftingIngredient = suggestion.reasons.includes('CRAFTING_INGREDIENT_FOR_DEFICIT');
    suggestion.badge = determineBadge(item, neededMaterials, isFinalTarget || isDirectMaterial || isCraftingIngredient);

    // Attach listSources and impactedTargetItemIds from the shared provenance
    const sources = provenanceMap[suggestion.itemId];
    if (sources && sources.length > 0) {
      suggestion.listSources = sources as RequiredSource[];

      const impacted = new Set<string>();
      for (const s of sources) {
        if (s.impactedTargetItemIds) {
          for (const tid of s.impactedTargetItemIds) {
            impacted.add(tid);
          }
        }
      }
      suggestion.impactedTargetItemIds = Array.from(impacted).sort();
    } else {
      suggestion.impactedTargetItemIds = [];
    }
  }

  // -----------------------------------------------------------------------
  // Sort: missing final targets first, then craft-support, then craftable ingredients, itemId within groups (CR-006)
  // -----------------------------------------------------------------------
  suggestions.sort((a, b) => {
    const aIsFinal = a.reasons.includes('BRING_HOME_FINAL_TARGET') ? 0 : 1;
    const bIsFinal = b.reasons.includes('BRING_HOME_FINAL_TARGET') ? 0 : 1;
    if (aIsFinal !== bIsFinal) return aIsFinal - bIsFinal;
    const aIsCraftSupport = a.reasons.some((r) => r !== 'CRAFTING_INGREDIENT_FOR_DEFICIT' && r !== 'BRING_HOME_FINAL_TARGET') ? 0 : 1;
    const bIsCraftSupport = b.reasons.some((r) => r !== 'CRAFTING_INGREDIENT_FOR_DEFICIT' && r !== 'BRING_HOME_FINAL_TARGET') ? 0 : 1;
    if (aIsCraftSupport !== bIsCraftSupport) return aIsCraftSupport - bIsCraftSupport;
    return a.itemId.localeCompare(b.itemId);
  });

  return { items: suggestions };
}
