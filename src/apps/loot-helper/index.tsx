import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { AccordionList } from './components/AccordionList';
import { loadAllItems } from './utils/dataLoader';
import { loadGoalItems, saveGoalItems, loadDisabledItems, saveDisabledItems, loadStashItems, saveStashItems, loadDisabledStashItems, saveDisabledStashItems } from './utils/storage';
import { buildCraftingTree, buildReverseMap } from './utils/craftingChain';
import { getActiveStashItems } from './utils/stash';
import { trackGoalItemAdded, trackGoalItemRemoved, trackGoalItemToggled, trackStashItemAdded, trackStashItemRemoved, trackStashItemToggled } from './utils/analytics';
import type { ItemsMap } from './types/item';
import type { ReverseMap } from './utils/craftingChain';
import './styles/main.scss';
import './styles/accordion.scss';

export function LootHelperApp() {
  const [itemsMap, setItemsMap] = useState<ItemsMap | null>(null);
  const [goalItemIds, setGoalItemIds] = useState<string[]>([]);
  const [disabledGoalItemIds, setDisabledGoalItemIds] = useState<Set<string>>(new Set());
  const [stashItemIds, setStashItemIds] = useState<Set<string>>(new Set());
  const [disabledStashItemIds, setDisabledStashItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reverseMap, setReverseMap] = useState<ReverseMap>(new Map());

  // Load items on mount
  useEffect(() => {
    loadAllItems()
      .then((items) => {
        setItemsMap(items);
        setGoalItemIds(loadGoalItems());
        setDisabledGoalItemIds(loadDisabledItems());
        setStashItemIds(loadStashItems());
        setDisabledStashItemIds(loadDisabledStashItems());
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load items:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const activeStashItemIds = useMemo(() => {
    return getActiveStashItems(stashItemIds, disabledStashItemIds);
  }, [stashItemIds, disabledStashItemIds]);

  // Build crafting trees and reverse map
  useEffect(() => {
    if (!itemsMap || goalItemIds.length === 0) {
      setReverseMap(new Map());
      return;
    }

    // Build crafting trees only for enabled goal items
    const enabledGoalIds = goalItemIds.filter((id) => !disabledGoalItemIds.has(id));
    
    if (enabledGoalIds.length === 0) {
      setReverseMap(new Map());
      return;
    }

    const trees = enabledGoalIds.map((itemId) =>
      buildCraftingTree(itemId, itemsMap, goalItemIds, activeStashItemIds)
    );

    // Build reverse map for accordion display
    const reverseMapData = buildReverseMap(trees, itemsMap, activeStashItemIds);
    setReverseMap(reverseMapData);
  }, [itemsMap, goalItemIds, disabledGoalItemIds, activeStashItemIds]);

  const handleAddGoalItem = (itemId: string) => {
    if (!goalItemIds.includes(itemId)) {
      const updated = [...goalItemIds, itemId];
      setGoalItemIds(updated);
      saveGoalItems(updated);
      
      // Track analytics
      const item = itemsMap?.[itemId];
      if (item) {
        trackGoalItemAdded(itemId, item.name.en, item.rarity);
      }
    }
  };

  const handleRemoveGoalItem = (itemId: string) => {
    const updated = goalItemIds.filter((id) => id !== itemId);
    setGoalItemIds(updated);
    saveGoalItems(updated);
    
    // Also remove from disabled set
    const newDisabled = new Set(disabledGoalItemIds);
    newDisabled.delete(itemId);
    setDisabledGoalItemIds(newDisabled);
    saveDisabledItems(newDisabled);
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackGoalItemRemoved(itemId, item.name.en, item.rarity);
    }
  };

  const handleToggleGoalItem = (itemId: string) => {
    const newDisabled = new Set(disabledGoalItemIds);
    const wasDisabled = newDisabled.has(itemId);
    if (wasDisabled) {
      newDisabled.delete(itemId);
    } else {
      newDisabled.add(itemId);
    }
    setDisabledGoalItemIds(newDisabled);
    saveDisabledItems(newDisabled);
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackGoalItemToggled(itemId, item.name.en, item.rarity, wasDisabled);
    }
  };

  const handleReorderGoalItems = (reorderedIds: string[]) => {
    setGoalItemIds(reorderedIds);
    saveGoalItems(reorderedIds);
  };

  const handleEnableAllGoalItems = () => {
    const newDisabled = new Set<string>();
    setDisabledGoalItemIds(newDisabled);
    saveDisabledItems(newDisabled);
  };

  const handleDisableAllGoalItems = () => {
    const newDisabled = new Set(goalItemIds);
    setDisabledGoalItemIds(newDisabled);
    saveDisabledItems(newDisabled);
  };

  const handleToggleStashItem = (itemId: string) => {
    // Prevent goal items from being added to stash
    if (goalItemIds.includes(itemId)) {
      return;
    }

    const newStash = new Set(stashItemIds);
    const newDisabledStash = new Set(disabledStashItemIds);
    const wasInStash = newStash.has(itemId);

    if (wasInStash) {
      if (newDisabledStash.has(itemId)) {
        newDisabledStash.delete(itemId);
      } else {
        newStash.delete(itemId);
      }
    } else {
      newStash.add(itemId);
      newDisabledStash.delete(itemId);
    }

    setStashItemIds(newStash);
    setDisabledStashItemIds(newDisabledStash);
    saveStashItems(newStash);
    saveDisabledStashItems(newDisabledStash);
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      if (wasInStash && !newStash.has(itemId)) {
        trackStashItemRemoved(itemId, item.name.en, item.rarity);
      } else if (!wasInStash && newStash.has(itemId)) {
        trackStashItemAdded(itemId, item.name.en, item.rarity);
      }
    }
  };

  const handleToggleDisabledStashItem = (itemId: string) => {
    if (!stashItemIds.has(itemId)) {
      return;
    }

    const newDisabledStash = new Set(disabledStashItemIds);
    const wasDisabled = newDisabledStash.has(itemId);
    if (wasDisabled) {
      newDisabledStash.delete(itemId);
    } else {
      newDisabledStash.add(itemId);
    }

    setDisabledStashItemIds(newDisabledStash);
    saveDisabledStashItems(newDisabledStash);
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackStashItemToggled(itemId, item.name.en, item.rarity, wasDisabled);
    }
  };

  const handleRemoveStashItem = (itemId: string) => {
    const newStash = new Set(stashItemIds);
    newStash.delete(itemId);

    const newDisabledStash = new Set(disabledStashItemIds);
    newDisabledStash.delete(itemId);

    setStashItemIds(newStash);
    setDisabledStashItemIds(newDisabledStash);
    saveStashItems(newStash);
    saveDisabledStashItems(newDisabledStash);
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackStashItemRemoved(itemId, item.name.en, item.rarity);
    }
  };


  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#1a1a1a',
          color: '#e0e0e0',
          fontSize: '18px',
        }}
      >
        Loading item data...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#1a1a1a',
          color: '#e53935',
          fontSize: '18px',
        }}
      >
        Error: {error}
      </div>
    );
  }

  if (!itemsMap) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#1a1a1a',
          color: '#e0e0e0',
          fontSize: '18px',
        }}
      >
        No item data available
      </div>
    );
  }

  return (
    <div className="loot-helper-container">
      <Sidebar
        itemsMap={itemsMap}
        goalItemIds={goalItemIds}
        disabledItemIds={disabledGoalItemIds}
        stashItemIds={stashItemIds}
        disabledStashItemIds={disabledStashItemIds}
        onAddGoalItem={handleAddGoalItem}
        onRemoveGoalItem={handleRemoveGoalItem}
        onToggleGoalItem={handleToggleGoalItem}
        onReorderGoalItems={handleReorderGoalItems}
        onEnableAllGoalItems={handleEnableAllGoalItems}
        onDisableAllGoalItems={handleDisableAllGoalItems}
        onToggleDisabledStashItem={handleToggleDisabledStashItem}
        onRemoveStashItem={handleRemoveStashItem}
      />
      <div className="main-content-area">
        {goalItemIds.length === 0 ? (
          <div className="empty-state">
            Add goal items from the sidebar to see what materials you need to loot.
          </div>
        ) : (
          <AccordionList
            itemsMap={itemsMap}
            goalItemIds={goalItemIds.filter((id) => !disabledGoalItemIds.has(id))}
            reverseMap={reverseMap}
            stashItemIds={activeStashItemIds}
            onToggleStashItem={handleToggleStashItem}
          />
        )}
      </div>
    </div>
  );
}
