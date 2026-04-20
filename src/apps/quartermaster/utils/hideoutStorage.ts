/**
 * Hideout Toggle State Persistence
 * See specification CR-008
 */

import type { HideoutToggleState } from '../types/hideout';
import type { CachedHideout } from '../../../shared/types/arctracker';
import type { HideoutModuleDefinition } from '../types/hideout';
import { quartermasterStore } from '../../../shared/state/stores';

/**
 * Load hideout toggle state from the shared quartermaster store.
 */
export function loadHideoutToggleState(): HideoutToggleState {
  const t = quartermasterStore.get().hideoutToggles;
  return {
    listEnabled: t.listEnabled ?? {},
    itemEnabled: t.itemEnabled ?? {},
  };
}

/**
 * Save hideout toggle state via the shared quartermaster store.
 */
export function saveHideoutToggleState(state: HideoutToggleState): void {
  const prev = quartermasterStore.get();
  quartermasterStore.set({ ...prev, hideoutToggles: state });
}

/**
 * Build the list key for toggle state persistence
 */
export function listKey(moduleId: string, level: number): string {
  return `${moduleId}:${level}`;
}

/**
 * Build the item key for toggle state persistence
 */
export function itemKey(moduleId: string, level: number, itemId: string): string {
  return `${moduleId}:${level}:${itemId}`;
}

/**
 * Remove toggle state for lists that no longer exist due to hideout progression.
 * Returns a cleaned copy of the toggle state.
 */
export function cleanupObsoleteToggles(
  definitions: HideoutModuleDefinition[],
  cachedHideout: CachedHideout,
  toggleState: HideoutToggleState,
): HideoutToggleState {
  // Build a set of valid list keys (moduleId:level) based on current state
  const validListKeys = new Set<string>();
  const validItemKeyPrefixes = new Set<string>();

  const moduleMap = new Map(cachedHideout.modules.map(m => [m.moduleId, m]));

  for (const def of definitions) {
    const cached = moduleMap.get(def.id);
    if (!cached) continue;

    for (const level of def.levels) {
      if (level.level > cached.currentLevel) {
        const lk = listKey(def.id, level.level);
        validListKeys.add(lk);
        validItemKeyPrefixes.add(`${def.id}:${level.level}:`);
      }
    }
  }

  const cleanedListEnabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggleState.listEnabled)) {
    if (validListKeys.has(key)) {
      cleanedListEnabled[key] = value;
    }
  }

  const cleanedItemEnabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggleState.itemEnabled)) {
    // Extract "moduleId:level:" prefix to check validity
    const listPart = key.substring(0, key.indexOf(':', key.indexOf(':') + 1) + 1);
    if (validItemKeyPrefixes.has(listPart)) {
      cleanedItemEnabled[key] = value;
    }
  }

  return { listEnabled: cleanedListEnabled, itemEnabled: cleanedItemEnabled };
}
