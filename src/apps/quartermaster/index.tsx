/**
 * Quartermaster App
 * Loadout, Loot & Craft Planner for ARC Raiders
 * See specification document for full details
 */

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import type { ItemsMap, BenchId } from './types/item';
import type { StoredList } from './types/list';
import type { PlannerResult } from './types/planner';
import type { HideoutModuleDefinition, HideoutToggleState } from './types/hideout';
import type { ProjectDefinition, ProjectToggleState } from './types/project';
import type { QuestDefinition } from './types/quest';
import type { Quest } from '../../shared/types/quest';
import { loadAllItems, loadHideoutDefinitions, loadProjectDefinitions, loadQuestData } from './utils/dataLoader';
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
  itemKey,
} from './utils/hideoutStorage';
import { generateProjectLists } from './utils/projectLists';
import {
  generateQuestLists,
  itemKey as questItemKey,
} from './utils/questLists';
import { formatProjectListName } from './utils/localization';
import {
  cleanupObsoleteProjectToggles,
  itemKey as projectItemKey,
} from './utils/projectStorage';
import {
  syncStashAllPages,
  syncLoadout,
  syncHideout,
  syncBlueprints,
  syncProjects,
  getStash,
  getLoadout,
  getHideout,
  getBlueprints,
  getProjects,
  aggregateOwnedInventory,
  toOwnedItemQuantities,
  getBenchLevels,
  getUnlockedBlueprintItemIds,
  isApiError,
  type CachedStash,
  type CachedLoadout,
  type CachedHideout,
  type CachedBlueprints,
  type CachedProjects,
} from './utils/api';
import { buildItemInsights, type ItemInsightsMap } from './utils/itemInsights';
import { buildModCompatibilityMap, buildOwnedWeaponInstances } from './utils/weaponMods';
import { formatHideoutListName } from './utils/localization';
import { loadActiveView, saveActiveView } from './utils/preferences';
import { useAuth } from '../../shared/context/AuthContext';
import { useCognitoAuth } from '../../shared/context/CognitoAuthContext';
import { useLocale } from '../../shared/context/LocaleContext';
import { SignInNudge } from '../../shared/components/SignInNudge';
import {
  quartermasterStore,
  useStore,
  type QuartermasterState,
} from '../../shared/state/stores';
import { getMe } from '../../shared/services/userApi';
import {
  getQuartermasterGameDataCache,
  syncEmbarkInventory,
  getEmbarkProjects,
  syncEmbarkProjects,
  type EmbarkInventoryDiagnostics,
  type GameDataSource,
} from '../../shared/services/gameDataApi';
import { getCachedLinkedQuestSnapshot, syncArctrackerQuestSnapshot, syncEmbarkQuestSnapshot } from '../../shared/services/linkedQuestApi';
import { withSyncNow } from '../../shared/services/syncNowService';
import type { LinkedQuestSnapshot } from '../../shared/types/linkedQuests';

import { Sidebar, type ViewId } from './components/Sidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { AuthGate } from './components/AuthGate';
import { StashView } from './components/views/StashView';
import { WelcomeView } from './components/views/WelcomeView';
import { ListsView } from './components/views/ListsView';
import { HideoutView } from './components/views/HideoutView';
import { ProjectsView } from './components/views/ProjectsView';
import { InRaidView } from './components/views/InRaidView';
import { CraftingView } from './components/views/CraftingView';
import { QuestsView } from './components/views/QuestsView';
import { WeaponsView } from './components/views/WeaponsView';

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

function countAvailableProjectSubmissions(
  projectLists: StoredList[],
  cachedProjects: CachedProjects | null,
  getOwnedQuantity: (itemId: string) => number | null,
): number {
  if (!cachedProjects) return 0;

  const progressMap = new Map<string, Map<number, boolean>>();
  for (const pp of cachedProjects.projects) {
    const stepMap = new Map<number, boolean>();
    for (const step of pp.steps) {
      stepMap.set(step.index, step.completed);
    }
    progressMap.set(pp.projectId, stepMap);
  }

  let availableCount = 0;

  for (const list of projectLists) {
    const match = /^project_(.+)_(\d+)$/.exec(list.id);
    if (!match) continue;
    const projectId = match[1];
    const stepIndex = parseInt(match[2], 10);

    const stepMap = progressMap.get(projectId);
    if (!stepMap) continue;

    // Find the first incomplete step for this project
    let currentStepIndex: number | null = null;
    const sortedIndices = [...stepMap.keys()].sort((a, b) => a - b);
    for (const idx of sortedIndices) {
      if (!stepMap.get(idx)) {
        currentStepIndex = idx;
        break;
      }
    }

    // Only count if this list is the current step AND all items are owned
    if (stepIndex === currentStepIndex) {
      if (list.items.every((item) => {
        const ownedQuantity = getOwnedQuantity(item.itemId);
        return ownedQuantity !== null && ownedQuantity >= item.quantity;
      })) {
        availableCount++;
      }
    }
  }

  return availableCount;
}

export function QuartermasterApp() {
  const { isAuthenticated, revalidate } = useAuth();
  const cognito = useCognitoAuth();
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
  const [projectDefinitions, setProjectDefinitions] = useState<ProjectDefinition[]>([]);
  const [cachedProjects, setCachedProjects] = useState<CachedProjects | null>(null);

  // Quest state
  const [questDefinitions, setQuestDefinitions] = useState<QuestDefinition[]>([]);
  const [fullQuests, setFullQuests] = useState<Quest[]>([]);
  const [linkedQuestSnapshot, setLinkedQuestSnapshot] = useState<LinkedQuestSnapshot | null>(null);

  const [gameDataSource, setGameDataSource] = useState<GameDataSource>('arctracker');
  const [embarkDiagnostics, setEmbarkDiagnostics] = useState<EmbarkInventoryDiagnostics | null>(null);
  const [embarkEnabled, setEmbarkEnabled] = useState(false);

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
  const [isSyncingEmbarkInventory, setIsSyncingEmbarkInventory] = useState(false);
  const [isSyncingProjects, setIsSyncingProjects] = useState(false);
  const [isSyncingQuests, setIsSyncingQuests] = useState(false);
  const [staleSyncModal, setStaleSyncModal] = useState<{
    sources: string[];
  } | null>(null);
  const lists = useMemo(
    () => itemsMap ? normalizeStoredLists(quartermasterState.lists, itemsMap) : [],
    [itemsMap, quartermasterState.lists]
  );
  const hideoutToggleState = quartermasterState.hideoutToggles;
  const projectToggleState = quartermasterState.projectToggles;
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

        let activeSource: GameDataSource = 'arctracker';
        if (cognito.user) {
          try {
            const me = await getMe();
            activeSource = me.gameDataSource ?? 'arctracker';
            setEmbarkEnabled(me.features?.embarkEnabled === true);
          } catch (profileErr) {
            console.warn('Failed to load game data source:', profileErr);
            setEmbarkEnabled(false);
          }
        } else {
          setEmbarkEnabled(false);
        }
        setGameDataSource(activeSource);

        const cache = await getQuartermasterGameDataCache(activeSource);

        // Load cached stash from IndexedDB (per spec 4.2.2)
        const stash = cache.stash ?? await getStash();
        if (stash) {
          setCachedStash(stash);
        }

        // Load cached loadout from IndexedDB (per spec 4.3.2)
        const loadout = cache.loadout ?? await getLoadout();
        if (loadout) {
          setCachedLoadout(loadout);
        }

        // Load hideout definitions and cached state (CR-004)
        const hideoutDefs = await loadHideoutDefinitions(locale);
        setHideoutDefinitions(hideoutDefs);

        const hideout = cache.hideout ?? await getHideout();
        if (hideout) {
          setCachedHideout(hideout);
        }

        const blueprints = cache.blueprints ?? await getBlueprints();
        if (blueprints) {
          setCachedBlueprints(blueprints);
        }

        // Load project definitions
        const projectDefs = await loadProjectDefinitions(locale);
        setProjectDefinitions(projectDefs);

        // Load quest definitions and linked quest snapshot
        const questResult = await loadQuestData(locale);
        setQuestDefinitions(questResult.definitions);
        setFullQuests(questResult.fullQuests);

        if (cognito.user) {
          try {
            const questSnapshot = await getCachedLinkedQuestSnapshot();
            if (questSnapshot) {
              setLinkedQuestSnapshot(questSnapshot);
            } else {
              setLinkedQuestSnapshot(null);
            }
          } catch {
            setLinkedQuestSnapshot(null);
          }
        } else {
          setLinkedQuestSnapshot(null);
        }

        const cachedProj = activeSource === 'embark'
          ? await getEmbarkProjects()
          : await getProjects();
        if (cachedProj) {
          setCachedProjects(cachedProj);
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize:', err);
        setError(err instanceof Error ? err.message : t('quartermaster.common.unknownError'));
        setLoading(false);
      }
    }
    initialize();
  }, [cognito.user, locale, t]);

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

  // Generate project required-item lists
  const projectLists: StoredList[] = useMemo(() => {
    if (projectDefinitions.length === 0) return [];
    return generateProjectLists(projectDefinitions, cachedProjects, projectToggleState, {
      formatListName: (projectName, stepIndex, stepName) =>
        formatProjectListName(t, projectName, stepIndex, stepName),
      compareText,
    });
  }, [projectDefinitions, cachedProjects, projectToggleState, t, compareText]);

  // Derive completed quest IDs from linked snapshot
  const completedQuestIds: Set<string> = useMemo(() => {
    if (!linkedQuestSnapshot) return new Set();
    const set = new Set<string>();
    for (const [id, entry] of Object.entries(linkedQuestSnapshot.questsById)) {
      if (entry.state === 'completed') {
        set.add(id);
      }
    }
    return set;
  }, [linkedQuestSnapshot]);

  // Generate quest required-item lists
  const questLists: StoredList[] = useMemo(() => {
    if (!itemsMap || questDefinitions.length === 0) return [];
    return generateQuestLists(questDefinitions, completedQuestIds, itemsMap);
  }, [itemsMap, questDefinitions, completedQuestIds, quartermasterState.questToggles]);

  const fullQuestById = useMemo(() => {
    const map = new Map<string, Quest>();
    for (const q of fullQuests) {
      map.set(q.id, q);
    }
    return map;
  }, [fullQuests]);

  // Merge hideout lists before user lists for planner priority.
  const allLists: StoredList[] = useMemo(() => {
    return [...hideoutLists, ...questLists, ...projectLists, ...lists];
  }, [lists, hideoutLists, questLists, projectLists]);

  const ownedItemRows = useMemo(() => {
    if (!itemsMap) return [];
    return aggregateOwnedInventory(cachedStash, cachedLoadout, itemsMap);
  }, [cachedLoadout, cachedStash, itemsMap]);

  const ownedWeaponInstances = useMemo(() => {
    if (!itemsMap) return [];
    return buildOwnedWeaponInstances(cachedStash, cachedLoadout, itemsMap);
  }, [cachedLoadout, cachedStash, itemsMap]);

  const modCompatibilityMap = useMemo(() => {
    if (!itemsMap) return {};
    return buildModCompatibilityMap(itemsMap);
  }, [itemsMap]);

  const ownedItemQuantities = useMemo(() => {
    return toOwnedItemQuantities(ownedItemRows);
  }, [ownedItemRows]);

  // Compute planner result whenever inputs change
  const plannerResult: PlannerResult = useMemo(() => {
    if (!itemsMap) {
      return createEmptyResult();
    }
    return computePlan(itemsMap, allLists, ownedItemQuantities, benchLevels, unlockedBlueprintItemIds, ownedItemRows);
  }, [itemsMap, allLists, ownedItemQuantities, benchLevels, unlockedBlueprintItemIds, ownedItemRows]);

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

  const availableProjectSubmitCount = useMemo(() => {
    return countAvailableProjectSubmissions(projectLists, cachedProjects, getOwnedQuantity);
  }, [cachedProjects, getOwnedQuantity, projectLists]);

  const missingOwnedSources = useMemo(() => {
    const sources: string[] = [];
    if (gameDataSource === 'embark') {
      if (!cachedStash || !cachedLoadout || !cachedHideout || !cachedBlueprints) {
        sources.push(t('quartermaster.globalHeader.embarkInventory'));
      }
      return sources;
    }
    if (!cachedStash) sources.push(t('quartermaster.stash.inventorySource'));
    if (!cachedLoadout) sources.push(t('quartermaster.stash.loadoutSource'));
    return sources;
  }, [cachedBlueprints, cachedHideout, cachedLoadout, cachedStash, gameDataSource, t]);

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
      } else if (err.message === 'token_expired') {
        setSyncError(t('quartermaster.sync.embarkTokenExpired'));
      } else if (err.message === 'not_enabled') {
        setSyncError(t('quartermaster.sync.embarkNotEnabled'));
      } else if (err.status === 429) {
        setSyncError(t('quartermaster.sync.rateLimited'));
      } else {
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

  const handleSyncEmbarkInventory = useCallback(async () => {
    setIsSyncingEmbarkInventory(true);
    setSyncError(null);
    setStaleSyncModal(null);
    try {
      const snapshot = await syncEmbarkInventory();
      setCachedStash(snapshot.stash);
      setCachedLoadout(snapshot.loadout);
      setCachedHideout(snapshot.hideout);
      setCachedBlueprints(snapshot.blueprints);
      setEmbarkDiagnostics(snapshot.diagnostics);

      const cleaned = cleanupObsoleteToggles(hideoutDefinitions, snapshot.hideout, hideoutToggleState);
      patchQuartermasterState({ hideoutToggles: cleaned });
    } catch (err) {
      console.error('Failed to sync Embark inventory:', err);
      handleApiError(err, t('quartermaster.globalHeader.embarkInventory'));
    } finally {
      setIsSyncingEmbarkInventory(false);
    }
  }, [handleApiError, hideoutDefinitions, hideoutToggleState, patchQuartermasterState, t]);

  // Sync callbacks using shared arctrackerApi service (spec 4.2.1, 4.3.1)
  const handleSyncMyItems = useCallback(async () => {
    if (gameDataSource === 'embark') {
      await handleSyncEmbarkInventory();
      return;
    }
    setSyncError(null);
    setStaleSyncModal(null);
    const previousStashSyncedAt = cachedStash?.syncedAt ?? null;
    const previousLoadoutSyncedAt = cachedLoadout?.syncedAt ?? null;
    const unchangedSources: string[] = [];

    setIsSyncingStash(true);
    setMyItemsSyncStep('inventory');
    try {
      const stash = await withSyncNow('stash', () => syncStashAllPages());
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
  }, [cachedLoadout, cachedStash, gameDataSource, handleApiError, handleSyncEmbarkInventory, t]);

  const handleSyncBlueprints = useCallback(async () => {
    if (gameDataSource === 'embark') {
      await handleSyncEmbarkInventory();
      return;
    }
    setIsSyncingBlueprints(true);
    setSyncError(null);
    try {
      const blueprints = await withSyncNow('blueprints', () => syncBlueprints());
      setCachedBlueprints(blueprints);
    } catch (err) {
      console.error('Failed to sync blueprints:', err);
      handleApiError(err, t('quartermaster.common.syncBlueprints'));
    } finally {
      setIsSyncingBlueprints(false);
    }
  }, [gameDataSource, handleApiError, handleSyncEmbarkInventory, t]);

  // Sync hideout (CR-004)
  const handleSyncHideout = useCallback(async () => {
    if (gameDataSource === 'embark') {
      await handleSyncEmbarkInventory();
      return;
    }
    setIsSyncingHideout(true);
    setSyncError(null);
    setStaleSyncModal(null);
    const previousSyncedAt = cachedHideout?.syncedAt ?? null;
    try {
      const hideout = await withSyncNow('hideout', () => syncHideout());
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
  }, [cachedHideout, gameDataSource, handleApiError, handleSyncEmbarkInventory, hideoutDefinitions, hideoutToggleState, patchQuartermasterState, t]);

  // Hideout list toggle handlers (CR-008)
  const handleToggleHideoutList = useCallback((moduleId: string, level: number) => {
    const list = hideoutLists.find(l => l.id === `hideout_${moduleId}_${level}`);
    const anyEnabled = list ? list.items.some(item => item.isEnabled) : true;
    const nextItemEnabled = { ...hideoutToggleState.itemEnabled };

    if (list) {
      for (const item of list.items) {
        nextItemEnabled[itemKey(moduleId, level, item.itemId)] = !anyEnabled;
      }
    }

    patchQuartermasterState({
      hideoutToggles: {
        ...hideoutToggleState,
        itemEnabled: nextItemEnabled,
      },
    });
  }, [hideoutLists, hideoutToggleState, patchQuartermasterState]);

  const handleSetHideoutModuleListsEnabled = useCallback((
    moduleId: string,
    levels: number[],
    isEnabled: boolean,
  ) => {
    const nextItemEnabled = { ...hideoutToggleState.itemEnabled };

    for (const level of levels) {
      const list = hideoutLists.find(l => l.id === `hideout_${moduleId}_${level}`);
      if (list) {
        for (const item of list.items) {
          nextItemEnabled[itemKey(moduleId, level, item.itemId)] = isEnabled;
        }
      }
    }

    patchQuartermasterState({
      hideoutToggles: {
        ...hideoutToggleState,
        itemEnabled: nextItemEnabled,
      },
    });
  }, [hideoutLists, hideoutToggleState, patchQuartermasterState]);

  const handleSetHideoutTrackingMode = useCallback((
    mode: 'enable-all' | 'disable-all' | 'next-only',
  ) => {
    const moduleLevels = new Map(
      cachedHideout?.modules.map(module => [module.moduleId, module.currentLevel]) ?? [],
    );
    const nextItemEnabled = { ...hideoutToggleState.itemEnabled };

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

      for (const item of list.items) {
        nextItemEnabled[itemKey(moduleId, level, item.itemId)] = shouldEnable;
      }
    }

    patchQuartermasterState({
      hideoutToggles: {
        ...hideoutToggleState,
        itemEnabled: nextItemEnabled,
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

  // Project toggle handlers
  const handleToggleProjectList = useCallback((projectId: string, stepIndex: number) => {
    const list = projectLists.find(l => l.id === `project_${projectId}_${stepIndex}`);
    const anyEnabled = list ? list.items.some(item => item.isEnabled) : true;
    const nextItemEnabled = { ...projectToggleState.itemEnabled };

    if (list) {
      for (const item of list.items) {
        nextItemEnabled[projectItemKey(projectId, stepIndex, item.itemId)] = !anyEnabled;
      }
    }

    patchQuartermasterState({
      projectToggles: {
        ...projectToggleState,
        itemEnabled: nextItemEnabled,
      },
    });
  }, [projectLists, projectToggleState, patchQuartermasterState]);

  const handleSetProjectStepsEnabled = useCallback((
    projectId: string,
    stepIndices: number[],
    isEnabled: boolean,
  ) => {
    const nextItemEnabled = { ...projectToggleState.itemEnabled };

    for (const stepIndex of stepIndices) {
      const list = projectLists.find(l => l.id === `project_${projectId}_${stepIndex}`);
      if (list) {
        for (const item of list.items) {
          nextItemEnabled[projectItemKey(projectId, stepIndex, item.itemId)] = isEnabled;
        }
      }
    }

    patchQuartermasterState({
      projectToggles: {
        ...projectToggleState,
        itemEnabled: nextItemEnabled,
      },
    });
  }, [projectLists, projectToggleState, patchQuartermasterState]);

  const handleSetProjectTrackingMode = useCallback((
    mode: 'enable-all' | 'disable-all' | 'next-only',
  ) => {
    const nextItemEnabled = { ...projectToggleState.itemEnabled };

    for (const list of projectLists) {
      const match = /^project_(.+)_(\d+)$/.exec(list.id);
      if (!match) continue;

      const projectId = match[1];
      const stepIndex = parseInt(match[2], 10);

      let shouldEnable = true;
      if (mode === 'disable-all') {
        shouldEnable = false;
      } else if (mode === 'next-only') {
        // Find the first incomplete step for this project
        const stepMap = progressMapForTracking.get(projectId);
        if (stepMap) {
          let currentIdx: number | null = null;
          const sortedIndices = [...stepMap.keys()].sort((a, b) => a - b);
          for (const idx of sortedIndices) {
            if (!stepMap.get(idx)) {
              currentIdx = idx;
              break;
            }
          }
          shouldEnable = stepIndex === currentIdx;
        }
      }

      for (const item of list.items) {
        nextItemEnabled[projectItemKey(projectId, stepIndex, item.itemId)] = shouldEnable;
      }
    }

    patchQuartermasterState({
      projectToggles: {
        ...projectToggleState,
        itemEnabled: nextItemEnabled,
      },
    });
  }, [projectLists, projectToggleState, patchQuartermasterState]);

  const handleToggleProjectItem = useCallback((projectId: string, stepIndex: number, itemId: string) => {
    const ik = projectItemKey(projectId, stepIndex, itemId);
    const updated: ProjectToggleState = {
      ...projectToggleState,
      itemEnabled: {
        ...projectToggleState.itemEnabled,
        [ik]: !(projectToggleState.itemEnabled[ik] ?? true),
      },
    };
    patchQuartermasterState({ projectToggles: updated });
  }, [projectToggleState, patchQuartermasterState]);

  const questToggleState = quartermasterState.questToggles;

  // Quest tracking mode works at item level (not list level)
  const handleSetQuestTrackingMode = useCallback((
    mode: 'enable-all' | 'disable-all',
  ) => {
    const nextItemEnabled: Record<string, boolean> = {};
    for (const list of questLists) {
      const match = /^quest_(.+)$/.exec(list.id);
      if (!match) continue;
      const questId = match[1];
      for (const item of list.items) {
        nextItemEnabled[questItemKey(questId, item.itemId)] = mode === 'enable-all';
      }
    }

    patchQuartermasterState({
      questToggles: {
        ...questToggleState,
        itemEnabled: nextItemEnabled,
      },
    });
  }, [questLists, questToggleState, patchQuartermasterState]);

  const handleToggleQuestItem = useCallback((questId: string, itemId: string) => {
    const ik = questItemKey(questId, itemId);
    const updated = {
      ...questToggleState,
      itemEnabled: {
        ...questToggleState.itemEnabled,
        [ik]: !(questToggleState.itemEnabled[ik] ?? true),
      },
    };
    patchQuartermasterState({ questToggles: updated });
  }, [questToggleState, patchQuartermasterState]);

  const handleSyncQuests = useCallback(async () => {
    setIsSyncingQuests(true);
    try {
      let snapshot: LinkedQuestSnapshot | null = null;

      if (gameDataSource === 'embark') {
        try {
          snapshot = await syncEmbarkQuestSnapshot(linkedQuestSnapshot);
        } catch {
          snapshot = await withSyncNow('quests', () => syncArctrackerQuestSnapshot(linkedQuestSnapshot));
        }
      } else {
        snapshot = await withSyncNow('quests', () => syncArctrackerQuestSnapshot(linkedQuestSnapshot));
      }

      setLinkedQuestSnapshot(snapshot);
    } catch (err) {
      console.warn('Failed to sync quests:', err);
    } finally {
      setIsSyncingQuests(false);
    }
  }, [gameDataSource, linkedQuestSnapshot]);

  // Progress map for tracking mode resolution
  const progressMapForTracking = useMemo(() => {
    const map = new Map<string, Map<number, boolean>>();
    if (!cachedProjects) return map;
    for (const pp of cachedProjects.projects) {
      const stepMap = new Map<number, boolean>();
      for (const step of pp.steps) {
        stepMap.set(step.index, step.completed);
      }
      map.set(pp.projectId, stepMap);
    }
    return map;
  }, [cachedProjects]);

  // Sync projects callback
  const handleSyncProjects = useCallback(async () => {
    setIsSyncingProjects(true);
    setSyncError(null);
    try {
      let projects: CachedProjects;
      if (gameDataSource === 'embark') {
        projects = await syncEmbarkProjects();
      } else {
        projects = await withSyncNow('projects', () => syncProjects());
      }
      setCachedProjects(projects);

      const cleaned = cleanupObsoleteProjectToggles(projects, projectToggleState);
      patchQuartermasterState({ projectToggles: cleaned });
    } catch (err) {
      console.error('Failed to sync projects:', err);
      handleApiError(err, t('quartermaster.projects.syncProjects'));
    } finally {
      setIsSyncingProjects(false);
    }
  }, [gameDataSource, handleApiError, projectToggleState, patchQuartermasterState, t]);

  // Render content based on active view
  // Views requiring stash/loadout are wrapped in AuthGate (per spec section 3.2)
  const renderContent = () => {
    if (!itemsMap) return null;
    const hasEmbarkAccess = gameDataSource === 'embark' && Boolean(cognito.user);
    const withGameDataGate = (children: ReactNode) =>
      hasEmbarkAccess ? <>{children}</> : <AuthGate>{children}</AuthGate>;

    switch (activeView) {
      case 'welcome':
        return <WelcomeView onViewChange={handleViewChange} embarkEnabled={embarkEnabled} />;

      case 'stash':
        return withGameDataGate(
            <StashView
              itemsMap={itemsMap}
              ownedItemRows={ownedItemRows}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
              onSyncMyItems={handleSyncMyItems}
              isSyncing={isSyncingStash || isSyncingLoadout || isSyncingEmbarkInventory}
              syncStep={myItemsSyncStep}
              hasInventoryCache={cachedStash !== null}
              hasLoadoutCache={cachedLoadout !== null}
              showSyncButton={gameDataSource === 'arctracker'}
              unknownEmbarkItems={embarkDiagnostics?.unknownItemInstances ?? []}
            />
        );

      case 'weapons':
        return withGameDataGate(
          <WeaponsView
            itemsMap={itemsMap}
            ownedItemRows={ownedItemRows}
            ownedWeaponInstances={ownedWeaponInstances}
            modCompatibilityMap={modCompatibilityMap}
            plannerResult={plannerResult}
            itemInsights={itemInsights}
            weaponBuilds={quartermasterState.weaponBuilds}
            onWeaponBuildsChange={(weaponBuilds) => patchQuartermasterState({ weaponBuilds })}
            hasInventoryCache={cachedStash !== null}
            hasLoadoutCache={cachedLoadout !== null}
          />
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
        return withGameDataGate(
            <HideoutView
              itemsMap={itemsMap}
              hideoutDefinitions={hideoutDefinitions}
              cachedHideout={cachedHideout}
              hideoutLists={hideoutLists}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
              onSyncHideout={handleSyncHideout}
              isSyncingHideout={isSyncingHideout || isSyncingEmbarkInventory}
              showSyncButton={gameDataSource === 'arctracker'}
              onToggleHideoutList={handleToggleHideoutList}
              onSetHideoutModuleListsEnabled={handleSetHideoutModuleListsEnabled}
              onSetHideoutTrackingMode={handleSetHideoutTrackingMode}
              onToggleHideoutItem={handleToggleHideoutItem}
            />
        );

      case 'projects':
        return withGameDataGate(
            <ProjectsView
              itemsMap={itemsMap}
              projectDefinitions={projectDefinitions}
              cachedProjects={cachedProjects}
              projectLists={projectLists}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
              onSyncProjects={handleSyncProjects}
              isSyncingProjects={isSyncingProjects}
              showSyncButton={true}
              onToggleProjectList={handleToggleProjectList}
              onSetProjectStepsEnabled={handleSetProjectStepsEnabled}
              onSetProjectTrackingMode={handleSetProjectTrackingMode}
              onToggleProjectItem={handleToggleProjectItem}
            />
        );

      case 'quests':
        return (
          <QuestsView
            itemsMap={itemsMap}
            questDefinitions={questDefinitions}
            fullQuestById={fullQuestById}
            questLists={questLists}
            completedQuestIds={completedQuestIds}
            plannerResult={plannerResult}
            itemInsights={itemInsights}
            getOwnedQuantity={getOwnedQuantity}
            hasLinkedSnapshot={linkedQuestSnapshot !== null}
            linkedSource={linkedQuestSnapshot?.source ?? null}
            gameDataSource={gameDataSource}
            onSyncQuests={handleSyncQuests}
            isSyncingQuests={isSyncingQuests}
            onSetQuestTrackingMode={handleSetQuestTrackingMode}
            onToggleQuestItem={handleToggleQuestItem}
          />
        );

      case 'in-raid':
        return withGameDataGate(
            <InRaidView
              itemsMap={itemsMap}
              plannerResult={plannerResult}
              itemInsights={itemInsights}
              getOwnedQuantity={getOwnedQuantity}
            />
        );

      case 'crafting':
        return withGameDataGate(
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
              isSyncingMyItems={isSyncingStash || isSyncingLoadout || isSyncingEmbarkInventory}
              isSyncingBlueprints={isSyncingBlueprints || isSyncingEmbarkInventory}
              blueprintsSyncedAt={cachedBlueprints?.syncedAt ?? null}
              blueprintUnlockCount={blueprintUnlockCount}
              showSyncButtons={gameDataSource === 'arctracker'}
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
          projectAvailableSubmitCount={availableProjectSubmitCount}
          inRaidMissingCount={plannerResult.totalMissingItemsCount}
          craftingActionsCount={plannerResult.totalRecycleActionsCount + plannerResult.totalCraftStepsCount}
        />
        <div className="quartermaster-main">
          <GlobalHeader
            stashSyncedAt={cachedStash?.syncedAt ?? null}
            loadoutSyncedAt={cachedLoadout?.syncedAt ?? null}
            hideoutSyncedAt={cachedHideout?.syncedAt ?? null}
            blueprintsSyncedAt={cachedBlueprints?.syncedAt ?? null}
            projectsSyncedAt={cachedProjects?.syncedAt ?? null}
            questsSyncedAt={linkedQuestSnapshot?.syncedAt ?? null}
            gameDataSource={gameDataSource}
            embarkSyncedAt={gameDataSource === 'embark'
              ? cachedStash?.syncedAt ?? cachedLoadout?.syncedAt ?? cachedHideout?.syncedAt ?? cachedBlueprints?.syncedAt ?? null
              : null}
            embarkUnknownCount={embarkDiagnostics?.unknownGameAssetIds.length ?? 0}
            isSyncingEmbark={isSyncingEmbarkInventory}
            onSyncEmbark={handleSyncEmbarkInventory}
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
          {(isAuthenticated || Boolean(cognito.user)) && ['in-raid', 'crafting'].includes(activeView) && missingOwnedSources.length > 0 && (
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
