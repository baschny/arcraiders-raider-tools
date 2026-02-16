/**
 * Loot Suggestions
 * See specification section 6.7
 */

import type { ItemsMap } from '../../types/item';
import type { ItemId, Qty, LootSuggestion, LootReason, LootBadge, LootSuggestionList } from '../../types/planner';

/**
 * Fixed enum order for reasons (section 6.8.1)
 */
const REASON_ORDER: LootReason[] = [
  'missing_direct',
  'recycle_yields_missing',
  'craft_output_missing',
  'salvage_yields_missing',
];

/**
 * Determine loot badge based on recycle vs salvage yields
 * See specification section 6.7.1
 */
function determineBadge(
  item: { recyclesInto?: Record<string, number>; salvagesInto?: Record<string, number> },
  deficits: Record<ItemId, Qty>
): LootBadge {
  const neededMaterials = new Set(
    Object.keys(deficits).filter(matId => deficits[matId] > 0)
  );

  const recycleUseful = new Set<string>();
  const salvageUseful = new Set<string>();

  // Find materials this item yields that are needed
  if (item.recyclesInto) {
    for (const [matId, yield_] of Object.entries(item.recyclesInto)) {
      if (yield_ > 0 && neededMaterials.has(matId)) {
        recycleUseful.add(matId);
      }
    }
  }

  if (item.salvagesInto) {
    for (const [matId, yield_] of Object.entries(item.salvagesInto)) {
      if (yield_ > 0 && neededMaterials.has(matId)) {
        salvageUseful.add(matId);
      }
    }
  }

  // recycleUseful \ salvageUseful (recycle yields something salvage doesn't)
  const recycleExclusive = new Set(
    [...recycleUseful].filter(m => !salvageUseful.has(m))
  );

  // If recycle yields unique needed materials, BRING_HOME
  if (recycleExclusive.size > 0) {
    return 'BRING_HOME';
  }

  // If salvage yields needed materials, CAN_SALVAGE
  if (salvageUseful.size > 0) {
    return 'CAN_SALVAGE';
  }

  // Default to BRING_HOME
  return 'BRING_HOME';
}

/**
 * Calculate impacted targets count
 * Number of final missing itemIds whose deficit would be reduced
 */
function calculateImpactedTargets(
  itemId: ItemId,
  item: { recyclesInto?: Record<string, number>; salvagesInto?: Record<string, number>; recipe?: Record<string, number>; craftBench?: string },
  deficits: Record<ItemId, Qty>
): number {
  const impacted = new Set<ItemId>();

  // Missing directly
  if (deficits[itemId] > 0) {
    impacted.add(itemId);
  }

  // Via recyclesInto
  if (item.recyclesInto) {
    for (const [matId, yield_] of Object.entries(item.recyclesInto)) {
      if (yield_ > 0 && deficits[matId] > 0) {
        impacted.add(matId);
      }
    }
  }

  // Via salvagesInto
  if (item.salvagesInto) {
    for (const [matId, yield_] of Object.entries(item.salvagesInto)) {
      if (yield_ > 0 && deficits[matId] > 0) {
        impacted.add(matId);
      }
    }
  }

  return impacted.size;
}

/**
 * Generate loot suggestions based on deficits
 * See specification section 6.7
 */
export function generateLootSuggestions(
  itemsMap: ItemsMap,
  deficits: Record<ItemId, Qty>
): LootSuggestionList {
  const suggestions: LootSuggestion[] = [];
  const addedItems = new Set<ItemId>();

  // Helper to add a suggestion
  const addSuggestion = (itemId: ItemId, reason: LootReason) => {
    if (!itemsMap[itemId]) return;

    let suggestion = suggestions.find(s => s.itemId === itemId);
    if (!suggestion) {
      suggestion = {
        itemId,
        reasons: [],
        badge: 'BRING_HOME', // Will be determined later
      };
      suggestions.push(suggestion);
      addedItems.add(itemId);
    }
    if (!suggestion.reasons.includes(reason)) {
      suggestion.reasons.push(reason);
    }
  };

  // 1. Items missing directly
  for (const itemId of Object.keys(deficits).sort()) {
    if (deficits[itemId] > 0 && itemsMap[itemId]) {
      addSuggestion(itemId, 'missing_direct');
    }
  }

  // 2-4. Check all items for recycle/craft/salvage yields
  const allItemIds = Object.keys(itemsMap).sort();
  const neededMaterials = new Set(
    Object.keys(deficits).filter(matId => deficits[matId] > 0)
  );

  for (const itemId of allItemIds) {
    const item = itemsMap[itemId];

    // RecyclesInto yields missing material
    if (item.recyclesInto) {
      for (const [matId, yield_] of Object.entries(item.recyclesInto)) {
        if (yield_ > 0 && neededMaterials.has(matId)) {
          addSuggestion(itemId, 'recycle_yields_missing');
          break;
        }
      }
    }

    // Recipe produces missing material (item itself is craftable and missing)
    // Per spec clarification: item is a craftable output AND has deficit > 0
    if (item.recipe && Object.keys(item.recipe).length > 0 && item.craftBench) {
      if (deficits[itemId] > 0) {
        addSuggestion(itemId, 'craft_output_missing');
      }
    }

    // SalvagesInto yields missing material
    if (item.salvagesInto) {
      for (const [matId, yield_] of Object.entries(item.salvagesInto)) {
        if (yield_ > 0 && neededMaterials.has(matId)) {
          addSuggestion(itemId, 'salvage_yields_missing');
          break;
        }
      }
    }
  }

  // Determine badges and impacted counts
  for (const suggestion of suggestions) {
    const item = itemsMap[suggestion.itemId];
    
    // Sort reasons by fixed enum order
    suggestion.reasons.sort((a, b) => 
      REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b)
    );

    // Determine badge
    suggestion.badge = determineBadge(item, deficits);

    // Calculate impacted targets
    suggestion.impactedTargetsCount = calculateImpactedTargets(
      suggestion.itemId,
      item,
      deficits
    );
  }

  // Sort by itemId (ASCII ascending)
  suggestions.sort((a, b) => a.itemId.localeCompare(b.itemId));

  return { items: suggestions };
}
