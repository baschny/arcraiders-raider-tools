/**
 * Data Loader for Quartermaster
 * Loads and transforms item data from public/data/quartermaster/items.json
 */

import type { PlannerItem, ItemsMap, ItemsData } from '../types/item';
import type { HideoutModuleDefinition } from '../types/hideout';

const ITEMS_URL = '/data/quartermaster/items.json';
const HIDEOUT_URL = '/data/quartermaster/hideout.json';

/**
 * Load all items from the generated JSON file
 * Transforms the stored format into ItemsMap with id property included
 */
export async function loadAllItems(): Promise<ItemsMap> {
  const response = await fetch(ITEMS_URL);
  
  if (!response.ok) {
    throw new Error(`Failed to load items: ${response.status} ${response.statusText}`);
  }

  const data: ItemsData = await response.json();
  
  // Transform items to include id property
  const itemsMap: ItemsMap = {};
  for (const [id, item] of Object.entries(data.items)) {
    itemsMap[id] = {
      ...item,
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
export async function loadHideoutDefinitions(): Promise<HideoutModuleDefinition[]> {
  const response = await fetch(HIDEOUT_URL);

  if (!response.ok) {
    throw new Error(`Failed to load hideout definitions: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<HideoutModuleDefinition[]>;
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
