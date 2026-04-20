/**
 * Loot-helper storage — thin adapter over the shared `lootStore`.
 *
 * Public API unchanged from phase 1 so no call site in this app needs to
 * change. Under the hood every read is against the in-memory snapshot
 * maintained by the store, and every save does `store.set(next)` which
 * the store debounces and persists via the active backend (localStorage
 * for anonymous users, the API for signed-in users).
 */

import { lootStore, type LootState } from '../../../shared/state/stores';

function current(): LootState {
  return lootStore.get();
}

function patch(next: Partial<LootState>): void {
  lootStore.set({ ...current(), ...next });
}

export function loadGoalItems(): string[] {
  return current().goalItems;
}

export function saveGoalItems(itemIds: string[]): void {
  patch({ goalItems: itemIds });
}

export function loadDisabledItems(): Set<string> {
  return new Set(current().disabledItems);
}

export function saveDisabledItems(disabledIds: Set<string>): void {
  patch({ disabledItems: Array.from(disabledIds) });
}

export function loadDisabledStashItems(): Set<string> {
  return new Set(current().disabledStashItems);
}

export function saveDisabledStashItems(disabledIds: Set<string>): void {
  patch({ disabledStashItems: Array.from(disabledIds) });
}

export function addGoalItem(itemId: string): string[] {
  const items = loadGoalItems();
  if (!items.includes(itemId)) {
    const next = [...items, itemId];
    saveGoalItems(next);
    return next;
  }
  return items;
}

export function removeGoalItem(itemId: string): string[] {
  const items = loadGoalItems();
  const filtered = items.filter((id) => id !== itemId);
  saveGoalItems(filtered);
  return filtered;
}

export function loadEnabledTypes(): Set<string> | null {
  const v = current().enabledTypes;
  return v ? new Set(v) : null;
}

export function saveEnabledTypes(enabledTypes: Set<string>): void {
  patch({ enabledTypes: Array.from(enabledTypes) });
}

export function loadEnabledRarities(): Set<string> | null {
  const v = current().enabledRarities;
  return v ? new Set(v) : null;
}

export function saveEnabledRarities(enabledRarities: Set<string>): void {
  patch({ enabledRarities: Array.from(enabledRarities) });
}

export function loadStashItems(): Set<string> {
  return new Set(current().stashItems);
}

export function saveStashItems(stashIds: Set<string>): void {
  patch({ stashItems: Array.from(stashIds) });
}

export function loadEnabledLocations(): Set<string> | null {
  const v = current().enabledLocations;
  return v ? new Set(v) : null;
}

export function saveEnabledLocations(enabledLocations: Set<string>): void {
  patch({ enabledLocations: Array.from(enabledLocations) });
}
