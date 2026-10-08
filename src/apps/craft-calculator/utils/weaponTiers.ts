import type { Item, ItemRecipe } from '../types/item';
import { getItem, getTierChain } from './itemData';

export interface UpgradeBreakdown {
  tier: number;
  itemId: string;
  itemName: string;
  materials: ItemRecipe;
}

/**
 * Check if an item is craftable (has recipe or is an upgrade tier whose chain base has a recipe)
 */
export function isCraftableItem(item: Item): boolean {
  if (item.recipe && Object.keys(item.recipe).length > 0) {
    return true;
  }

  if (item.upgradeCost && Object.keys(item.upgradeCost).length > 0 && item.baseId) {
    const baseWeapon = getItem(item.baseId);
    return !!(baseWeapon?.recipe && Object.keys(baseWeapon.recipe).length > 0);
  }

  return false;
}

/**
 * Add materials from one recipe to another (mutates target)
 */
function addMaterials(target: ItemRecipe, source: ItemRecipe): void {
  for (const [materialId, amount] of Object.entries(source)) {
    target[materialId] = (target[materialId] || 0) + amount;
  }
}

/**
 * Calculate total materials needed to craft an item including all upgrades
 * For base weapons (tier I): returns the recipe
 * For upgraded weapons (tier II+): returns base recipe + sum of all upgrade costs
 */
export function calculateTotalMaterials(item: Item): ItemRecipe {
  // If item has direct recipe, return it
  if (item.recipe) {
    return { ...item.recipe };
  }

  // Item must have upgradeCost - calculate from base weapon
  if (!item.upgradeCost) {
    return {};
  }

  const targetTier = item.tier ?? 0;
  if (targetTier <= 1 || !item.baseId) {
    return {};
  }

  const baseWeapon = getItem(item.baseId);
  const chain = getTierChain(item.baseId);

  if (!baseWeapon?.recipe) {
    return {};
  }

  // Start with base recipe
  const totalMaterials: ItemRecipe = { ...baseWeapon.recipe };

  // Add upgrade costs from tier II up to target tier
  for (let tier = 2; tier <= targetTier; tier++) {
    const tieredWeapon = chain.get(tier);

    if (tieredWeapon?.upgradeCost) {
      addMaterials(totalMaterials, tieredWeapon.upgradeCost);
    }
  }

  return totalMaterials;
}

/**
 * Get detailed breakdown of materials by tier
 */
export function getUpgradeBreakdown(item: Item): UpgradeBreakdown[] {
  const breakdown: UpgradeBreakdown[] = [];

  // If item has direct recipe only, return just that
  if (item.recipe && !item.upgradeCost) {
    breakdown.push({
      tier: 1,
      itemId: item.id,
      itemName: item.name,
      materials: item.recipe,
    });
    return breakdown;
  }

  // Item must be an upgraded weapon
  if (!item.upgradeCost) {
    return breakdown;
  }

  const targetTier = item.tier ?? 0;
  if (targetTier <= 1 || !item.baseId) {
    return breakdown;
  }

  const baseWeapon = getItem(item.baseId);
  const chain = getTierChain(item.baseId);

  if (!baseWeapon?.recipe) {
    return breakdown;
  }

  // Add base weapon (tier I)
  breakdown.push({
    tier: 1,
    itemId: baseWeapon.id,
    itemName: baseWeapon.name,
    materials: baseWeapon.recipe,
  });

  // Add each upgrade tier
  for (let tier = 2; tier <= targetTier; tier++) {
    const tieredWeapon = chain.get(tier);

    if (tieredWeapon?.upgradeCost) {
      breakdown.push({
        tier,
        itemId: tieredWeapon.id,
        itemName: tieredWeapon.name,
        materials: tieredWeapon.upgradeCost,
      });
    }
  }

  return breakdown;
}
