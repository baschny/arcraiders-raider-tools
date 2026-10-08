import type { Item, ItemsMap, ItemRarity } from '../types/item';
import type { AppLocale } from '../../../shared/i18n/config';
import { loadItemCatalog, type CatalogClassification, type ItemCatalog } from '../../../shared/gamedata/catalog';

/**
 * Consolidates weapon tiers by combining materials from all tiers (I-IV)
 * Returns a new item representing the highest tier version with consolidated recipe
 */
export function consolidateWeaponTiers(items: Item[]): Item[] {
  const weaponGroups = new Map<string, Item[]>();
  const nonWeapons: Item[] = [];

  // Group weapons by baseId (carried as weaponBaseId)
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

/**
 * Maps the catalog to the loot-helper item shape. Catalog `upgradeCost` is the cost of the NEXT
 * tier, the app expects the cost to REACH an item, so it is taken from the previous tier.
 */
export function catalogToItems(catalog: ItemCatalog): Item[] {
  return Object.values(catalog.items).map((c) => {
    const previous = c.upgradesFrom ? catalog.items[c.upgradesFrom] : undefined;
    return {
      id: c.id,
      name: { en: c.name },
      originalNameEn: c.nameEn,
      description: c.description,
      category: c.category,
      group: c.group,
      subgroup: c.subgroup,
      categoryName: c.categoryName,
      rarity: c.rarity,
      imageFilename: c.icon,
      value: c.value,
      weightKg: c.weightKg,
      stackSize: c.stackSize,
      foundIn: c.foundIn?.length ? c.foundIn : undefined,
      foundInNames: c.foundIn?.length ? c.foundInNames : undefined,
      effects: c.effects,
      recipe: c.recipe,
      recyclesInto: c.recyclesInto,
      salvagesInto: c.salvagesInto,
      upgradeCost: previous?.upgradeCost,
      isWeapon: c.isWeapon,
      craftBench: c.craftBench,
      stationLevelRequired: c.stationLevelRequired,
      blueprintLocked: c.blueprintLocked,
      weaponBaseId: c.isWeapon ? c.baseId : undefined,
      weaponTier: c.isWeapon ? (c.tier as Item['weaponTier']) : undefined,
    };
  });
}

export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const catalog = await loadItemCatalog(locale);
  const itemsMap: ItemsMap = {};
  consolidateWeaponTiers(catalogToItems(catalog)).forEach((item) => {
    itemsMap[item.id] = item;
  });
  return itemsMap;
}

/** Game classification of the locale (groups in stash tab order, rarities, names) for the filters. */
export async function loadClassification(locale: AppLocale): Promise<CatalogClassification> {
  return (await loadItemCatalog(locale)).classification;
}

export function getRarityClass(rarity: ItemRarity | undefined): string {
  return rarity ? `rarity-${rarity.toLowerCase()}` : '';
}
