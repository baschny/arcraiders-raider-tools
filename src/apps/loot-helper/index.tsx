import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { AccordionList } from './components/AccordionList';
import { loadAllItems } from './utils/dataLoader';
import { buildCraftingTree, buildReverseMap } from './utils/craftingChain';
import { getActiveStashItems } from './utils/stash';
import { trackGoalItemAdded, trackGoalItemRemoved, trackGoalItemToggled, trackStashItemAdded, trackStashItemRemoved, trackStashItemToggled } from './utils/analytics';
import type { ItemsMap } from './types/item';
import type { ReverseMap } from './utils/craftingChain';
import { useLocale } from '../../shared/context/LocaleContext';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { SignInNudge } from '../../shared/components/SignInNudge';
import { lootStore, useStore, type LootState } from '../../shared/state/stores';
import { getItemDisplayName } from './utils/localization';
import './styles/main.scss';
import './styles/accordion.scss';

export function LootHelperApp() {
  const { locale, t } = useLocale();
  const [lootState, setLootState] = useStore(lootStore);
  const [itemsMap, setItemsMap] = useState<ItemsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reverseMap, setReverseMap] = useState<ReverseMap>(new Map());

  const goalItemIds = lootState.goalItems;
  const disabledGoalItemIds = useMemo(
    () => new Set(lootState.disabledItems),
    [lootState.disabledItems]
  );
  const stashItemIds = useMemo(
    () => new Set(lootState.stashItems),
    [lootState.stashItems]
  );
  const disabledStashItemIds = useMemo(
    () => new Set(lootState.disabledStashItems),
    [lootState.disabledStashItems]
  );
  const patchLootState = (next: Partial<LootState>) => {
    setLootState({ ...lootStore.get(), ...next });
  };

  // Load items on mount
  useEffect(() => {
    loadAllItems(locale)
      .then((items) => {
        setItemsMap(items);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load items:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [locale]);

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
      patchLootState({ goalItems: updated });
      
      // Track analytics
      const item = itemsMap?.[itemId];
      if (item) {
        trackGoalItemAdded(itemId, getItemDisplayName(item), item.rarity);
      }
    }
  };

  const handleRemoveGoalItem = (itemId: string) => {
    const updated = goalItemIds.filter((id) => id !== itemId);
    
    // Also remove from disabled set
    const newDisabled = new Set(disabledGoalItemIds);
    newDisabled.delete(itemId);
    patchLootState({
      goalItems: updated,
      disabledItems: Array.from(newDisabled),
    });
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackGoalItemRemoved(itemId, getItemDisplayName(item), item.rarity);
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
    patchLootState({ disabledItems: Array.from(newDisabled) });
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackGoalItemToggled(itemId, getItemDisplayName(item), item.rarity, wasDisabled);
    }
  };

  const handleReorderGoalItems = (reorderedIds: string[]) => {
    patchLootState({ goalItems: reorderedIds });
  };

  const handleEnableAllGoalItems = () => {
    const newDisabled = new Set<string>();
    patchLootState({ disabledItems: Array.from(newDisabled) });
  };

  const handleDisableAllGoalItems = () => {
    const newDisabled = new Set(goalItemIds);
    patchLootState({ disabledItems: Array.from(newDisabled) });
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

    patchLootState({
      stashItems: Array.from(newStash),
      disabledStashItems: Array.from(newDisabledStash),
    });
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      if (wasInStash && !newStash.has(itemId)) {
        trackStashItemRemoved(itemId, getItemDisplayName(item), item.rarity);
      } else if (!wasInStash && newStash.has(itemId)) {
        trackStashItemAdded(itemId, getItemDisplayName(item), item.rarity);
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

    patchLootState({ disabledStashItems: Array.from(newDisabledStash) });
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackStashItemToggled(itemId, getItemDisplayName(item), item.rarity, wasDisabled);
    }
  };

  const handleRemoveStashItem = (itemId: string) => {
    const newStash = new Set(stashItemIds);
    newStash.delete(itemId);

    const newDisabledStash = new Set(disabledStashItemIds);
    newDisabledStash.delete(itemId);

    patchLootState({
      stashItems: Array.from(newStash),
      disabledStashItems: Array.from(newDisabledStash),
    });
    
    // Track analytics
    const item = itemsMap?.[itemId];
    if (item) {
      trackStashItemRemoved(itemId, getItemDisplayName(item), item.rarity);
    }
  };


  if (loading) {
    return <LoadingSpinner message={t('lootHelper.loading')} />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  if (!itemsMap) {
    return <ErrorDisplay message={t('lootHelper.noData')} />;
  }

  return (
    <div className="loot-helper-layout">
      <SignInNudge />
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
              {t('lootHelper.emptyState')}
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
    </div>
  );
}
