import type { Item, ItemsMap, ItemRarity } from '../types/item';
import type { AppLocale } from '../../../shared/i18n/config';
import type { RawItemsOutput } from '../../../shared/types/item';
import { fetchLocalizedJson } from '../../../shared/utils/localizedContent';

/**
 * Consolidates weapon tiers by combining materials from all tiers (I-IV)
 * Returns a new item representing the highest tier version with consolidated recipe
 */
function consolidateWeaponTiers(items: Item[]): Item[] {
  const weaponGroups = new Map<string, Item[]>();
  const nonWeapons: Item[] = [];

  // Group weapons by weaponBaseId
  items.forEach((item) => {
    if (item.isWeapon && item.weaponBaseId !== undefined) {
      if (!weaponGroups.has(item.weaponBaseId)) {
        weaponGroups.set(item.weaponBaseId, []);
      }
      weaponGroups.get(item.weaponBaseId)!.push(item);
    } else {
      nonWeapons.push(item);
    }
  });

  const consolidatedWeapons: Item[] = [];

  weaponGroups.forEach((tiers) => {
    // Sort by weaponTier
    tiers.sort((a, b) => (a.weaponTier || 0) - (b.weaponTier || 0));

    // Find highest tier
    const highestTier = tiers.find((t) => t.weaponTier === 4) || tiers[tiers.length - 1];

    if (!highestTier) return;

    // Accumulate all materials from all tiers
    const consolidatedRecipe: Record<string, number> = {};

    tiers.forEach((tier) => {
      if (tier.recipe) {
        Object.entries(tier.recipe).forEach(([materialId, qty]) => {
          consolidatedRecipe[materialId] = (consolidatedRecipe[materialId] || 0) + qty;
        });
      }

      if (tier.upgradeCost) {
        Object.entries(tier.upgradeCost).forEach(([materialId, qty]) => {
          consolidatedRecipe[materialId] = (consolidatedRecipe[materialId] || 0) + qty;
        });
      }
    });

    const consolidatedItem: Item = {
      ...highestTier,
      recipe: consolidatedRecipe,
    };

    consolidatedWeapons.push(consolidatedItem);
  });

  return [...nonWeapons, ...consolidatedWeapons];
}

function normalizeFoundIn(foundIn: string | string[] | undefined): string[] | undefined {
  if (!foundIn) return undefined;
  if (typeof foundIn === 'string') {
    return foundIn.split(',').map(s => s.trim()).filter(Boolean);
  }
  return foundIn.length > 0 ? foundIn : undefined;
}

function normalizeCraftBench(craftBench: string | string[] | undefined): string | undefined {
  if (!craftBench) return undefined;
  if (typeof craftBench === 'string') return craftBench;
  const filtered = craftBench.filter(b => b !== 'in_raid' && b !== 'workbench');
  return filtered[0] ?? undefined;
}

export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const data = await fetchLocalizedJson<RawItemsOutput>('/data/items/items.json', locale);

  const items: Item[] = Object.entries(data.items).map(([id, raw]) => ({
    id,
    name: { en: raw.name.value },
    originalNameEn: raw.name.originalEn,
    description: raw.description,
    type: raw.type,
    rarity: raw.rarity as ItemRarity,
    imageFilename: raw.imageFilename,
    value: raw.value,
    weightKg: raw.weightKg,
    stackSize: raw.stackSize,
    foundIn: normalizeFoundIn(raw.foundIn),
    recipe: raw.recipe,
    recyclesInto: raw.recyclesInto,
    salvagesInto: raw.salvagesInto,
    upgradeCost: raw.upgradeCost,
    isWeapon: raw.isWeapon,
    craftBench: normalizeCraftBench(raw.craftBench),
    stationLevelRequired: raw.stationLevelRequired,
    blueprintLocked: raw.blueprintLocked,
    weaponBaseId: raw.weaponBaseId,
    weaponTier: raw.weaponTier,
  }));

  const consolidatedItems = consolidateWeaponTiers(items);

  const itemsMap: ItemsMap = {};
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
