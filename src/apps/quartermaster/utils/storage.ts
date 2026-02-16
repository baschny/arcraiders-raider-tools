/**
 * Storage Utilities for Quartermaster
 * Handles localStorage persistence for loadouts
 * See specification section 7.1.3
 */

import type { StoredLoadout } from '../types/loadout';
import type { ItemsMap } from '../types/item';
import { LOADOUT_SCHEMA_VERSION } from '../types/loadout';

const STORAGE_KEY = 'quartermaster_loadouts';

/**
 * Generate a unique ID for a new loadout
 */
export function generateLoadoutId(): string {
  return `loadout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Load all stored loadouts from localStorage
 * Applies migration and validation rules from spec
 */
export function loadStoredLoadouts(itemsMap: ItemsMap): StoredLoadout[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Process each loadout with migration and validation
    const loadouts: StoredLoadout[] = [];
    
    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }

      // Migration: set schemaVersion if missing
      const schemaVersion = raw.schemaVersion ?? 1;

      // Validate required fields
      if (!raw.id || !raw.name) {
        continue;
      }

      // Filter out unknown item IDs
      const validItems = Array.isArray(raw.items)
        ? raw.items.filter((item: { itemId?: string }) => 
            item?.itemId && itemsMap[item.itemId]
          )
        : [];

      loadouts.push({
        schemaVersion,
        id: raw.id,
        name: raw.name,
        isEnabled: raw.isEnabled ?? true,
        items: validItems.map((item: { itemId: string; quantity?: number; isEnabled?: boolean }) => ({
          itemId: item.itemId,
          quantity: item.quantity ?? 1,
          isEnabled: item.isEnabled ?? true,
        })),
      });
    }

    // Sort by name ascending for display (spec 7.1.3)
    return loadouts.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    console.error('Failed to load stored loadouts');
    return [];
  }
}

/**
 * Save loadouts to localStorage
 * Maintains deterministic serialization order
 */
export function saveStoredLoadouts(loadouts: StoredLoadout[]): void {
  try {
    // Sort by name for deterministic order
    const sorted = [...loadouts].sort((a, b) => a.name.localeCompare(b.name));
    
    // Ensure schemaVersion is set
    const withSchema = sorted.map(loadout => ({
      ...loadout,
      schemaVersion: loadout.schemaVersion ?? LOADOUT_SCHEMA_VERSION,
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(withSchema));
  } catch {
    console.error('Failed to save loadouts');
  }
}

/**
 * Create a new empty loadout
 */
export function createNewLoadout(name: string): StoredLoadout {
  return {
    schemaVersion: LOADOUT_SCHEMA_VERSION,
    id: generateLoadoutId(),
    name,
    isEnabled: true,
    items: [],
  };
}

/**
 * Add or update an item in a loadout
 * If item exists, increases quantity; otherwise adds new item
 */
export function addItemToLoadout(
  loadout: StoredLoadout,
  itemId: string,
  quantity: number = 1
): StoredLoadout {
  const existingIndex = loadout.items.findIndex(item => item.itemId === itemId);
  
  if (existingIndex >= 0) {
    // Increase quantity
    const newItems = [...loadout.items];
    newItems[existingIndex] = {
      ...newItems[existingIndex],
      quantity: newItems[existingIndex].quantity + quantity,
    };
    return { ...loadout, items: newItems };
  }

  // Add new item
  return {
    ...loadout,
    items: [...loadout.items, { itemId, quantity, isEnabled: true }],
  };
}

/**
 * Remove an item from a loadout
 */
export function removeItemFromLoadout(
  loadout: StoredLoadout,
  itemId: string
): StoredLoadout {
  return {
    ...loadout,
    items: loadout.items.filter(item => item.itemId !== itemId),
  };
}

/**
 * Update item quantity in a loadout
 */
export function updateItemQuantity(
  loadout: StoredLoadout,
  itemId: string,
  quantity: number
): StoredLoadout {
  return {
    ...loadout,
    items: loadout.items.map(item =>
      item.itemId === itemId ? { ...item, quantity } : item
    ),
  };
}

/**
 * Toggle item enabled state in a loadout
 */
export function toggleItemEnabled(
  loadout: StoredLoadout,
  itemId: string
): StoredLoadout {
  return {
    ...loadout,
    items: loadout.items.map(item =>
      item.itemId === itemId ? { ...item, isEnabled: !item.isEnabled } : item
    ),
  };
}

/**
 * Toggle loadout enabled state
 */
export function toggleLoadoutEnabled(loadout: StoredLoadout): StoredLoadout {
  return { ...loadout, isEnabled: !loadout.isEnabled };
}

/**
 * Rename a loadout
 */
export function renameLoadout(loadout: StoredLoadout, newName: string): StoredLoadout {
  return { ...loadout, name: newName };
}
