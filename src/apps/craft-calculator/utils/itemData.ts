import type { Item, ItemDatabase } from '../types/item';

let itemDatabase: ItemDatabase | null = null;
let loadingPromise: Promise<ItemDatabase> | null = null;

/**
 * Load all items from the data directory
 */
export async function loadItems(): Promise<ItemDatabase> {
  if (itemDatabase) {
    return itemDatabase;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const response = await fetch('/items.json');
      if (!response.ok) {
        throw new Error('Failed to load items database');
      }

      const items: ItemDatabase = await response.json();
      itemDatabase = items;
      return items;
    } catch (error) {
      console.error('Error loading items:', error);
      throw error;
    }
  })();

  return loadingPromise;
}

/**
 * Get a specific item by ID
 */
export function getItem(itemId: string): Item | undefined {
  return itemDatabase?.[itemId];
}

/**
 * Search items by name (supports partial matching)
 */
export function searchItems(query: string, limit = 20): Item[] {
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
  return itemDatabase !== null;
}
