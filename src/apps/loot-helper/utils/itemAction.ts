import type { ReverseMap } from './craftingChain';

export type ItemAction = 'keep' | 'salvage' | 'recycle' | null;

/**
 * Determines the recommended action for a loot item based on its usage relationships
 * 
 * Logic:
 * - If used in any recipe directly -> 'keep'
 * - If only salvages into materials -> 'salvage'
 * - If only recycles into materials -> 'recycle'
 * - If both salvage and recycle exist -> choose based on which achieves more goals
 *   (ties prefer salvage)
 */
export function getItemAction(itemId: string, reverseMap: ReverseMap): ItemAction {
  const usages = reverseMap.get(itemId);
  
  if (!usages || usages.length === 0) {
    return null;
  }

  // Check if item is used in any recipe
  const hasRecipeUsage = usages.some(usage => usage.relationship === 'recipe');
  if (hasRecipeUsage) {
    return 'keep';
  }

  // Separate salvage and recycle usages
  const salvageUsages = usages.filter(usage => usage.relationship === 'salvage');
  const recycleUsages = usages.filter(usage => usage.relationship === 'recycle');

  const hasSalvage = salvageUsages.length > 0;
  const hasRecycle = recycleUsages.length > 0;

  // Only salvage
  if (hasSalvage && !hasRecycle) {
    return 'salvage';
  }

  // Only recycle
  if (hasRecycle && !hasSalvage) {
    return 'recycle';
  }

  // Both salvage and recycle - count unique goals for each
  if (hasSalvage && hasRecycle) {
    const salvageGoals = new Set(
      salvageUsages.flatMap(usage => usage.goalItemIds)
    );
    const recycleGoals = new Set(
      recycleUsages.flatMap(usage => usage.goalItemIds)
    );

    if (salvageGoals.size > recycleGoals.size) {
      return 'salvage';
    } else if (recycleGoals.size > salvageGoals.size) {
      return 'recycle';
    } else {
      // Tied - prefer salvage
      return 'salvage';
    }
  }

  return null;
}
