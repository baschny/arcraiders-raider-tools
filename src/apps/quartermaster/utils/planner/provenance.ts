import type { PlannerItem, ItemsMap } from '../../types/item';
import type { ItemId, Qty, RequiredSource, ListType } from '../../types/planner';

/**
 * Material requirements for a specific list.
 */
export interface ProvenanceSource extends RequiredSource {
  impactedTargetItemIds: string[];
  isDirect?: boolean;
}

/**
 * Map of itemId to its provenance sources (which lists need it and how many).
 */
export type ProvenanceMap = Record<string, ProvenanceSource[]>;

/**
 * Dependency chain information.
 */
export interface DependencyChain {
  targetItemId: ItemId;
  ingredientItemId: ItemId;
  chainItemIds: ItemId[];
}

function getMergedRecipe(item: PlannerItem): Record<string, number> {
  const recipe: Record<string, number> = {};
  if (item.recipe) {
    for (const [id, qty] of Object.entries(item.recipe)) {
      recipe[id] = (recipe[id] || 0) + (qty as number);
    }
  }
  if (item.upgradeCost) {
    for (const [id, qty] of Object.entries(item.upgradeCost)) {
      recipe[id] = (recipe[id] || 0) + (qty as number);
    }
  }
  return recipe;
}

/**
 * Recursively walk the dependency tree and collect chains.
 */
export function walkDependencies(
  itemsMap: ItemsMap,
  targetId: ItemId,
  maxDepth = 20,
): DependencyChain[] {
  const chains: DependencyChain[] = [];
  const seenKeys = new Set<string>();

  const walk = (currentItemId: ItemId, path: ItemId[], depth: number, visited: Set<ItemId>) => {
    if (depth >= maxDepth) return;
    const item = itemsMap[currentItemId];
    if (!item) return;

    const recipe = getMergedRecipe(item);
    if (Object.keys(recipe).length === 0) return;

    const ingredientIds = Object.keys(recipe).sort();
    for (const ingredientId of ingredientIds) {
      if (visited.has(ingredientId)) continue;
      const chainItemIds = [...path, ingredientId];
      const key = `${targetId}|${chainItemIds.join('>')}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        chains.push({
          targetItemId: targetId,
          ingredientItemId: ingredientId,
          chainItemIds,
        });
      }

      const nextVisited = new Set(visited);
      nextVisited.add(ingredientId);
      walk(ingredientId, chainItemIds, depth + 1, nextVisited);
    }
  };

  walk(targetId, [targetId], 0, new Set([targetId]));
  return chains;
}

/**
 * Recursively calculate total material requirements and their provenance.
 */
export function calculateProvenance(
  itemsMap: ItemsMap,
  requiredSourcesByItemId: Record<string, RequiredSource[]>,
  deficits: Record<ItemId, Qty>,
  maxDepth = 20,
): ProvenanceMap {
  const provenance: ProvenanceMap = {};

  // Helper to add or merge provenance
  const addProvenance = (
    itemId: string,
    listId: string,
    listName: string,
    listType: ListType,
    quantity: number,
    targetIds: string[],
    isDirect = false,
  ) => {
    if (!provenance[itemId]) {
      provenance[itemId] = [];
    }
    const existing = provenance[itemId].find((s) => s.listId === listId);
    if (existing) {
      if (isDirect) {
        if (!existing.isDirect) {
          // Switching from support to direct: overwrite quantity and mark as direct
          existing.quantity = quantity;
          existing.isDirect = true;
        } else {
          // Already direct, accumulate direct quantity
          existing.quantity += quantity;
        }
      } else {
        // Adding support/recycle provenance
        if (!existing.isDirect) {
          // Still in support mode, accumulate support quantity
          existing.quantity += quantity;
        }
        // If it's already direct, we IGNORE support quantity to avoid unit mix
      }
      for (const tid of targetIds) {
        if (tid && !existing.impactedTargetItemIds.includes(tid)) {
          existing.impactedTargetItemIds.push(tid);
        }
      }
      existing.impactedTargetItemIds.sort();
    } else {
      provenance[itemId].push({
        listId,
        listName,
        listType,
        quantity,
        impactedTargetItemIds: [...new Set(targetIds.filter(Boolean))].sort(),
        isDirect,
      });
    }
  };

  // Recursive walk function
  const walkRecursive = (
    currId: ItemId,
    currQty: Qty,
    depth: number,
    visited: Set<ItemId>,
    listId: string,
    listName: string,
    listType: ListType,
    originalTargetId: ItemId,
  ) => {
    if (depth >= maxDepth || visited.has(currId)) return;
    const item = itemsMap[currId];
    if (!item) return;

    const recipe = getMergedRecipe(item);
    if (Object.keys(recipe).length === 0) return;

    const craftQuantity = item.craftQuantity || 1;
    const numCrafts = Math.ceil(currQty / craftQuantity);

    const nextVisited = new Set(visited);
    nextVisited.add(currId);

    const recipeEntries = Object.entries(recipe).sort(([a], [b]) => a.localeCompare(b));
    for (const [ingId, ingQty] of recipeEntries) {
      const totalIngQty = ingQty * numCrafts;
      addProvenance(ingId, listId, listName, listType, totalIngQty, [originalTargetId], false);
      walkRecursive(ingId, totalIngQty, depth + 1, nextVisited, listId, listName, listType, originalTargetId);
    }
  };

  // 1. Process direct targets and their dependencies
  const targetIds = Object.keys(requiredSourcesByItemId).sort();
  // First pass: just direct targets
  for (const targetId of targetIds) {
    const sources = requiredSourcesByItemId[targetId];
    for (const source of sources) {
      addProvenance(targetId, source.listId, source.listName, source.listType, source.quantity, [targetId], true);
    }
  }

  // Second pass: their dependencies
  for (const targetId of targetIds) {
    const sources = requiredSourcesByItemId[targetId];
    for (const source of sources) {
      walkRecursive(
        targetId,
        source.quantity,
        0,
        new Set(),
        source.listId,
        source.listName,
        source.listType,
        targetId,
      );
    }
  }

  // 2. Process recycle/salvage provenance
  // We only attach recycle/salvage provenance for yielded materials that are actually missing.
  // We iterate twice to handle items that recycle into other recycle sources (depth 2).
  const srcItemIds = Object.keys(itemsMap).sort();
  const alreadyProcessed = new Set<string>(); // key: pass|srcItemId|listId|yieldId

  for (let pass = 0; pass < 2; pass++) {
    for (const srcItemId of srcItemIds) {
      const item = itemsMap[srcItemId];
      const yields = { ...(item.recyclesInto || {}), ...(item.salvagesInto || {}) };

      for (const yieldId of Object.keys(yields).sort()) {
        if ((deficits[yieldId] ?? 0) > 0) {
          const yieldProvenance = provenance[yieldId];
          if (yieldProvenance) {
            for (const source of yieldProvenance) {
              // Ensure we don't process the same pass|srcItemId|listId|yieldId combination twice
              const key = `${pass}|${srcItemId}|${source.listId}|${yieldId}`;
              if (alreadyProcessed.has(key)) continue;
              alreadyProcessed.add(key);

              // If it's the second pass, only process if the yield itself was a recycle/salvage product
              // that gained provenance in the first pass. This is a bit complex, so we'll use a
              // simpler approach: just ensure we don't double count the EXACT SAME path twice
              // across BOTH passes.
              const globalKey = `${srcItemId}|${source.listId}|${yieldId}`;
              if (pass === 1 && alreadyProcessed.has(`0|${globalKey}`)) {
                continue;
              }

              addProvenance(
                srcItemId,
                source.listId,
                source.listName,
                source.listType,
                source.quantity,
                source.impactedTargetItemIds,
                false,
              );
            }
          }
        }
      }
    }
  }

  // Deterministic sorting of list sources
  for (const itemId of Object.keys(provenance)) {
    provenance[itemId].sort((a, b) => a.listId.localeCompare(b.listId));
  }

  return provenance;
}
