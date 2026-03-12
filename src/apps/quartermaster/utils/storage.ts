/**
 * Storage Utilities for Quartermaster
 * Handles localStorage persistence for lists
 * See specification section 7.1.3 / CR-002
 */

import type { StoredList } from '../types/list';
import type { ItemsMap } from '../types/item';

const STORAGE_KEY = 'quartermaster_lists';

/**
 * Generate a unique ID for a new list
 */
export function generateListId(): string {
  return `list_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Load all stored lists from localStorage
 * Validates item IDs against known items; preserves array order (= priority)
 */
export function loadStoredLists(itemsMap: ItemsMap): StoredList[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const lists: StoredList[] = [];

    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }

      if (!raw.id || !raw.name) {
        continue;
      }

      // Filter out unknown item IDs
      const validItems = Array.isArray(raw.items)
        ? raw.items.filter((item: { itemId?: string }) =>
            item?.itemId && itemsMap[item.itemId]
          )
        : [];

      lists.push({
        id: raw.id,
        name: raw.name,
        type: (raw.type as 'user' | 'hideout') ?? 'user',
        isEnabled: raw.isEnabled ?? true,
        items: validItems.map((item: { itemId: string; quantity?: number; isEnabled?: boolean }) => ({
          itemId: item.itemId,
          quantity: item.quantity ?? 1,
          isEnabled: item.isEnabled ?? true,
        })),
      });
    }

    // Preserve stored order – order IS the priority
    return lists;
  } catch {
    console.error('Failed to load stored lists');
    return [];
  }
}

/**
 * Save lists to localStorage
 * Array order is preserved as-is (order = priority)
 */
export function saveStoredLists(lists: StoredList[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    console.error('Failed to save lists');
  }
}

/**
 * Create a new empty list
 */
export function createNewList(name: string): StoredList {
  return {
    id: generateListId(),
    name,
    type: 'user',
    isEnabled: true,
    items: [],
  };
}

/**
 * Add or update an item in a list
 * If item exists, increases quantity; otherwise appends new item
 */
export function addItemToList(
  list: StoredList,
  itemId: string,
  quantity: number = 1
): StoredList {
  const existingIndex = list.items.findIndex(item => item.itemId === itemId);

  if (existingIndex >= 0) {
    const newItems = [...list.items];
    newItems[existingIndex] = {
      ...newItems[existingIndex],
      quantity: newItems[existingIndex].quantity + quantity,
    };
    return { ...list, items: newItems };
  }

  return {
    ...list,
    items: [...list.items, { itemId, quantity, isEnabled: true }],
  };
}

/**
 * Remove an item from a list
 */
export function removeItemFromList(
  list: StoredList,
  itemId: string
): StoredList {
  return {
    ...list,
    items: list.items.filter(item => item.itemId !== itemId),
  };
}

/**
 * Update item quantity in a list
 */
export function updateItemQuantity(
  list: StoredList,
  itemId: string,
  quantity: number
): StoredList {
  return {
    ...list,
    items: list.items.map(item =>
      item.itemId === itemId ? { ...item, quantity } : item
    ),
  };
}

/**
 * Toggle item enabled state in a list
 */
export function toggleItemEnabled(
  list: StoredList,
  itemId: string
): StoredList {
  return {
    ...list,
    items: list.items.map(item =>
      item.itemId === itemId ? { ...item, isEnabled: !item.isEnabled } : item
    ),
  };
}

/**
 * Toggle list enabled state
 */
export function toggleListEnabled(list: StoredList): StoredList {
  return { ...list, isEnabled: !list.isEnabled };
}

/**
 * Rename a list
 */
export function renameList(list: StoredList, newName: string): StoredList {
  return { ...list, name: newName };
}

/**
 * Reorder items within a list using new item ID order
 */
export function reorderListItems(
  list: StoredList,
  reorderedItemIds: string[]
): StoredList {
  const itemMap = Object.fromEntries(list.items.map(i => [i.itemId, i]));
  return {
    ...list,
    items: reorderedItemIds.map(id => itemMap[id]).filter(Boolean) as StoredList['items'],
  };
}
