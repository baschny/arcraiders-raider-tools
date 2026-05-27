/**
 * Concrete domain stores for the three user-state domains.
 *
 * Each store is a module-level singleton. Other modules (the three apps)
 * import these instances directly; orchestration code (sign-in, sign-out,
 * migration) uses the `allStores` array.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { UserStateStore } from './userStateStore';
import { migrateQuestIds } from '../../apps/quests/data/questIdMigration';

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------
export interface QuestsState {
    mode: 'manual' | 'linked';
    /** Set of manually completed quest IDs (serialized as an array). */
    manualCompletedQuestIds: string[];
}
export const questsStore = new UserStateStore<QuestsState>({
    domain: 'quests',
    schemaVersion: 2,
    defaultValue: {
        mode: 'manual',
        manualCompletedQuestIds: [],
    },
    migrate: (raw) => {
        const r = raw as Partial<QuestsState> | null;
        const legacy = raw as { completedQuestIds?: string[] } | null;
        const arr = Array.isArray(r?.manualCompletedQuestIds)
            ? r.manualCompletedQuestIds
            : Array.isArray(legacy?.completedQuestIds)
                ? legacy.completedQuestIds
                : [];
        return {
            mode: r?.mode === 'linked' ? 'linked' : 'manual',
            manualCompletedQuestIds: migrateQuestIds(arr),
        };
    },
});

// ---------------------------------------------------------------------------
// Loot-helper
// ---------------------------------------------------------------------------
export interface LootState {
    goalItems: string[];
    disabledItems: string[];
    stashItems: string[];
    disabledStashItems: string[];
    enabledTypes: string[] | null;
    enabledRarities: string[] | null;
    enabledLocations: string[] | null;
}
export const lootStore = new UserStateStore<LootState>({
    domain: 'loot',
    schemaVersion: 1,
    defaultValue: {
        goalItems: [],
        disabledItems: [],
        stashItems: [],
        disabledStashItems: [],
        enabledTypes: null,
        enabledRarities: null,
        enabledLocations: null,
    },
});

// ---------------------------------------------------------------------------
// Quartermaster
// ---------------------------------------------------------------------------
export interface QuartermasterStoredList {
    id: string;
    name: string;
    type: 'user' | 'hideout';
    isEnabled: boolean;
    items: Array<{ itemId: string; quantity: number; isEnabled: boolean }>;
}
export interface QuartermasterState {
    lists: QuartermasterStoredList[];
    hideoutToggles: {
        listEnabled: Record<string, boolean>;
        itemEnabled: Record<string, boolean>;
    };
    prioritizedItemIds: string[];
}
export const quartermasterStore = new UserStateStore<QuartermasterState>({
    domain: 'quartermaster',
    schemaVersion: 2,
    defaultValue: {
        lists: [],
        hideoutToggles: { listEnabled: {}, itemEnabled: {} },
        prioritizedItemIds: [],
    },
    migrate: (raw) => {
        const r = raw as Partial<QuartermasterState> | null;
        return {
            lists: Array.isArray(r?.lists) ? r.lists : [],
            hideoutToggles: {
                listEnabled: r?.hideoutToggles?.listEnabled ?? {},
                itemEnabled: r?.hideoutToggles?.itemEnabled ?? {},
            },
            prioritizedItemIds: Array.isArray(r?.prioritizedItemIds)
                ? r.prioritizedItemIds.filter((id): id is string => typeof id === 'string')
                : [],
        };
    },
});

// ---------------------------------------------------------------------------
// Registry + global flush hooks
// ---------------------------------------------------------------------------

export const allStores = [questsStore, lootStore, quartermasterStore] as const;

let globalHooksInstalled = false;

/**
 * Install page-lifecycle hooks that flush all dirty stores before the tab
 * is hidden or unloaded. Idempotent.
 */
export function installGlobalFlushHooks(): void {
    if (globalHooksInstalled || typeof window === 'undefined') return;
    globalHooksInstalled = true;

    const flushAll = () => {
        for (const store of allStores) void store.flush();
    };
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAll();
    });
}

/**
 * React hook that subscribes to a store. Returns `[value, setValue]`.
 *
 * The setter always replaces the value; callers should use the
 * functional-update pattern at the call site if they need prev-state.
 */
export function useStore<T>(store: UserStateStore<T>): [T, (next: T) => void] {
    const value = useSyncExternalStore(
        (listener) => store.subscribe(listener),
        () => store.get(),
        () => store.get(),
    );
    const setValue = useCallback((next: T) => store.set(next), [store]);
    return [value, setValue];
}