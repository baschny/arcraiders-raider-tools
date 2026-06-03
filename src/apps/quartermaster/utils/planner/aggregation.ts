/**
 * List Aggregation
 * See specification section 6.1 / CR-001, CR-004
 */

import type { StoredList } from '../../types/list';
import type { ItemId, Qty, RequiredSource } from '../../types/planner';

export interface TargetPriority {
  listIndex: number;
  itemIndex: number;
}

export interface AggregationResult {
  required: Record<ItemId, Qty>;
  targetPriority: Record<ItemId, TargetPriority>;
  requiredSourcesByItemId: Record<ItemId, RequiredSource[]>;
}

/**
 * Aggregate required items from all enabled lists.
 * Also records the earliest (listIndex, itemIndex) for priority ordering.
 * Duplicate itemIds across lists sum quantities; earliest position wins priority.
 */
export function aggregateRequired(lists: StoredList[]): AggregationResult {
  const required: Record<ItemId, Qty> = {};
  const targetPriority: Record<ItemId, TargetPriority> = {};
  const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {};
  const orderedLists = [
    ...lists.filter(list => list.type === 'hideout'),
    ...lists.filter(list => list.type === 'quest'),
    ...lists.filter(list => list.type === 'project'),
    ...lists.filter(list => list.type !== 'hideout' && list.type !== 'quest' && list.type !== 'project'),
  ];

  for (let listIndex = 0; listIndex < orderedLists.length; listIndex++) {
    const list = orderedLists[listIndex];
    if (!list.isEnabled) continue;

    for (let itemIndex = 0; itemIndex < list.items.length; itemIndex++) {
      const item = list.items[itemIndex];
      if (!item.isEnabled) continue;

      required[item.itemId] = (required[item.itemId] ?? 0) + item.quantity;

      // Record earliest (listIndex, itemIndex) for duplicate itemIds
      if (!targetPriority[item.itemId]) {
        targetPriority[item.itemId] = { listIndex, itemIndex };
      }

      // Track list provenance (CR-003)
      if (!requiredSourcesByItemId[item.itemId]) {
        requiredSourcesByItemId[item.itemId] = [];
      }
      const existingSource = requiredSourcesByItemId[item.itemId].find(s => s.listId === list.id);
      if (existingSource) {
        existingSource.quantity += item.quantity;
      } else {
        requiredSourcesByItemId[item.itemId].push({
          listId: list.id,
          listName: list.name,
          quantity: item.quantity,
          listType: list.type,
        });
      }
    }
  }

  return { required, targetPriority, requiredSourcesByItemId };
}

/**
 * Get count of active lists
 */
export function getActiveListsCount(lists: StoredList[]): number {
  return lists.filter(l => l.isEnabled).length;
}
