import type { AppLocale } from '../../../shared/i18n/config';
import { fetchLocalizedJson } from '../../../shared/utils/localizedContent';
import type { RawItemsOutput } from '../../../shared/types/item';
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
      const data = await fetchLocalizedJson<RawItemsOutput>(
        '/data/items/items.json',
        locale
      );
      const items: ItemDatabase = Object.fromEntries(
        Object.entries(data.items).map(([itemId, raw]) => [
          itemId,
          {
            id: itemId,
            name: raw.name.value,
            originalNameEn: raw.name.originalEn,
            stackSize: raw.stackSize,
            value: raw.value,
            imageFilename: raw.imageFilename,
            isWeapon: raw.isWeapon,
            recipe: raw.recipe,
            upgradeCost: raw.upgradeCost,
            craftQuantity: raw.craftQuantity,
            rarity: raw.rarity,
          },
        ])
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
