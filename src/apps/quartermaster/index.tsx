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
import { fetchStash, fetchCurrentLoadout } from './utils/api';

import { Sidebar, type ViewId } from './components/Sidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { StashView } from './components/views/StashView';
import { CurrentLoadoutView } from './components/views/CurrentLoadoutView';
import { LoadoutsView } from './components/views/LoadoutsView';
import { InRaidView } from './components/views/InRaidView';
import { CraftingView } from './components/views/CraftingView';

import './styles/main.scss';

export function QuartermasterApp() {
  // Core state
  const [itemsMap, setItemsMap] = useState<ItemsMap | null>(null);
  const [loadouts, setLoadouts] = useState<StoredLoadout[]>([]);
  const [stashItems, setStashItems] = useState<StashItem[]>([]);
  const [currentLoadout, setCurrentLoadout] = useState<CurrentLoadoutItem[]>([]);
  
  // Timestamps for sync
  const [stashTimestamp, setStashTimestamp] = useState<Date | null>(null);
  const [loadoutTimestamp, setLoadoutTimestamp] = useState<Date | null>(null);

  // UI state
  const [activeView, setActiveView] = useState<ViewId>('loadouts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingStash, setIsSyncingStash] = useState(false);
  const [isSyncingLoadout, setIsSyncingLoadout] = useState(false);

  // Load items on mount
  useEffect(() => {
    loadAllItems()
      .then((items) => {
        setItemsMap(items);
        // Load stored loadouts after items are loaded
        const stored = loadStoredLoadouts(items);
        setLoadouts(stored);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load items:', err);
        setError(err.message);
        setLoading(false);
      });
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

  // Sync callbacks
  const handleSyncStash = useCallback(async () => {
    setIsSyncingStash(true);
    try {
      const items = await fetchStash();
      // Filter to only known items
      const knownItems = itemsMap 
        ? items.filter(i => itemsMap[i.itemId])
        : items;
      setStashItems(knownItems);
      setStashTimestamp(new Date());
    } catch (err) {
      console.error('Failed to sync stash:', err);
      // Keep existing state on error
    } finally {
      setIsSyncingStash(false);
    }
  }, [itemsMap]);

  const handleSyncLoadout = useCallback(async () => {
    setIsSyncingLoadout(true);
    try {
      const items = await fetchCurrentLoadout();
      // Filter to only known items
      const knownItems = itemsMap 
        ? items.filter(i => itemsMap[i.itemId])
        : items;
      setCurrentLoadout(knownItems);
      setLoadoutTimestamp(new Date());
    } catch (err) {
      console.error('Failed to sync loadout:', err);
      // Keep existing state on error
    } finally {
      setIsSyncingLoadout(false);
    }
  }, [itemsMap]);

  // Render content based on active view
  const renderContent = () => {
    if (!itemsMap) return null;

    switch (activeView) {
      case 'stash':
        return (
          <StashView
            itemsMap={itemsMap}
            stashItems={stashItems}
            plannerResult={plannerResult}
            onSyncStash={handleSyncStash}
            isSyncing={isSyncingStash}
          />
        );

      case 'current-loadout':
        return (
          <CurrentLoadoutView
            itemsMap={itemsMap}
            currentLoadout={currentLoadout}
            plannerResult={plannerResult}
            onSyncLoadout={handleSyncLoadout}
            isSyncing={isSyncingLoadout}
          />
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
          <InRaidView
            itemsMap={itemsMap}
            lootSuggestions={plannerResult.lootSuggestions}
            plannerResult={plannerResult}
          />
        );

      case 'crafting':
        return (
          <CraftingView
            itemsMap={itemsMap}
            craftPlan={plannerResult.craftPlan}
            recyclePlan={plannerResult.recyclePlan}
            onSyncStash={handleSyncStash}
            isSyncing={isSyncingStash}
          />
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
            stashTimestamp={stashTimestamp}
            loadoutTimestamp={loadoutTimestamp}
          />
          <div className="quartermaster-content">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
