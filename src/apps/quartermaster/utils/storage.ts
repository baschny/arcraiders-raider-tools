/**
 * Storage Utilities for Quartermaster
 * Handles persistence for lists via the shared `quartermasterStore`.
 * See specification section 7.1.3 / CR-002
 */

import type { StoredList } from '../types/list';
import type { ItemsMap } from '../types/item';
import { quartermasterStore } from '../../../shared/state/stores';

/**
 * Generate a unique ID for a new list
 */
export function generateListId(): string {
  return `list_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Load all stored lists from the in-memory snapshot.
 * Validates item IDs against known items; preserves array order (= priority).
 */
export function loadStoredLists(itemsMap: ItemsMap): StoredList[] {
  return normalizeStoredLists(quartermasterStore.get().lists, itemsMap);
}

export function normalizeStoredLists(
  raw: ReturnType<typeof quartermasterStore.get>['lists'],
  itemsMap: ItemsMap
): StoredList[] {
  const lists: StoredList[] = [];
  for (const r of raw) {
    if (!r || !r.id || !r.name) continue;
    const validItems = Array.isArray(r.items)
      ? r.items.filter((item) => item?.itemId && itemsMap[item.itemId])
      : [];
    lists.push({
      id: r.id,
      name: r.name,
      type: (r.type as 'user' | 'hideout') ?? 'user',
      isEnabled: r.isEnabled ?? true,
      items: validItems.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity ?? 1,
        isEnabled: item.isEnabled ?? true,
      })),
    });
  }
  return lists;
}

/**
 * Save lists through the store. Array order = priority.
 */
export function saveStoredLists(lists: StoredList[]): void {
  const prev = quartermasterStore.get();
  quartermasterStore.set({ ...prev, lists });
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
