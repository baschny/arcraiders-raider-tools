/**
 * Quartermaster App
 * Loadout, Loot & Craft Planner for ARC Raiders
 * See specification document for full details
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ItemsMap, BenchId } from './types/item';
import type { StoredList } from './types/list';
import type { PlannerResult } from './types/planner';
import type { HideoutModuleDefinition, HideoutToggleState } from './types/hideout';
import { loadAllItems, loadHideoutDefinitions } from './utils/dataLoader';
import {
  normalizeStoredLists,
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
import { generateHideoutLists } from './utils/hideoutLists';
import {
  cleanupObsoleteToggles,
  listKey,
  itemKey,
} from './utils/hideoutStorage';
import {
  syncStashAllPages,
  syncLoadout,
  syncHideout,
  syncBlueprints,
  getStash,
  getLoadout,
  getHideout,
  getBlueprints,
  aggregateOwnedInventory,
  toOwnedItemQuantities,
  getBenchLevels,
  getUnlockedBlueprintItemIds,
  isApiError,
  type CachedStash,
  type CachedLoadout,
  type CachedHideout,
  type CachedBlueprints,
} from './utils/api';
import { buildItemInsights, type ItemInsightsMap } from './utils/itemInsights';
import { formatHideoutListName } from './utils/localization';
import { loadActiveView, saveActiveView } from './utils/preferences';
import { useAuth } from '../../shared/context/AuthContext';
import { useLocale } from '../../shared/context/LocaleContext';
import { SignInNudge } from '../../shared/components/SignInNudge';
import {
  quartermasterStore,
  useStore,
  type QuartermasterState,
} from '../../shared/state/stores';

import { Sidebar, type ViewId } from './components/Sidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { AuthGate } from './components/AuthGate';
import { StashView } from './components/views/StashView';
import { WelcomeView } from './components/views/WelcomeView';
import { ListsView } from './components/views/ListsView';
import { HideoutView } from './components/views/HideoutView';
import { InRaidView } from './components/views/InRaidView';
import { CraftingView } from './components/views/CraftingView';

import './styles/main.scss';

function parseHideoutListId(listId: string): { moduleId: string; level: number } | null {
  const match = /^hideout_(.+)_(\d+)$/.exec(listId);
  if (!match) return null;
  return { moduleId: match[1], level: parseInt(match[2], 10) };
}

function countAvailableNextHideoutUpgrades(
  hideoutLists: StoredList[],
  cachedHideout: CachedHideout | null,
  getOwnedQuantity: (itemId: string) => number | null,
): number {
  if (!cachedHideout) return 0;

  const moduleLevels = new Map(
    cachedHideout.modules.map(module => [module.moduleId, module.currentLevel]),
  );
  let availableCount = 0;

  for (const list of hideoutLists) {
    const parsed = parseHideoutListId(list.id);
    if (!parsed || parsed.level !== (moduleLevels.get(parsed.moduleId) ?? 0) + 1) {
      continue;
    }

    if (list.items.every(item => {
      const ownedQuantity = getOwnedQuantity(item.itemId);
      return ownedQuantity !== null && ownedQuantity >= item.quantity;
    })) {
      availableCount++;
    }
  }

  return availableCount;
}

export function QuartermasterApp() {
  const { isAuthenticated, revalidate } = useAuth();
  const { locale, t, tm, compareText } = useLocale();
  const [quartermasterState, setQuartermasterState] = useStore(quartermasterStore);

  // Core state
  const [itemsMap, setItemsMap] = useState<ItemsMap | null>(null);
  
  // Cached data for timestamps (section 3.4)
  const [cachedStash, setCachedStash] = useState<CachedStash | null>(null);
  const [cachedLoadout, setCachedLoadout] = useState<CachedLoadout | null>(null);

  // Hideout state (CR-004, CR-007)
  const [hideoutDefinitions, setHideoutDefinitions] = useState<HideoutModuleDefinition[]>([]);
  const [cachedHideout, setCachedHideout] = useState<CachedHideout | null>(null);
  const [cachedBlueprints, setCachedBlueprints] = useState<CachedBlueprints | null>(null);

  // UI state
  const [activeView, setActiveView] = useState<ViewId>(() => loadActiveView());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncingStash, setIsSyncingStash] = useState(false);
  const [isSyncingLoadout, setIsSyncingLoadout] = useState(false);
  const [myItemsSyncStep, setMyItemsSyncStep] = useState<'inventory' | 'loadout' | null>(null);
  const [isSyncingHideout, setIsSyncingHideout] = useState(false);
  const [isSyncingBlueprints, setIsSyncingBlueprints] = useState(false);
  const [staleSyncModal, setStaleSyncModal] = useState<{
    sources: string[];
  } | null>(null);
  const lists = useMemo(
    () => itemsMap ? normalizeStoredLists(quartermasterState.lists, itemsMap) : [],
    [itemsMap, quartermasterState.lists]
  );
  const hideoutToggleState = quartermasterState.hideoutToggles;
  const patchQuartermasterState = useCallback((next: Partial<QuartermasterState>) => {
    setQuartermasterState({ ...quartermasterStore.get(), ...next });
  }, [setQuartermasterState]);

  const handleViewChange = useCallback((view: ViewId) => {
    setActiveView(view);
    saveActiveView(view);
  }, []);

  // Load items and cached data on mount
  useEffect(() => {
    async function initialize() {
      try {
        // Load static items first
        const items = await loadAllItems(locale);
        setItemsMap(items);

        // Load cached stash from IndexedDB (per spec 4.2.2)
        const stash = await getStash();
        if (stash) {
          setCachedStash(stash);
        }

        // Load cached loadout from IndexedDB (per spec 4.3.2)
        const loadout = await getLoadout();
        if (loadout) {
          setCachedLoadout(loadout);
        }

        // Load hideout definitions and cached state (CR-004)
        const hideoutDefs = await loadHideoutDefinitions(locale);
        setHideoutDefinitions(hideoutDefs);

        const hideout = await getHideout();
        if (hideout) {
          setCachedHideout(hideout);
        }

        const blueprints = await getBlueprints();
        if (blueprints) {
          setCachedBlueprints(blueprints);
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize:', err);
        setError(err instanceof Error ? err.message : t('quartermaster.common.unknownError'));
        setLoading(false);
      }
    }
    initialize();
  }, [locale, t]);

  // Derive bench levels from cached hideout (CR-005)
  const benchLevels: Record<BenchId, number> = useMemo(() => {
    return getBenchLevels(cachedHideout);
  }, [cachedHideout]);

  const unlockedBlueprintItemIds = useMemo(() => {
    return getUnlockedBlueprintItemIds(cachedBlueprints);
  }, [cachedBlueprints]);

  const blueprintUnlockCount = useMemo(() => {
    if (!cachedBlueprints) return null;

    return {
      unlocked: cachedBlueprints.unlockedItemIds.length,
      total: Object.keys(cachedBlueprints.blueprintsByTargetItemId).length,
    };
  }, [cachedBlueprints]);

  // Generate hideout upgrade lists (CR-007)
  const hideoutLists: StoredList[] = useMemo(() => {
    if (!cachedHideout || hideoutDefinitions.length === 0) return [];
    return generateHideoutLists(hideoutDefinitions, cachedHideout, hideoutToggleState, {
      formatListName: (moduleName, level, isNext) =>
        formatHideoutListName(t, moduleName, level, isNext),
      compareText,
    });
  }, [hideoutDefinitions, cachedHideout, hideoutToggleState, t, compareText]);

  // Merge hideout lists before user lists for planner priority.
  const allLists: StoredList[] = useMemo(() => {
    return [...hideoutLists, ...lists];
  }, [lists, hideoutLists]);

  const ownedItemRows = useMemo(() => {
    if (!itemsMap) return [];
    return aggregateOwnedInventory(cachedStash, cachedLoadout, itemsMap);
  }, [cachedLoadout, cachedStash, itemsMap]);

  const ownedItemQuantities = useMemo(() => {
    return toOwnedItemQuantities(ownedItemRows);
  }, [ownedItemRows]);

  // Compute planner result whenever inputs change
  const plannerResult: PlannerResult = useMemo(() => {
    if (!itemsMap) {
      return createEmptyResult();
    }
    return computePlan(itemsMap, allLists, ownedItemQuantities, benchLevels, unlockedBlueprintItemIds);
  }, [itemsMap, allLists, ownedItemQuantities, benchLevels, unlockedBlueprintItemIds]);

  const hasOwnedQuantities = cachedStash !== null && cachedLoadout !== null;
  const ownedQuantityByItemId = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of ownedItemQuantities) {
      totals[item.itemId] = (totals[item.itemId] ?? 0) + item.quantity;
    }
    return totals;
  }, [ownedItemQuantities]);

  const getOwnedQuantity = useCallback((itemId: string): number | null => {
    if (!hasOwnedQuantities) return null;
    return ownedQuantityByItemId[itemId] ?? 0;
  }, [hasOwnedQuantities, ownedQuantityByItemId]);

  const availableHideoutUpgradeCount = useMemo(() => {
    return countAvailableNextHideoutUpgrades(hideoutLists, cachedHideout, getOwnedQuantity);
  }, [cachedHideout, getOwnedQuantity, hideoutLists]);

  const missingOwnedSources = useMemo(() => {
    const sources: string[] = [];
    if (!cachedStash) sources.push(t('quartermaster.stash.inventorySource'));
    if (!cachedLoadout) sources.push(t('quartermaster.stash.loadoutSource'));
    return sources;
  }, [cachedLoadout, cachedStash, t]);

  const itemInsights: ItemInsightsMap = useMemo(() => {
    if (!itemsMap) return {};
    return buildItemInsights(itemsMap, plannerResult);
  }, [itemsMap, plannerResult]);

  // List management callbacks
  const handleCreateList = useCallback((name: string) => {
    const newList = createNewList(name);
    const updated = [...lists, newList];
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleDeleteList = useCallback((id: string) => {
    const updated = lists.filter(l => l.id !== id);
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleToggleList = useCallback((id: string) => {
    const updated = lists.map(l =>
      l.id === id ? toggleListEnabled(l) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleRenameList = useCallback((id: string, name: string) => {
    const updated = lists.map(l =>
      l.id === id ? renameList(l, name) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleAddItem = useCallback((listId: string, itemId: string, quantity: number) => {
    const updated = lists.map(l =>
      l.id === listId ? addItemToList(l, itemId, quantity) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleRemoveItem = useCallback((listId: string, itemId: string) => {
    const updated = lists.map(l =>
      l.id === listId ? removeItemFromList(l, itemId) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleUpdateQuantity = useCallback((listId: string, itemId: string, quantity: number) => {
    const updated = lists.map(l =>
      l.id === listId ? updateItemQuantity(l, itemId, quantity) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleToggleItem = useCallback((listId: string, itemId: string) => {
    const updated = lists.map(l =>
      l.id === listId ? toggleItemEnabled(l, itemId) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  const handleReorderLists = useCallback((reorderedLists: StoredList[]) => {
    patchQuartermasterState({ lists: reorderedLists });
  }, [patchQuartermasterState]);

  const handleReorderItems = useCallback((listId: string, reorderedItemIds: string[]) => {
    const updated = lists.map(l =>
      l.id === listId ? reorderListItems(l, reorderedItemIds) : l
    );
    patchQuartermasterState({ lists: updated });
  }, [lists, patchQuartermasterState]);

  /**
   * Handle API errors per spec section 4.2.3 / 4.3.3
   */
  const handleApiError = useCallback((err: unknown, operation: string) => {
    if (isApiError(err)) {
      if (err.status === 401) {
        if (err.message === 'No authentication token available') {
          setSyncError(t('quartermaster.sync.sessionExpired'));
          revalidate();
        } else {
          setSyncError(tm('quartermaster.sync.failed', { operation, message: err.message }));
        }
      } else if (err.status === 429 || err.isRetryable) {
        // Show warning for rate limit or retryable errors
        setSyncError(t('quartermaster.sync.rateLimited'));
      } else {
        // Other errors
        setSyncError(tm('quartermaster.sync.failed', { operation, message: err.message }));
      }
    } else {
      setSyncError(
        tm('quartermaster.sync.failed', {
          operation,
          message: err instanceof Error ? err.message : t('quartermaster.common.unknownError'),
        }),
      );
    }
    // Do NOT clear cache on failure (per spec 4.2.3)
  }, [revalidate, t, tm]);

  // Sync callbacks using shared arctrackerApi service (spec 4.2.1, 4.3.1)
  const handleSyncMyItems = useCallback(async () => {
    setSyncError(null);
    setStaleSyncModal(null);
    const previousStashSyncedAt = cachedStash?.syncedAt ?? null;
    const previousLoadoutSyncedAt = cachedLoadout?.syncedAt ?? null;
    const unchangedSources: string[] = [];

    setIsSyncingStash(true);
    setMyItemsSyncStep('inventory');
    try {
      const stash = await syncStashAllPages();
      setCachedStash(stash);
      if (previousStashSyncedAt && stash.syncedAt === previousStashSyncedAt) {
        unchangedSources.push(t('quartermaster.stash.inventorySource'));
      }
    } catch (err) {
      console.error('Failed to sync stash:', err);
      handleApiError(err, t('quartermaster.common.syncInventory'));
      setMyItemsSyncStep(null);
      return;
    } finally {
      setIsSyncingStash(false);
    }

    setIsSyncingLoadout(true);
    setMyItemsSyncStep('loadout');
    try {
      const loadout = await syncLoadout();
      setCachedLoadout(loadout);
      if (previousLoadoutSyncedAt && loadout.syncedAt === previousLoadoutSyncedAt) {
        unchangedSources.push(t('quartermaster.stash.loadoutSource'));
      }
    } catch (err) {
      console.error('Failed to sync loadout:', err);
      handleApiError(err, t('quartermaster.common.syncLoadout'));
    } finally {
      setIsSyncingLoadout(false);
      setMyItemsSyncStep(null);
    }

    if (unchangedSources.length > 0) {
      setStaleSyncModal({ sources: unchangedSources });
    }
  }, [cachedLoadout, cachedStash, handleApiError, t]);

  const handleSyncBlueprints = useCallback(async () => {
    setIsSyncingBlueprints(true);
    setSyncError(null);
    try {
      const blueprints = await syncBlueprints();
      setCachedBlueprints(blueprints);
    } catch (err) {
      console.error('Failed to sync blueprints:', err);
      handleApiError(err, t('quartermaster.common.syncBlueprints'));
    } finally {
      setIsSyncingBlueprints(false);
    }
  }, [handleApiError, t]);

  // Sync hideout (CR-004)
  const handleSyncHideout = useCallback(async () => {
    setIsSyncingHideout(true);
    setSyncError(null);
    setStaleSyncModal(null);
    const previousSyncedAt = cachedHideout?.syncedAt ?? null;
    try {
      const hideout = await syncHideout();
      setCachedHideout(hideout);
      if (previousSyncedAt && hideout.syncedAt === previousSyncedAt) {
        setStaleSyncModal({
          sources: [t('quartermaster.nav.hideout')],
        });
      }

      // Clean up obsolete toggles after progression
      const cleaned = cleanupObsoleteToggles(hideoutDefinitions, hideout, hideoutToggleState);
      patchQuartermasterState({ hideoutToggles: cleaned });
    } catch (err) {
      console.error('Failed to sync hideout:', err);
      handleApiError(err, t('quartermaster.common.syncHideout'));
    } finally {
      setIsSyncingHideout(false);
    }
  }, [cachedHideout, hideoutDefinitions, hideoutToggleState, handleApiError, patchQuartermasterState, t]);

  // Hideout list toggle handlers (CR-008)
  const handleToggleHideoutList = useCallback((moduleId: string, level: number) => {
    const lk = listKey(moduleId, level);
    const updated: HideoutToggleState = {
      ...hideoutToggleState,
      listEnabled: {
        ...hideoutToggleState.listEnabled,
        [lk]: !(hideoutToggleState.listEnabled[lk] ?? true),
      },
    };
    patchQuartermasterState({ hideoutToggles: updated });
  }, [hideoutToggleState, patchQuartermasterState]);

  const handleSetHideoutModuleListsEnabled = useCallback((
    moduleId: string,
    levels: number[],
    isEnabled: boolean,
  ) => {
    const nextListEnabled = { ...hideoutToggleState.listEnabled };
    for (const level of levels) {
      nextListEnabled[listKey(moduleId, level)] = isEnabled;
    }

    patchQuartermasterState({
      hideoutToggles: {
        ...hideoutToggleState,
        listEnabled: nextListEnabled,
      },
    });
  }, [hideoutToggleState, patchQuartermasterState]);

  const handleSetHideoutTrackingMode = useCallback((
    mode: 'enable-all' | 'disable-all' | 'next-only',
  ) => {
    const moduleLevels = new Map(
      cachedHideout?.modules.map(module => [module.moduleId, module.currentLevel]) ?? [],
    );
    const nextListEnabled = { ...hideoutToggleState.listEnabled };

    for (const list of hideoutLists) {
      const match = /^hideout_(.+)_(\d+)$/.exec(list.id);
      if (!match) continue;

      const moduleId = match[1];
      const level = parseInt(match[2], 10);
      const shouldEnable = mode === 'enable-all'
        ? true
        : mode === 'disable-all'
          ? false
          : level === (moduleLevels.get(moduleId) ?? 0) + 1;

      nextListEnabled[listKey(moduleId, level)] = shouldEnable;
    }

    patchQuartermasterState({
      hideoutToggles: {
        ...hideoutToggleState,
        listEnabled: nextListEnabled,
      },
    });
  }, [cachedHideout, hideoutLists, hideoutToggleState, patchQuartermasterState]);

  const handleToggleHideoutItem = useCallback((moduleId: string, level: number, itemId: string) => {
    const ik = itemKey(moduleId, level, itemId);
    const updated: HideoutToggleState = {
      ...hideoutToggleState,
      itemEnabled: {
        ...hideoutToggleState.itemEnabled,
        [ik]: !(hideoutToggleState.itemEnabled[ik] ?? true),
      },
    };
    patchQuartermasterState({ hideoutToggles: updated });
  }, [hideoutToggleState, patchQuartermasterState]);

  // Render content based on active view
  // Views requiring stash/loadout are wrapped in AuthGate (per spec section 3.2)
  const renderContent = () => {
    if (!itemsMap) return null;

    switch (activeView) {
      case 'welcome':
        return <WelcomeView onViewChange={handleViewChange} />;

      case 'stash':
        return (
          <AuthGate>
            <StashView
              itemsMap={itemsMap}
              ownedItemRows={ownedItemRows}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
              onSyncMyItems={handleSyncMyItems}
              isSyncing={isSyncingStash || isSyncingLoadout}
              syncStep={myItemsSyncStep}
              hasInventoryCache={cachedStash !== null}
              hasLoadoutCache={cachedLoadout !== null}
            />
          </AuthGate>
        );

      case 'lists':
        return (
          <ListsView
            itemsMap={itemsMap}
            lists={lists}
            plannerResult={plannerResult}
            itemInsights={itemInsights}
            getOwnedQuantity={getOwnedQuantity}
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

      case 'hideout':
        return (
          <AuthGate>
            <HideoutView
              itemsMap={itemsMap}
              hideoutDefinitions={hideoutDefinitions}
              cachedHideout={cachedHideout}
              hideoutLists={hideoutLists}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
              onSyncHideout={handleSyncHideout}
              isSyncingHideout={isSyncingHideout}
              onToggleHideoutList={handleToggleHideoutList}
              onSetHideoutModuleListsEnabled={handleSetHideoutModuleListsEnabled}
              onSetHideoutTrackingMode={handleSetHideoutTrackingMode}
              onToggleHideoutItem={handleToggleHideoutItem}
            />
          </AuthGate>
        );

      case 'in-raid':
        return (
          <AuthGate>
            <InRaidView
              itemsMap={itemsMap}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
            />
          </AuthGate>
        );

      case 'crafting':
        return (
          <AuthGate>
            <CraftingView
              itemsMap={itemsMap}
              craftPlan={plannerResult.craftPlan}
              weaponUpgradePlan={plannerResult.weaponUpgradePlan}
              recyclePlan={plannerResult.recyclePlan}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
              onSyncMyItems={handleSyncMyItems}
              onSyncBlueprints={handleSyncBlueprints}
              isSyncingMyItems={isSyncingStash || isSyncingLoadout}
              isSyncingBlueprints={isSyncingBlueprints}
              blueprintsSyncedAt={cachedBlueprints?.syncedAt ?? null}
              blueprintUnlockCount={blueprintUnlockCount}
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
        <div className="qm-loading">{t('quartermaster.loading')}</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
        <div className="quartermaster-container">
        <div className="qm-error">{t('shared.errorPrefix')}: {error}</div>
      </div>
    );
  }

  return (
    <div className="quartermaster-container">
      <div className="quartermaster-layout">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          hideoutAvailableUpgradeCount={availableHideoutUpgradeCount}
        />
        <div className="quartermaster-main">
          <GlobalHeader
            plannerResult={plannerResult}
            stashSyncedAt={cachedStash?.syncedAt ?? null}
            loadoutSyncedAt={cachedLoadout?.syncedAt ?? null}
          />
          {activeView !== 'welcome' && <SignInNudge />}
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
          {isAuthenticated && ['in-raid', 'crafting'].includes(activeView) && missingOwnedSources.length > 0 && (
            <div className="qm-sync-hint">
              <span>
                {tm('quartermaster.sync.myItemsRequired', { sources: missingOwnedSources.join(', ') })}
              </span>
              <button
                type="button"
                className="qm-button qm-button--small"
                onClick={() => handleViewChange('stash')}
              >
                {t('quartermaster.stash.syncMyItems')}
              </button>
            </div>
          )}
          <div className="quartermaster-content">
            {renderContent()}
          </div>
        </div>
      </div>
      {staleSyncModal && (
        <div className="qm-modal-backdrop" role="presentation">
          <div
            className="qm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qm-stale-sync-title"
          >
            <h3 id="qm-stale-sync-title">{t('quartermaster.sync.staleTitle')}</h3>
            <p>
              {tm('quartermaster.sync.staleBody', {
                sources: staleSyncModal.sources.join(', '),
              })}
            </p>
            <div className="qm-modal__actions">
              <a
                href="https://arctracker.io/stash"
                className="qm-button qm-button--primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('quartermaster.sync.openArcTrackerStash')}
              </a>
              <button
                type="button"
                className="qm-button"
                onClick={() => setStaleSyncModal(null)}
              >
                {t('quartermaster.sync.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
