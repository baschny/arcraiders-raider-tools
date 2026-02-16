/**
 * API Utilities for Quartermaster
 * Wraps shared arctrackerApi service
 * See specification sections 4.1, 4.2, 4.3
 */

import type { StashItem, CurrentLoadoutItem } from '../types/planner';
import type { BenchId } from '../types/item';
import type { CachedStash, CachedLoadout, ApiError } from '../../../shared/types/arctracker';
import {
  syncStashAllPages,
  syncLoadout,
  getStash,
  getLoadout,
} from '../../../shared/services/arctrackerApi';

// Re-export for convenience
export { syncStashAllPages, syncLoadout, getStash, getLoadout };
export type { CachedStash, CachedLoadout, ApiError };

/**
 * Check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'isRetryable' in error
  );
}

/**
 * Aggregate stash items by itemId from cached stash
 */
export function aggregateStashItems(cachedStash: CachedStash): StashItem[] {
  const aggregated = new Map<string, number>();
  
  for (const item of cachedStash.items) {
    const current = aggregated.get(item.itemId) ?? 0;
    aggregated.set(item.itemId, current + item.quantity);
  }

  return Array.from(aggregated.entries())
    .map(([itemId, quantity]) => ({ itemId, quantity }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/**
 * Aggregate loadout items by itemId from cached loadout
 * Ignores durability, extracts items from all loadout slots
 */
export function aggregateLoadoutItems(cachedLoadout: CachedLoadout): CurrentLoadoutItem[] {
  const aggregated = new Map<string, number>();
  const loadout = cachedLoadout.loadout;

  // Helper to add item
  const addItem = (itemId: string | null, quantity: number) => {
    if (itemId && quantity > 0) {
      const current = aggregated.get(itemId) ?? 0;
      aggregated.set(itemId, current + quantity);
    }
  };

  // Process single slots
  if (loadout.augment?.itemId) addItem(loadout.augment.itemId, loadout.augment.quantity);
  if (loadout.shield?.itemId) addItem(loadout.shield.itemId, loadout.shield.quantity);
  if (loadout.weapon1?.itemId) addItem(loadout.weapon1.itemId, loadout.weapon1.quantity);
  if (loadout.weapon2?.itemId) addItem(loadout.weapon2.itemId, loadout.weapon2.quantity);

  // Process array slots
  for (const slot of loadout.backpack ?? []) {
    addItem(slot.itemId, slot.quantity);
  }
  for (const slot of loadout.quickItems ?? []) {
    addItem(slot.itemId, slot.quantity);
  }
  for (const slot of loadout.safePocket ?? []) {
    addItem(slot.itemId, slot.quantity);
  }
  for (const slot of loadout.augmentedSlots ?? []) {
    addItem(slot.itemId, slot.quantity);
  }

  return Array.from(aggregated.entries())
    .map(([itemId, quantity]) => ({ itemId, quantity }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/**
 * Get bench levels (v1: all at level 3)
 * See specification section 4.4
 */
export function getBenchLevels(): Record<BenchId, number> {
  return {
    equipment_bench: 3,
    explosives_bench: 3,
    med_station: 3,
    refiner: 3,
    utility_bench: 3,
    weapon_bench: 3,
    workbench: 3,
  };
}
