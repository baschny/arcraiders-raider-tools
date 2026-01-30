import type { Item, ItemRecipe } from '../types/item';
import { getItem } from './itemData';

export interface UpgradeBreakdown {
  tier: number;
  itemId: string;
  itemName: string;
  materials: ItemRecipe;
}

const TIER_SUFFIXES = ['_i', '_ii', '_iii', '_iv'];

/**
 * Extract the base weapon name without tier suffix
 * e.g., "torrente_iv" -> "torrente"
 */
function getBaseWeaponName(itemId: string): string {
  for (const suffix of TIER_SUFFIXES) {
    if (itemId.endsWith(suffix)) {
      return itemId.slice(0, -suffix.length);
    }
  }
  return itemId;
}

/**
 * Get the tier number from an item ID
 * e.g., "torrente_iv" -> 4, "torrente_i" -> 1
 */
export function getTierNumber(itemId: string): number {
  if (itemId.endsWith('_iv')) return 4;
  if (itemId.endsWith('_iii')) return 3;
  if (itemId.endsWith('_ii')) return 2;
  if (itemId.endsWith('_i')) return 1;
  return 0;
}

/**
 * Get the base weapon ID (tier I version)
 * e.g., "torrente_iv" -> "torrente_i"
 */
export function getBaseWeaponId(itemId: string): string {
  const baseName = getBaseWeaponName(itemId);
  return `${baseName}_i`;
}

/**
 * Check if an item is craftable (has recipe or has upgradeCost with valid base weapon)
 */
export function isCraftableItem(item: Item): boolean {
  // Has direct recipe
  if (item.recipe && Object.keys(item.recipe).length > 0) {
    return true;
  }

  // Has upgradeCost - check if base weapon exists and has recipe
  if (item.upgradeCost && Object.keys(item.upgradeCost).length > 0) {
    const baseWeaponId = getBaseWeaponId(item.id);
    const baseWeapon = getItem(baseWeaponId);
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

  const targetTier = getTierNumber(item.id);
  if (targetTier <= 1) {
    return {};
  }

  const baseName = getBaseWeaponName(item.id);
  const baseWeaponId = `${baseName}_i`;
  const baseWeapon = getItem(baseWeaponId);

  if (!baseWeapon?.recipe) {
    return {};
  }

  // Start with base recipe
  const totalMaterials: ItemRecipe = { ...baseWeapon.recipe };

  // Add upgrade costs from tier II up to target tier
  for (let tier = 2; tier <= targetTier; tier++) {
    const tierSuffix = TIER_SUFFIXES[tier - 1];
    const tieredWeaponId = `${baseName}${tierSuffix}`;
    const tieredWeapon = getItem(tieredWeaponId);

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

  const targetTier = getTierNumber(item.id);
  if (targetTier <= 1) {
    return breakdown;
  }

  const baseName = getBaseWeaponName(item.id);
  const baseWeaponId = `${baseName}_i`;
  const baseWeapon = getItem(baseWeaponId);

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
    const tierSuffix = TIER_SUFFIXES[tier - 1];
    const tieredWeaponId = `${baseName}${tierSuffix}`;
    const tieredWeapon = getItem(tieredWeaponId);

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
