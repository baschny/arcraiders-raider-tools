import type { AppLocale } from '../../../shared/i18n/config';
import { loadItemCatalog } from '../../../shared/gamedata/catalog';
import type { Item, ItemDatabase } from '../types/item';

const itemDatabases = new Map<AppLocale, ItemDatabase>();
const loadingPromises = new Map<AppLocale, Promise<ItemDatabase>>();
let activeLocale: AppLocale = 'en';

/**
 * Load all items from the data directory
 */
export async function loadItems(locale: AppLocale): Promise<ItemDatabase> {
  activeLocale = locale;

  const cached = itemDatabases.get(locale);
  if (cached) {
    return cached;
  }

  const loadingPromise = loadingPromises.get(locale);
  if (loadingPromise) {
    return loadingPromise;
  }

  const nextPromise = (async () => {
    try {
      const catalog = await loadItemCatalog(locale);
      // Catalog `upgradeCost` is the cost to the NEXT tier; the app wants the cost to REACH an item.
      const items: ItemDatabase = Object.fromEntries(
        Object.values(catalog.items).map((c) => {
          const previous = c.upgradesFrom ? catalog.items[c.upgradesFrom] : undefined;
          const item: Item = {
            id: c.id,
            name: c.name,
            originalNameEn: c.nameEn,
            stackSize: c.stackSize,
            value: c.value,
            imageFilename: c.icon,
            isWeapon: c.isWeapon,
            recipe: c.recipe,
            upgradeCost: previous?.upgradeCost,
            craftQuantity: c.craftQuantity,
            rarity: c.rarity,
            baseId: c.baseId,
            tier: c.tier,
          };
          return [c.id, item];
        })
      );
      itemDatabases.set(locale, items);
      return items;
    } catch (error) {
      console.error('Error loading items:', error);
      throw error;
    } finally {
      loadingPromises.delete(locale);
    }
  })();

  loadingPromises.set(locale, nextPromise);

  return nextPromise;
}

/**
 * Get a specific item by ID
 */
export function getItem(itemId: string): Item | undefined {
  return itemDatabases.get(activeLocale)?.[itemId];
}

/**
 * Search items by name (supports partial matching)
 */
export function searchItems(query: string, limit = 20): Item[] {
  const itemDatabase = itemDatabases.get(activeLocale);
  if (!itemDatabase) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const items = Object.values(itemDatabase);

  return items
    .filter((item) => item.name.toLowerCase().includes(lowerQuery))
    .sort((a, b) => {
      // Prioritize items that start with the query
      const aStarts = a.name.toLowerCase().startsWith(lowerQuery);
      const bStarts = b.name.toLowerCase().startsWith(lowerQuery);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/**
 * Get all craftable items (items with recipes)
 */
export function getCraftableItems(): Item[] {
  const itemDatabase = itemDatabases.get(activeLocale);
  if (!itemDatabase) {
    return [];
  }

  return Object.values(itemDatabase)
    .filter((item) => item.recipe && Object.keys(item.recipe).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Check if database is loaded
 */
export function isLoaded(): boolean {
  return itemDatabases.has(activeLocale);
}

/**
 * Weapon tier chain for a base id: tier number -> item (explicit catalog baseId/tier).
 */
export function getTierChain(baseId: string): Map<number, Item> {
  const chain = new Map<number, Item>();
  const itemDatabase = itemDatabases.get(activeLocale);
  if (!itemDatabase) return chain;
  for (const item of Object.values(itemDatabase)) {
    if (item.baseId === baseId && item.tier) chain.set(item.tier, item);
  }
  return chain;
}
