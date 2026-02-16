/**
 * Quartermaster App
 * Loadout, Loot & Craft Planner for ARC Raiders
 * See specification document for full details
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ItemsMap } from './types/item';
import type { StoredLoadout } from './types/loadout';
import type { StashItem, CurrentLoadoutItem, PlannerResult } from './types/planner';
import { loadAllItems } from './utils/dataLoader';
import { 
  loadStoredLoadouts, 
  saveStoredLoadouts, 
  createNewLoadout,
  addItemToLoadout,
  removeItemFromLoadout,
  updateItemQuantity,
  toggleItemEnabled,
  toggleLoadoutEnabled,
  renameLoadout,
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
import { LoadoutsView } from './components/views/LoadoutsView';
import { InRaidView } from './components/views/InRaidView';
import { CraftingView } from './components/views/CraftingView';

import './styles/main.scss';

export function QuartermasterApp() {
  const { revalidate } = useAuth();

  // Core state
  const [itemsMap, setItemsMap] = useState<ItemsMap | null>(null);
  const [loadouts, setLoadouts] = useState<StoredLoadout[]>([]);
  const [stashItems, setStashItems] = useState<StashItem[]>([]);
  const [currentLoadout, setCurrentLoadout] = useState<CurrentLoadoutItem[]>([]);
  
  // Cached data for timestamps (section 3.4)
  const [cachedStash, setCachedStash] = useState<CachedStash | null>(null);
  const [cachedLoadout, setCachedLoadout] = useState<CachedLoadout | null>(null);

  // UI state
  const [activeView, setActiveView] = useState<ViewId>('loadouts');
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
        
        // Load stored loadouts
        const stored = loadStoredLoadouts(items);
        setLoadouts(stored);

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
    return computePlan(itemsMap, loadouts, stashItems);
  }, [itemsMap, loadouts, stashItems]);

  // Loadout management callbacks
  const handleCreateLoadout = useCallback((name: string) => {
    const newLoadout = createNewLoadout(name);
    const updated = [...loadouts, newLoadout];
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleDeleteLoadout = useCallback((id: string) => {
    const updated = loadouts.filter(l => l.id !== id);
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleToggleLoadout = useCallback((id: string) => {
    const updated = loadouts.map(l => 
      l.id === id ? toggleLoadoutEnabled(l) : l
    );
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleRenameLoadout = useCallback((id: string, name: string) => {
    const updated = loadouts.map(l => 
      l.id === id ? renameLoadout(l, name) : l
    );
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleAddItem = useCallback((loadoutId: string, itemId: string, quantity: number) => {
    const updated = loadouts.map(l => 
      l.id === loadoutId ? addItemToLoadout(l, itemId, quantity) : l
    );
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleRemoveItem = useCallback((loadoutId: string, itemId: string) => {
    const updated = loadouts.map(l => 
      l.id === loadoutId ? removeItemFromLoadout(l, itemId) : l
    );
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleUpdateQuantity = useCallback((loadoutId: string, itemId: string, quantity: number) => {
    const updated = loadouts.map(l => 
      l.id === loadoutId ? updateItemQuantity(l, itemId, quantity) : l
    );
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

  const handleToggleItem = useCallback((loadoutId: string, itemId: string) => {
    const updated = loadouts.map(l => 
      l.id === loadoutId ? toggleItemEnabled(l, itemId) : l
    );
    setLoadouts(updated);
    saveStoredLoadouts(updated);
  }, [loadouts]);

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

      case 'loadouts':
        return (
          <LoadoutsView
            itemsMap={itemsMap}
            loadouts={loadouts}
            onCreateLoadout={handleCreateLoadout}
            onDeleteLoadout={handleDeleteLoadout}
            onToggleLoadout={handleToggleLoadout}
            onRenameLoadout={handleRenameLoadout}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateQuantity={handleUpdateQuantity}
            onToggleItem={handleToggleItem}
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
