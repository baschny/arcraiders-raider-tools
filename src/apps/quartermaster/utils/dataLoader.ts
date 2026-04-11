/**
 * Data Loader for Quartermaster
 * Loads and transforms item data from public/data/quartermaster/items.json
 */

import type { AppLocale } from '../../../shared/i18n/config';
import { fetchLocalizedJson } from '../../../shared/utils/localizedContent';
import type { PlannerItem, ItemsMap, LocalizedItemsData } from '../types/item';
import type { HideoutModuleDefinition, LocalizedHideoutModuleDefinition } from '../types/hideout';

const ITEMS_URL = '/data/quartermaster/items.json';
const HIDEOUT_URL = '/data/quartermaster/hideout.json';

/**
 * Load all items from the generated JSON file
 * Transforms the stored format into ItemsMap with id property included
 */
export async function loadAllItems(locale: AppLocale): Promise<ItemsMap> {
  const data = await fetchLocalizedJson<LocalizedItemsData>(ITEMS_URL, locale);
  
  // Transform items to include id property
  const itemsMap: ItemsMap = {};
  for (const [id, item] of Object.entries(data.items)) {
    itemsMap[id] = {
      ...item,
      name: item.name.value,
      originalNameEn: item.name.originalEn,
      id,
    } as PlannerItem;
  }

  return itemsMap;
}

/**
 * Get an item by ID from the items map
 * Returns undefined if item doesn't exist
 */
export function getItem(itemsMap: ItemsMap, itemId: string): PlannerItem | undefined {
  return itemsMap[itemId];
}

/**
 * Check if an item ID exists in the items map
 */
export function itemExists(itemsMap: ItemsMap, itemId: string): boolean {
  return itemId in itemsMap;
}

/**
 * Get all item IDs sorted alphabetically
 */
export function getAllItemIds(itemsMap: ItemsMap): string[] {
  return Object.keys(itemsMap).sort();
}

/**
 * Filter items by category
 */
export function getItemsByCategory(itemsMap: ItemsMap, category: string): PlannerItem[] {
  return Object.values(itemsMap)
    .filter(item => item.category === category)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Load hideout module definitions from the generated JSON file
 */
export async function loadHideoutDefinitions(locale: AppLocale): Promise<HideoutModuleDefinition[]> {
  const definitions = await fetchLocalizedJson<LocalizedHideoutModuleDefinition[]>(
    HIDEOUT_URL,
    locale
  );

  return definitions.map((definition) => ({
    ...definition,
    name: definition.name.value,
    originalNameEn: definition.name.originalEn,
  }));
}

/**
 * Search items by name (case-insensitive)
 */
export function searchItems(itemsMap: ItemsMap, query: string): PlannerItem[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(itemsMap)
    .filter(item => item.name.toLowerCase().includes(lowerQuery))
    .sort((a, b) => a.name.localeCompare(b.name));
}
