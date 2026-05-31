/**
 * API Utilities for Quartermaster
 * Wraps shared arctrackerApi service
 * See specification sections 4.1, 4.2, 4.3
 */

import type {
  CurrentLoadoutItem,
  OwnedItemDisplayRow,
  OwnedItemLocation,
  OwnedItemQuantity,
  StashItem,
} from '../types/planner';
import type { BenchId, ItemsMap } from '../types/item';
import type {
  ArctrackerLoadoutSlot,
  CachedStash,
  CachedLoadout,
  CachedHideout,
  CachedBlueprints,
  CachedProjects,
  ApiError,
} from '../../../shared/types/arctracker';
import {
  syncStashAllPages,
  syncLoadout,
  syncHideout,
  syncBlueprints,
  syncProjects,
  getStash,
  getLoadout,
  getHideout,
  getBlueprints,
  getProjects,
} from '../../../shared/services/arctrackerApi';

// Re-export for convenience
export {
  syncStashAllPages,
  syncLoadout,
  syncHideout,
  syncBlueprints,
  syncProjects,
  getStash,
  getLoadout,
  getHideout,
  getBlueprints,
  getProjects,
};
export type { CachedStash, CachedLoadout, CachedHideout, CachedBlueprints, CachedProjects, ApiError };

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
    if (!item.itemId || item.quantity <= 0) continue;
    const current = aggregated.get(item.itemId) ?? 0;
    aggregated.set(item.itemId, current + item.quantity);
  }

  return Array.from(aggregated.entries())
    .map(([itemId, quantity]) => ({ itemId, quantity }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
}

function addQuantity(aggregated: Map<string, number>, itemId: string | null, quantity: number): void {
  if (!itemId || quantity <= 0) return;
  const current = aggregated.get(itemId) ?? 0;
  aggregated.set(itemId, current + quantity);
}

/**
 * Aggregate loadout items by itemId from cached loadout
 * Ignores durability, extracts root items from all loadout slots
 */
export function aggregateLoadoutItems(cachedLoadout: CachedLoadout): CurrentLoadoutItem[] {
  const aggregated = new Map<string, number>();
  const loadout = cachedLoadout.loadout;

  // Helper to add item
  const addItem = (itemId: string | null, quantity: number) => {
    addQuantity(aggregated, itemId, quantity);
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

function shouldIncludeItem(itemId: string | null, quantity: number, itemsMap?: ItemsMap): itemId is string {
  return !!itemId && quantity > 0 && (!itemsMap || !!itemsMap[itemId]);
}

function mergeLocation(existing: OwnedItemLocation[], location: OwnedItemLocation): OwnedItemLocation[] {
  const match = existing.find((candidate) => {
    if (candidate.source !== location.source) return false;
    if (location.source === 'stash_attachment' || location.source === 'loadout_attachment') {
      return (
        candidate.source === location.source &&
        candidate.parentItemId === location.parentItemId &&
        candidate.parentName === location.parentName
      );
    }
    return true;
  });

  if (match) {
    match.quantity += location.quantity;
    if (
      (match.source === 'stash' || match.source === 'loadout') &&
      (location.source === 'stash' || location.source === 'loadout') &&
      location.hasAttachments
    ) {
      match.hasAttachments = true;
    }
    return existing;
  }

  return [...existing, location];
}

function addOwnedItem(
  rows: Map<string, OwnedItemDisplayRow>,
  itemId: string | null,
  quantity: number,
  location: OwnedItemLocation,
  itemsMap?: ItemsMap,
  durabilityPercent?: number,
): void {
  if (!shouldIncludeItem(itemId, quantity, itemsMap)) return;

  const itemHasRepairCost = !!(itemsMap && itemId && itemsMap[itemId]?.repairCost);

  // For items with repairCost, do NOT aggregate — create separate rows per instance
  if (itemHasRepairCost) {
    const instanceIndex = Array.from(rows.values()).filter((r) => r.itemId === itemId).length;
    const key = `${itemId}__${instanceIndex}`;
    rows.set(key, {
      itemId,
      quantity,
      locations: [location],
      durabilityPercent,
      instanceIndex,
    });
    return;
  }

  const existing = rows.get(itemId);
  if (existing) {
    existing.quantity += quantity;
    existing.locations = mergeLocation(existing.locations, location);
    return;
  }

  rows.set(itemId, {
    itemId,
    quantity,
    locations: [location],
  });
}

function addAttachments(
  rows: Map<string, OwnedItemDisplayRow>,
  attachments: ArctrackerLoadoutSlot[] | undefined,
  source: 'stash_attachment' | 'loadout_attachment',
  parentItemId: string | null,
  parentName: string | null,
  itemsMap?: ItemsMap,
): void {
  if (!parentItemId || !attachments) return;

  for (const attachment of attachments) {
    addOwnedItem(rows, attachment.itemId, attachment.quantity, {
      source,
      quantity: attachment.quantity,
      parentItemId,
      parentName: parentName || parentItemId,
    }, itemsMap, attachment.durabilityPercent);
  }
}

function addLoadoutSlot(
  rows: Map<string, OwnedItemDisplayRow>,
  slot: ArctrackerLoadoutSlot | null | undefined,
  itemsMap?: ItemsMap,
): void {
  if (!slot) return;

  addOwnedItem(rows, slot.itemId, slot.quantity, {
    source: 'loadout',
    quantity: slot.quantity,
    hasAttachments: (slot.attachments?.some((attachment) => shouldIncludeItem(attachment.itemId, attachment.quantity, itemsMap)) ?? false),
  }, itemsMap, slot.durabilityPercent);
  addAttachments(rows, slot.attachments, 'loadout_attachment', slot.itemId, slot.name, itemsMap);
}

/**
 * Build canonical owned inventory rows from stash, loadout, and slotted attachments.
 */
export function aggregateOwnedInventory(
  cachedStash: CachedStash | null,
  cachedLoadout: CachedLoadout | null,
  itemsMap?: ItemsMap,
): OwnedItemDisplayRow[] {
  const rows = new Map<string, OwnedItemDisplayRow>();

  for (const item of cachedStash?.items ?? []) {
    addOwnedItem(rows, item.itemId, item.quantity, {
      source: 'stash',
      quantity: item.quantity,
      hasAttachments: (item.attachments?.some((attachment) => shouldIncludeItem(attachment.itemId, attachment.quantity, itemsMap)) ?? false),
    }, itemsMap, item.durabilityPercent);
    addAttachments(rows, item.attachments, 'stash_attachment', item.itemId, item.name, itemsMap);
  }

  const loadout = cachedLoadout?.loadout;
  if (loadout) {
    addLoadoutSlot(rows, loadout.augment, itemsMap);
    addLoadoutSlot(rows, loadout.shield, itemsMap);
    addLoadoutSlot(rows, loadout.weapon1, itemsMap);
    addLoadoutSlot(rows, loadout.weapon2, itemsMap);

    for (const slot of loadout.backpack ?? []) addLoadoutSlot(rows, slot, itemsMap);
    for (const slot of loadout.quickItems ?? []) addLoadoutSlot(rows, slot, itemsMap);
    for (const slot of loadout.safePocket ?? []) addLoadoutSlot(rows, slot, itemsMap);
    for (const slot of loadout.augmentedSlots ?? []) addLoadoutSlot(rows, slot, itemsMap);
  }

  return Array.from(rows.values()).sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export function toOwnedItemQuantities(rows: OwnedItemDisplayRow[]): OwnedItemQuantity[] {
  return rows.map(({ itemId, quantity }) => ({ itemId, quantity }));
}

/**
 * Default bench levels (fallback: all at level 3)
 */
const DEFAULT_BENCH_LEVELS: Record<BenchId, number> = {
  equipment_bench: 3,
  explosives_bench: 3,
  med_station: 3,
  refiner: 3,
  utility_bench: 3,
  weapon_bench: 3,
  workbench: 3,
};

const BENCH_IDS = new Set<string>(Object.keys(DEFAULT_BENCH_LEVELS));

/**
 * Get bench levels from cached hideout state, or fallback to all level 3.
 * See specification section 4.4 / CR-005
 */
export function getBenchLevels(cachedHideout?: CachedHideout | null): Record<BenchId, number> {
  if (!cachedHideout) {
    return { ...DEFAULT_BENCH_LEVELS };
  }

  const levels = { ...DEFAULT_BENCH_LEVELS };
  for (const mod of cachedHideout.modules) {
    if (BENCH_IDS.has(mod.moduleId)) {
      levels[mod.moduleId as BenchId] = mod.currentLevel;
    }
  }
  return levels;
}

/**
 * Get learned blueprint target item IDs from cached blueprint state.
 */
export function getUnlockedBlueprintItemIds(cachedBlueprints?: CachedBlueprints | null): Set<string> {
  return new Set(cachedBlueprints?.unlockedItemIds ?? []);
}
