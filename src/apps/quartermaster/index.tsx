/**
 * Quartermaster App
 * Loadout, Loot & Craft Planner for ARC Raiders
 * See specification document for full details
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ItemsMap } from './types/item';
import type { StoredList } from './types/list';
import type { StashItem, CurrentLoadoutItem, PlannerResult } from './types/planner';
import { loadAllItems } from './utils/dataLoader';
import {
  loadStoredLists,
  saveStoredLists,
  createNewList,
  addItemToList,
  removeItemFromList,
  updateItemQuantity,
  toggleItemEnabled,
  toggleListEnabled,
  renameList,
  reorderListItems,
} from './utils/storage';
import { computePlan, createEmptyResult } from './utils/planner';
import {
  syncStashAllPages,
  syncLoadout,
  getStash,
  getLoadout,
  aggregateStashItems,
  aggregateLoadoutItems,
  isApiError,
  type CachedStash,
  type CachedLoadout,
} from './utils/api';
import { useAuth } from '../../shared/context/AuthContext';

import { Sidebar, type ViewId } from './components/Sidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { AuthGate } from './components/AuthGate';
import { StashView } from './components/views/StashView';
import { CurrentLoadoutView } from './components/views/CurrentLoadoutView';
import { ListsView } from './components/views/ListsView';
import { InRaidView } from './components/views/InRaidView';
import { CraftingView } from './components/views/CraftingView';

import './styles/main.scss';

export function QuartermasterApp() {
  const { revalidate } = useAuth();

  // Core state
  const [itemsMap, setItemsMap] = useState<ItemsMap | null>(null);
  const [lists, setLists] = useState<StoredList[]>([]);
  const [stashItems, setStashItems] = useState<StashItem[]>([]);
  const [currentLoadout, setCurrentLoadout] = useState<CurrentLoadoutItem[]>([]);
  
  // Cached data for timestamps (section 3.4)
  const [cachedStash, setCachedStash] = useState<CachedStash | null>(null);
  const [cachedLoadout, setCachedLoadout] = useState<CachedLoadout | null>(null);

  // UI state
  const [activeView, setActiveView] = useState<ViewId>('lists');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncingStash, setIsSyncingStash] = useState(false);
  const [isSyncingLoadout, setIsSyncingLoadout] = useState(false);

  // Load items and cached data on mount
  useEffect(() => {
    async function initialize() {
      try {
        // Load static items first
        const items = await loadAllItems();
        setItemsMap(items);
        
        // Load stored lists
        const stored = loadStoredLists(items);
        setLists(stored);

        // Load cached stash from IndexedDB (per spec 4.2.2)
        const stash = await getStash();
        if (stash) {
          setCachedStash(stash);
          const aggregated = aggregateStashItems(stash);
          const knownItems = aggregated.filter(i => items[i.itemId]);
          setStashItems(knownItems);
        }

        // Load cached loadout from IndexedDB (per spec 4.3.2)
        const loadout = await getLoadout();
        if (loadout) {
          setCachedLoadout(loadout);
          const aggregated = aggregateLoadoutItems(loadout);
          const knownItems = aggregated.filter(i => items[i.itemId]);
          setCurrentLoadout(knownItems);
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    }
    initialize();
  }, []);

  // Compute planner result whenever inputs change
  const plannerResult: PlannerResult = useMemo(() => {
    if (!itemsMap) {
      return createEmptyResult();
    }
    return computePlan(itemsMap, lists, stashItems);
  }, [itemsMap, lists, stashItems]);

  // List management callbacks
  const handleCreateList = useCallback((name: string) => {
    const newList = createNewList(name);
    const updated = [...lists, newList];
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleDeleteList = useCallback((id: string) => {
    const updated = lists.filter(l => l.id !== id);
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleToggleList = useCallback((id: string) => {
    const updated = lists.map(l =>
      l.id === id ? toggleListEnabled(l) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleRenameList = useCallback((id: string, name: string) => {
    const updated = lists.map(l =>
      l.id === id ? renameList(l, name) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleAddItem = useCallback((listId: string, itemId: string, quantity: number) => {
    const updated = lists.map(l =>
      l.id === listId ? addItemToList(l, itemId, quantity) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleRemoveItem = useCallback((listId: string, itemId: string) => {
    const updated = lists.map(l =>
      l.id === listId ? removeItemFromList(l, itemId) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleUpdateQuantity = useCallback((listId: string, itemId: string, quantity: number) => {
    const updated = lists.map(l =>
      l.id === listId ? updateItemQuantity(l, itemId, quantity) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleToggleItem = useCallback((listId: string, itemId: string) => {
    const updated = lists.map(l =>
      l.id === listId ? toggleItemEnabled(l, itemId) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  const handleReorderLists = useCallback((reorderedLists: StoredList[]) => {
    setLists(reorderedLists);
    saveStoredLists(reorderedLists);
  }, []);

  const handleReorderItems = useCallback((listId: string, reorderedItemIds: string[]) => {
    const updated = lists.map(l =>
      l.id === listId ? reorderListItems(l, reorderedItemIds) : l
    );
    setLists(updated);
    saveStoredLists(updated);
  }, [lists]);

  /**
   * Handle API errors per spec section 4.2.3 / 4.3.3
   */
  const handleApiError = useCallback((err: unknown, operation: string) => {
    if (isApiError(err)) {
      if (err.status === 401) {
        // Prompt re-auth
        setSyncError('Session expired. Please log in again.');
        revalidate();
      } else if (err.status === 429 || err.isRetryable) {
        // Show warning for rate limit or retryable errors
        setSyncError(`Rate limited. Please wait a moment and try again.`);
      } else {
        // Other errors
        setSyncError(`${operation} failed: ${err.message}`);
      }
    } else {
      setSyncError(`${operation} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    // Do NOT clear cache on failure (per spec 4.2.3)
  }, [revalidate]);

  // Sync callbacks using shared arctrackerApi service (spec 4.2.1, 4.3.1)
  const handleSyncStash = useCallback(async () => {
    setIsSyncingStash(true);
    setSyncError(null);
    try {
      const stash = await syncStashAllPages();
      setCachedStash(stash);
      
      // Filter to only known items (per spec 4.2.2)
      const aggregated = aggregateStashItems(stash);
      const knownItems = itemsMap 
        ? aggregated.filter(i => itemsMap[i.itemId])
        : aggregated;
      setStashItems(knownItems);
    } catch (err) {
      console.error('Failed to sync stash:', err);
      handleApiError(err, 'Sync inventory');
    } finally {
      setIsSyncingStash(false);
    }
  }, [itemsMap, handleApiError]);

  const handleSyncLoadout = useCallback(async () => {
    setIsSyncingLoadout(true);
    setSyncError(null);
    try {
      const loadout = await syncLoadout();
      setCachedLoadout(loadout);
      
      // Filter to only known items (per spec 4.3.2)
      const aggregated = aggregateLoadoutItems(loadout);
      const knownItems = itemsMap 
        ? aggregated.filter(i => itemsMap[i.itemId])
        : aggregated;
      setCurrentLoadout(knownItems);
    } catch (err) {
      console.error('Failed to sync loadout:', err);
      handleApiError(err, 'Sync loadout');
    } finally {
      setIsSyncingLoadout(false);
    }
  }, [itemsMap, handleApiError]);

  // Render content based on active view
  // Views requiring stash/loadout are wrapped in AuthGate (per spec section 3.2)
  const renderContent = () => {
    if (!itemsMap) return null;

    switch (activeView) {
      case 'stash':
        return (
          <AuthGate>
            <StashView
              itemsMap={itemsMap}
              stashItems={stashItems}
              plannerResult={plannerResult}
              onSyncStash={handleSyncStash}
              isSyncing={isSyncingStash}
            />
          </AuthGate>
        );

      case 'current-loadout':
        return (
          <AuthGate>
            <CurrentLoadoutView
              itemsMap={itemsMap}
              currentLoadout={currentLoadout}
              plannerResult={plannerResult}
              onSyncLoadout={handleSyncLoadout}
              isSyncing={isSyncingLoadout}
            />
          </AuthGate>
        );

      case 'lists':
        return (
          <ListsView
            itemsMap={itemsMap}
            lists={lists}
            onCreateList={handleCreateList}
            onDeleteList={handleDeleteList}
            onToggleList={handleToggleList}
            onRenameList={handleRenameList}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateQuantity={handleUpdateQuantity}
            onToggleItem={handleToggleItem}
            onReorderLists={handleReorderLists}
            onReorderItems={handleReorderItems}
          />
        );

      case 'in-raid':
        return (
          <AuthGate>
            <InRaidView
              itemsMap={itemsMap}
              lootSuggestions={plannerResult.lootSuggestions}
              plannerResult={plannerResult}
            />
          </AuthGate>
        );

      case 'crafting':
        return (
          <AuthGate>
            <CraftingView
              itemsMap={itemsMap}
              craftPlan={plannerResult.craftPlan}
              recyclePlan={plannerResult.recyclePlan}
              onSyncStash={handleSyncStash}
              isSyncing={isSyncingStash}
            />
          </AuthGate>
        );

      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="quartermaster-container">
        <div className="qm-loading">Loading item data...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="quartermaster-container">
        <div className="qm-error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="quartermaster-container">
      <div className="quartermaster-layout">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <div className="quartermaster-main">
          <GlobalHeader
            plannerResult={plannerResult}
            stashSyncedAt={cachedStash?.syncedAt ?? null}
            loadoutSyncedAt={cachedLoadout?.syncedAt ?? null}
          />
          {syncError && (
            <div className="qm-sync-error">
              {syncError}
              <button 
                className="qm-sync-error__dismiss" 
                onClick={() => setSyncError(null)}
              >
                ×
              </button>
            </div>
          )}
          <div className="quartermaster-content">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
