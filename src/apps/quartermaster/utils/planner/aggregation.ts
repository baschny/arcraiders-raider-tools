/**
 * List Aggregation
 * See specification section 6.1 / CR-001, CR-004
 */

import type { StoredList } from '../../types/list';
import type { ItemId, Qty } from '../../types/planner';

export interface TargetPriority {
  listIndex: number;
  itemIndex: number;
}

export interface AggregationResult {
  required: Record<ItemId, Qty>;
  targetPriority: Record<ItemId, TargetPriority>;
}

/**
 * Aggregate required items from all enabled lists.
 * Also records the earliest (listIndex, itemIndex) for priority ordering.
 * Duplicate itemIds across lists sum quantities; earliest position wins priority.
 */
export function aggregateRequired(lists: StoredList[]): AggregationResult {
  const required: Record<ItemId, Qty> = {};
  const targetPriority: Record<ItemId, TargetPriority> = {};

  for (let listIndex = 0; listIndex < lists.length; listIndex++) {
    const list = lists[listIndex];
    if (!list.isEnabled) continue;

    for (let itemIndex = 0; itemIndex < list.items.length; itemIndex++) {
      const item = list.items[itemIndex];
      if (!item.isEnabled) continue;

      required[item.itemId] = (required[item.itemId] ?? 0) + item.quantity;

      // Record earliest (listIndex, itemIndex) for duplicate itemIds
      if (!targetPriority[item.itemId]) {
        targetPriority[item.itemId] = { listIndex, itemIndex };
      }
    }
  }

  return { required, targetPriority };
}

/**
 * Get count of active lists
 */
export function getActiveListsCount(lists: StoredList[]): number {
  return lists.filter(l => l.isEnabled).length;
}
