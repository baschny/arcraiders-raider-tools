import type { Item, ItemsMap, ItemRarity } from '../types/item';

/**
 * Consolidates weapon tiers by combining materials from all tiers (I-IV)
 * Returns a new item representing the Tier IV version with consolidated recipe
 */
function consolidateWeaponTiers(items: Item[]): Item[] {
  const weaponGroups = new Map<string, Item[]>();
  const nonWeapons: Item[] = [];

  // Group weapons by base name (without tier suffix)
  items.forEach((item) => {
    if (item.isWeapon && item.tier !== undefined) {
      // Extract base name by removing tier suffix (I, II, III, IV)
      const baseName = item.name.en.replace(/\s+(I{1,3}|IV)$/, '');
      if (!weaponGroups.has(baseName)) {
        weaponGroups.set(baseName, []);
      }
      weaponGroups.get(baseName)!.push(item);
    } else {
      nonWeapons.push(item);
    }
  });

  const consolidatedWeapons: Item[] = [];

  // For each weapon group, create a consolidated Tier IV item
  weaponGroups.forEach((tiers) => {
    // Sort by tier
    tiers.sort((a, b) => (a.tier || 0) - (b.tier || 0));

    // Find Tier IV (or highest tier)
    const tierIV = tiers.find((t) => t.tier === 4) || tiers[tiers.length - 1];

    if (!tierIV) return;

    // Accumulate all materials from all tiers
    const consolidatedRecipe: Record<string, number> = {};

    tiers.forEach((tier) => {
      // Add recipe materials (for Tier I)
      if (tier.recipe) {
        Object.entries(tier.recipe).forEach(([materialId, qty]) => {
          consolidatedRecipe[materialId] = (consolidatedRecipe[materialId] || 0) + qty;
        });
      }

      // Add upgrade cost materials (for Tier II-IV)
      if (tier.upgradeCost) {
        Object.entries(tier.upgradeCost).forEach(([materialId, qty]) => {
          consolidatedRecipe[materialId] = (consolidatedRecipe[materialId] || 0) + qty;
        });
      }
    });

    // Create consolidated item based on Tier IV
    const consolidatedItem: Item = {
      ...tierIV,
      recipe: consolidatedRecipe,
      // Keep Tier IV's other properties
    };

    consolidatedWeapons.push(consolidatedItem);
  });

  return [...nonWeapons, ...consolidatedWeapons];
}

export async function loadAllItems(): Promise<ItemsMap> {
  const response = await fetch('/data/items-loot-helper.json');
  if (!response.ok) {
    throw new Error('Failed to load items');
  }
  
  const items: Item[] = await response.json();
  
  // Consolidate weapon tiers
  const consolidatedItems = consolidateWeaponTiers(items);
  
  const itemsMap: ItemsMap = {};

  // Build the map
  consolidatedItems.forEach((item) => {
    itemsMap[item.id] = item;
  });

  return itemsMap;
}

export function getRarityClass(rarity: ItemRarity): string {
  return `rarity-${rarity.toLowerCase()}`;
}

export function getLocationIcon(location: string): string | null {
  const iconMap: Record<string, string> = {
    'ARC': 'arc.webp',
    'Commercial': 'commercial.webp',
    'Electrical': 'electrical.webp',
    'Exodus': 'exodus.webp',
    'Industrial': 'industrial.webp',
    'Mechanical': 'mechanical.webp',
    'Medical': 'medical.webp',
    'Old World': 'old_world.webp',
    'Raider': 'raider.webp',
    'Residential': 'residential.webp',
    'Security': 'security.webp',
    'Technological': 'technological.webp',
  };
  return iconMap[location] || null;
}
