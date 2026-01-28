import type { ItemsMap } from '../types/item';

export interface CraftingNode {
  itemId: string;
  quantity: number;
  children: CraftingNode[];
  salvageableFrom?: { itemId: string; method: 'salvage' | 'recycle' }[]; // Items and their method
}

export interface CraftingTree {
  goalItemId: string;
  root: CraftingNode;
}

export interface UsageInfo {
  parentItemId: string;
  quantity: number;
  relationship: 'recipe' | 'salvage' | 'recycle';
  goalItemIds: string[];
}

export type ReverseMap = Map<string, UsageInfo[]>;

/**
 * Builds a crafting tree for a goal item, resolving all recipe dependencies
 * and including salvageable sources
 */
export function buildCraftingTree(
  goalItemId: string,
  itemsMap: ItemsMap,
  goalItemIds: string[],
  stashItemIds: Set<string> = new Set()
): CraftingTree {
  const visited = new Set<string>();
  
  function buildNode(itemId: string, quantity: number, depth: number = 0): CraftingNode {
    const item = itemsMap[itemId];
    if (!item) {
      console.warn(`Item not found: ${itemId}`);
      return { itemId, quantity, children: [] };
    }

    // If item is in stash, treat it as a leaf node (we already have it)
    if (stashItemIds.has(itemId)) {
      return { itemId, quantity, children: [] };
    }

    // Avoid infinite recursion
    const visitKey = `${itemId}-${depth}`;
    if (depth > 10 || visited.has(visitKey)) {
      return { itemId, quantity, children: [] };
    }
    visited.add(visitKey);

    const node: CraftingNode = {
      itemId,
      quantity,
      children: [],
    };

    // If item has a recipe, expand it
    if (item.recipe) {
      for (const [ingredientId, ingredientQty] of Object.entries(item.recipe)) {
        const totalNeeded = ingredientQty * quantity;
        const childNode = buildNode(ingredientId, totalNeeded, depth + 1);
        node.children.push(childNode);

        // Find salvageable sources for this ingredient
        const salvageableSources = findSalvageableSources(
          ingredientId,
          itemsMap,
          goalItemIds,
          stashItemIds
        );
        if (salvageableSources.length > 0) {
          childNode.salvageableFrom = salvageableSources;
        }
      }
    }

    return node;
  }

  const root = buildNode(goalItemId, 1);
  return { goalItemId, root };
}

/**
 * Find items that can be salvaged/recycled to produce the target material
 * Excludes Basic Materials, goal items, weapons, modifications, and stash items
 */
function findSalvageableSources(
  targetMaterialId: string,
  itemsMap: ItemsMap,
  goalItemIds: string[],
  stashItemIds: Set<string> = new Set()
): { itemId: string; method: 'salvage' | 'recycle' }[] {
  const sources: { itemId: string; method: 'salvage' | 'recycle' }[] = [];
  
  // Check if the target material is a Basic Material
  const targetItem = itemsMap[targetMaterialId];
  if (targetItem && targetItem.type === 'Basic Material') {
    // Don't show salvageable sources for Basic Materials
    return sources;
  }

  for (const item of Object.values(itemsMap)) {
    // Skip if this item is a Basic Material
    if (item.type === 'Basic Material') {
      continue;
    }

    // Skip if this item is in the goal items list
    if (goalItemIds.includes(item.id)) {
      continue;
    }
    
    // Skip if this item is in the stash
    if (stashItemIds.has(item.id)) {
      continue;
    }
    
    // Skip weapons and modifications
    if (item.isWeapon || item.type === 'Modification') {
      continue;
    }

    // Check if this item salvages OR recycles into the target material
    const canSalvage = item.salvagesInto && item.salvagesInto[targetMaterialId];
    const canRecycle = item.recyclesInto && item.recyclesInto[targetMaterialId];
    
    if (canSalvage) {
      sources.push({ itemId: item.id, method: 'salvage' });
    } else if (canRecycle) {
      sources.push({ itemId: item.id, method: 'recycle' });
    }
  }

  return sources;
}

/**
 * Flattens a crafting tree into a list of all required materials
 * with their total quantities
 */
export function flattenCraftingTree(tree: CraftingTree): Map<string, number> {
  const materials = new Map<string, number>();

  function traverse(node: CraftingNode) {
    // If node has no children (leaf node), it's a base material
    if (node.children.length === 0) {
      const current = materials.get(node.itemId) || 0;
      materials.set(node.itemId, current + node.quantity);
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree.root);
  return materials;
}

/**
 * Combines multiple crafting trees, aggregating common materials
 */
export function combineCraftingTrees(trees: CraftingTree[]): Map<string, number> {
  const combinedMaterials = new Map<string, number>();

  for (const tree of trees) {
    const treeMaterials = flattenCraftingTree(tree);
    for (const [itemId, quantity] of treeMaterials.entries()) {
      const current = combinedMaterials.get(itemId) || 0;
      combinedMaterials.set(itemId, current + quantity);
    }
  }

  return combinedMaterials;
}

/**
 * Builds a reverse lookup map showing what each item is used for
 * Maps itemId -> array of usage info (what items use it and how)
 */
export function buildReverseMap(
  trees: CraftingTree[],
  _itemsMap: ItemsMap,
  stashItemIds: Set<string> = new Set()
): ReverseMap {
  const reverseMap: ReverseMap = new Map();
  const itemsUsedInRecipes = new Set<string>(); // Track items used directly in recipes

  function addUsage(
    itemId: string,
    parentItemId: string,
    quantity: number,
    relationship: 'recipe' | 'salvage' | 'recycle',
    goalItemId: string
  ) {
    // Skip items in stash
    if (stashItemIds.has(itemId)) {
      return;
    }

    if (!reverseMap.has(itemId)) {
      reverseMap.set(itemId, []);
    }
    
    const usages = reverseMap.get(itemId)!;
    
    // Check if we already have a usage entry for this parent
    const existing = usages.find(
      (u) => u.parentItemId === parentItemId && u.relationship === relationship
    );
    
    if (existing) {
      // Add goal item if not already present
      if (!existing.goalItemIds.includes(goalItemId)) {
        existing.goalItemIds.push(goalItemId);
      }
      // Update quantity (use max to show worst case)
      existing.quantity = Math.max(existing.quantity, quantity);
    } else {
      // Add new usage entry
      usages.push({
        parentItemId,
        quantity,
        relationship,
        goalItemIds: [goalItemId],
      });
    }
  }

  // First pass: collect all items used directly in recipes
  trees.forEach((tree) => {
    function collectRecipeItems(node: CraftingNode) {
      itemsUsedInRecipes.add(node.itemId);
      node.children.forEach((child) => collectRecipeItems(child));
    }
    collectRecipeItems(tree.root);
  });

  // Second pass: build reverse map
  trees.forEach((tree) => {
    const goalItemId = tree.goalItemId;

    function traverse(node: CraftingNode, parentNode?: CraftingNode) {
      // If this node has a parent, record the usage
      if (parentNode) {
        addUsage(node.itemId, parentNode.itemId, node.quantity, 'recipe', goalItemId);
      }

      // Process salvageable sources
      // But skip if the salvageable item itself is used directly in recipes
      if (node.salvageableFrom) {
        node.salvageableFrom.forEach(({ itemId: salvageItemId, method }) => {
          // Only add if the salvageable item is NOT used directly in any recipe
          if (!itemsUsedInRecipes.has(salvageItemId)) {
            addUsage(salvageItemId, node.itemId, 1, method, goalItemId);
          }
        });
      }

      // Traverse children
      node.children.forEach((child) => traverse(child, node));
    }

    traverse(tree.root);
  });

  // Third pass: remove orphaned items
  // An item is orphaned if ALL its parent items are stashed (not just in stash, but actually stashed)
  // AND the item itself is not directly used in any active crafting path
  let hasChanges = true;
  while (hasChanges) {
    hasChanges = false;
    const itemsToRemove: string[] = [];

    for (const [itemId, usages] of reverseMap.entries()) {
      // An item should be removed if ALL of its parent items are stashed
      // This means there's no valid path to any goal item
      const allParentsStashed = usages.length > 0 && usages.every((usage) => {
        return stashItemIds.has(usage.parentItemId);
      });

      if (allParentsStashed) {
        itemsToRemove.push(itemId);
        hasChanges = true;
      }
    }

    // Remove orphaned items
    for (const itemId of itemsToRemove) {
      reverseMap.delete(itemId);
    }
  }

  return reverseMap;
}
