/**
 * Hook for reading and toggling prioritized item IDs.
 *
 * Backed by the shared QuartermasterState store so the set persists
 * across sessions and syncs cross-device for signed-in users.
 */
import { useCallback, useMemo } from 'react';
import { quartermasterStore, useStore } from '../../../shared/state/stores';

export interface UsePrioritizedItems {
  /** Fast O(1) lookup set of prioritized item IDs. */
  prioritizedSet: ReadonlySet<string>;
  /** All prioritized item IDs (ordered as stored). */
  prioritizedIds: readonly string[];
  /** Add or remove an item from the prioritized set. */
  togglePrioritize: (itemId: string) => void;
  /** Remove all items from the prioritized set at once. */
  clearAllPrioritized: () => void;
}

export function usePrioritizedItems(): UsePrioritizedItems {
  const [state, setState] = useStore(quartermasterStore);

  const prioritizedIds: readonly string[] = state.prioritizedItemIds;

  const prioritizedSet = useMemo<ReadonlySet<string>>(
    () => new Set<string>(prioritizedIds),
    [prioritizedIds],
  );

  const togglePrioritize = useCallback(
    (itemId: string) => {
      const current = quartermasterStore.get();
      const ids = current.prioritizedItemIds;
      const next = ids.includes(itemId)
        ? ids.filter((id: string) => id !== itemId)
        : [...ids, itemId];
      setState({ ...current, prioritizedItemIds: next });
    },
    [setState],
  );

  const clearAllPrioritized = useCallback(
    () => {
      const current = quartermasterStore.get();
      setState({ ...current, prioritizedItemIds: [] });
    },
    [setState],
  );

  return { prioritizedSet, prioritizedIds, togglePrioritize, clearAllPrioritized };
}