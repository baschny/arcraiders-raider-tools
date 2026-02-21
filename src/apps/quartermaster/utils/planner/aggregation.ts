/**
 * Loadout Aggregation
 * See specification section 6.1 / CR-MOD-6.1
 */

import type { StoredLoadout } from '../../types/loadout';
import type { ItemId, Qty } from '../../types/planner';

/**
 * Aggregate required items from all enabled loadouts
 * Returns a map of itemId -> total required quantity
 */
export function aggregateRequired(loadouts: StoredLoadout[]): Record<ItemId, Qty> {
  const required: Record<ItemId, Qty> = {};

  const enabledLoadouts = loadouts.filter(l => l.isEnabled);

  for (const loadout of enabledLoadouts) {
    const enabledItems = loadout.items.filter(item => item.isEnabled);

    for (const item of enabledItems) {
      required[item.itemId] = (required[item.itemId] ?? 0) + item.quantity;
    }
  }

  return required;
}

/**
 * Get count of active loadouts
 */
export function getActiveLoadoutsCount(loadouts: StoredLoadout[]): number {
  return loadouts.filter(l => l.isEnabled).length;
}
