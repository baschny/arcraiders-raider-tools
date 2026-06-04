/**
 * Hideout View Component
 * See specification section 4.5 and UX section 4.4
 */

import { useState, type KeyboardEvent } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  Home,
  ListChecks,
  RefreshCw,
} from 'lucide-react';
import type { CachedHideout } from '../../../../shared/types/arctracker';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { ItemIcon } from '../ItemIcon';
import { loadCollapsedHideoutModules, saveCollapsedHideoutModules } from '../../utils/preferences';
import type { HideoutModuleDefinition } from '../../types/hideout';
import type { ItemsMap } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';

interface HideoutViewProps {
  itemsMap: ItemsMap;
  hideoutDefinitions: HideoutModuleDefinition[];
  cachedHideout: CachedHideout | null;
  hideoutLists: StoredList[];
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onSyncHideout: () => void;
  isSyncingHideout: boolean;
  showSyncButton?: boolean;
  onToggleHideoutList: (moduleId: string, level: number) => void;
  onSetHideoutModuleListsEnabled: (moduleId: string, levels: number[], isEnabled: boolean) => void;
  onSetHideoutTrackingMode: (mode: 'enable-all' | 'disable-all' | 'next-only') => void;
  onToggleHideoutItem: (moduleId: string, level: number, itemId: string) => void;
}

type TrackingMode = 'enable-all' | 'disable-all' | 'next-only';

const HIDEOUT_MODULE_ORDER = [
  'scrappy',
  'workbench',
  'refiner',
  'equipment_bench',
  'med_station',
  'utility_bench',
  'explosives_bench',
  'weapon_bench',
];

function parseHideoutListId(listId: string): { moduleId: string; level: number } | null {
  const match = listId.match(/^hideout_(.+)_(\d+)$/);
  if (!match) return null;
  return { moduleId: match[1], level: parseInt(match[2], 10) };
}

function getUpgradeLabel(level: number, unlockLabel: string, tierLabel: string): string {
  return level === 1
    ? unlockLabel
    : tierLabel.replace('{level}', String(level));
}

function getCurrentLevelImage(definition: HideoutModuleDefinition, currentLevel: number): string | null {
  const imageLevel = currentLevel > 0 ? currentLevel : 1;
  return definition.levels.find(level => level.level === imageLevel)?.image ?? null;
}

function getTrackedItemCount(moduleLists: StoredList[]): number {
  const trackedItemIds = new Set<string>();

  for (const list of moduleLists) {
    if (!list.isEnabled) continue;

    for (const item of list.items) {
      if (item.isEnabled) {
        trackedItemIds.add(item.itemId);
      }
    }
  }

  return trackedItemIds.size;
}

function isItemRequirementAvailable(
  getOwnedQuantity: (itemId: string) => number | null,
  itemId: string,
  requiredQuantity: number,
): boolean {
  const ownedQuantity = getOwnedQuantity(itemId);
  return ownedQuantity !== null && ownedQuantity >= requiredQuantity;
}

export function HideoutView({
  itemsMap,
  hideoutDefinitions,
  cachedHideout,
  hideoutLists,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onSyncHideout,
  isSyncingHideout,
  showSyncButton = true,
  onToggleHideoutList,
  onSetHideoutModuleListsEnabled,
  onSetHideoutTrackingMode,
  onToggleHideoutItem,
}: HideoutViewProps) {
  const { t, compareText } = useLocale();
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>(
    () => loadCollapsedHideoutModules(),
  );
  const updateCollapsedModules = (next: Record<string, boolean>) => {
    setCollapsedModules(next);
    saveCollapsedHideoutModules(next);
  };

  const moduleLevels = new Map(
    cachedHideout?.modules.map(module => [module.moduleId, module.currentLevel]) ?? [],
  );

  const getExpectedEnabledForMode = (mode: TrackingMode, listId: string): boolean => {
    const parsed = parseHideoutListId(listId);
    if (!parsed) return false;
    if (mode === 'enable-all') return true;
    if (mode === 'disable-all') return false;
    return parsed.level === (moduleLevels.get(parsed.moduleId) ?? 0) + 1;
  };

  const currentMode: TrackingMode | 'custom' = (() => {
    if (hideoutLists.length === 0) return 'disable-all';

    const modes: TrackingMode[] = ['disable-all', 'next-only', 'enable-all'];
    for (const mode of modes) {
      const matches = hideoutLists.every(list =>
        list.isEnabled === getExpectedEnabledForMode(mode, list.id),
      );
      if (matches) return mode;
    }
    return 'custom';
  })();

    const isNextRedundant = hideoutLists.length === 0 || hideoutLists.every(list =>
      getExpectedEnabledForMode('next-only', list.id) === getExpectedEnabledForMode('enable-all', list.id),
    );

  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  const moduleState = new Map(cachedHideout?.modules.map(module => [module.moduleId, module]) ?? []);
  const listsByModuleId = new Map<string, StoredList[]>();

  for (const list of hideoutLists) {
    const parsed = parseHideoutListId(list.id);
    if (!parsed) continue;

    const moduleLists = listsByModuleId.get(parsed.moduleId) ?? [];
    moduleLists.push(list);
    listsByModuleId.set(parsed.moduleId, moduleLists);
  }

  for (const moduleLists of listsByModuleId.values()) {
    moduleLists.sort((a, b) => {
      const aParsed = parseHideoutListId(a.id);
      const bParsed = parseHideoutListId(b.id);
      return (aParsed?.level ?? 0) - (bParsed?.level ?? 0);
    });
  }

  const sortedDefinitions = [...hideoutDefinitions].sort((a, b) => {
    // 1. Completion status (incomplete first)
    const aModule = moduleState.get(a.id);
    const bModule = moduleState.get(b.id);
    const aComplete = (aModule?.currentLevel ?? 0) >= (aModule?.maxLevel ?? a.maxLevel);
    const bComplete = (bModule?.currentLevel ?? 0) >= (bModule?.maxLevel ?? b.maxLevel);

    if (aComplete !== bComplete) {
      return aComplete ? 1 : -1;
    }

    // 2. Predefined order
    const aIndex = HIDEOUT_MODULE_ORDER.indexOf(a.id);
    const bIndex = HIDEOUT_MODULE_ORDER.indexOf(b.id);

    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }

    // 3. Alphabetical fallback
    return compareText(a.name, b.name);
  });
  const hasPendingUpgrades = hideoutLists.length > 0;
  const setAllModulesCollapsed = (isCollapsed: boolean) => {
    const next: Record<string, boolean> = {};
    for (const definition of sortedDefinitions) {
      const cachedModule = moduleState.get(definition.id);
      const currentLevel = cachedModule?.currentLevel ?? 0;
      const maxLevel = cachedModule?.maxLevel ?? definition.maxLevel;
      if (currentLevel < maxLevel) {
        next[definition.id] = isCollapsed;
      }
    }
    updateCollapsedModules(next);
  };
  const runTrackingAction = (mode: TrackingMode) => {
    onSetHideoutTrackingMode(mode);
  };

  return (
    <div className="hideout-view">
      <div className="hideout-view__controls">
        {showSyncButton && (
          <button
            className="qm-button"
            onClick={onSyncHideout}
            disabled={isSyncingHideout}
            title={t('quartermaster.hideout.syncTooltip')}
          >
            <RefreshCw size={16} className={isSyncingHideout ? 'animate-spin' : ''} />
            <span className="hideout-view__button-text hideout-view__button-text--sync-full">
              {t('quartermaster.common.syncHideouts')}
            </span>
          </button>
        )}

        <div className="hideout-view__tracking">
          <span className="hideout-view__tracking-label">{t('quartermaster.hideout.tracking')}</span>
          <div className="qm-segmented-control">
            <button
              type="button"
              className={['qm-segmented-control__button', currentMode === 'disable-all' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => runTrackingAction('disable-all')}
              disabled={!hasPendingUpgrades}
              title={t('quartermaster.hideout.disableAllTooltip')}
            >
              <EyeOff size={14} />
              <span className="hideout-view__button-text hideout-view__button-text--secondary">
                {t('quartermaster.hideout.disableAll')}
              </span>
            </button>

            {!isNextRedundant && (
              <button
                type="button"
                className={['qm-segmented-control__button', currentMode === 'next-only' ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => runTrackingAction('next-only')}
                disabled={!hasPendingUpgrades}
                title={t('quartermaster.hideout.nextOnlyTooltip')}
              >
                <ListChecks size={14} />
                <span className="hideout-view__button-text hideout-view__button-text--secondary">
                  {t('quartermaster.hideout.nextOnly')}
                </span>
              </button>
            )}

            <button
              type="button"
              className={['qm-segmented-control__button', currentMode === 'enable-all' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => runTrackingAction('enable-all')}
              disabled={!hasPendingUpgrades}
              title={t('quartermaster.hideout.enableAllTooltip')}
            >
              <Eye size={14} />
              <span className="hideout-view__button-text hideout-view__button-text--secondary">
                {t('quartermaster.hideout.enableAll')}
              </span>
            </button>
          </div>
        </div>

        <div className="hideout-view__actions">
          <button
            type="button"
            className="qm-button qm-button--ghost"
            onClick={() => setAllModulesCollapsed(true)}
            disabled={!cachedHideout}
            title={t('quartermaster.hideout.collapseAllTooltip')}
          >
            <ChevronsUp size={16} />
            <span className="hideout-view__button-text hideout-view__button-text--action">
              {t('quartermaster.hideout.collapseAll')}
            </span>
          </button>

          <button
            type="button"
            className="qm-button qm-button--ghost"
            onClick={() => setAllModulesCollapsed(false)}
            disabled={!cachedHideout}
            title={t('quartermaster.hideout.expandAllTooltip')}
          >
            <ChevronsDown size={16} />
            <span className="hideout-view__button-text hideout-view__button-text--action">
              {t('quartermaster.hideout.expandAll')}
            </span>
          </button>
        </div>
      </div>

      {!cachedHideout ? (
        <div className="qm-empty-state hideout-view__empty">
          <Home size={48} />
          <p>{t('quartermaster.hideout.syncPrompt')}</p>
        </div>
      ) : (
        <>
          {!hasPendingUpgrades && (
            <div className="hideout-view__complete-banner">
              <CheckCircle2 size={18} />
              {t('quartermaster.hideout.allComplete')}
            </div>
          )}

          <div className="hideout-view__modules">
            {sortedDefinitions.map(definition => {
              const cachedModule = moduleState.get(definition.id);
              const currentLevel = cachedModule?.currentLevel ?? 0;
              const maxLevel = cachedModule?.maxLevel ?? definition.maxLevel;
              const isComplete = currentLevel >= maxLevel;
              const moduleLists = listsByModuleId.get(definition.id) ?? [];
              const isExpanded = !collapsedModules[definition.id];
              const currentLevelImage = getCurrentLevelImage(definition, currentLevel);
              const parsedModuleListLevels = moduleLists
                .map(list => parseHideoutListId(list.id)?.level)
                .filter((level): level is number => typeof level === 'number');
              const areAllModuleListsEnabled = moduleLists.every(list => list.isEnabled);
              const areAllModuleListsDisabled = moduleLists.every(list => !list.isEnabled);
              const isModuleDisabled = !isComplete && moduleLists.length > 0 && areAllModuleListsDisabled;
              const trackedItemCount = getTrackedItemCount(moduleLists);
              const hasAvailableNextUpgrade = moduleLists.some((list) => {
                const parsed = parseHideoutListId(list.id);
                return parsed?.level === currentLevel + 1 && list.items.every(listItem =>
                  isItemRequirementAvailable(getOwnedQuantity, listItem.itemId, listItem.quantity),
                );
              });
              const toggleModuleCollapsed = () => {
                if (isComplete) return;
                updateCollapsedModules({
                  ...collapsedModules,
                  [definition.id]: !collapsedModules[definition.id],
                });
              };
              const handleModuleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggleModuleCollapsed();
              };

              return (
                <section
                  key={definition.id}
                  className={[
                    'hideout-view__module',
                    isComplete ? 'hideout-view__module--complete' : '',
                    isModuleDisabled ? 'hideout-view__module--disabled' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div
                    className={[
                      'hideout-view__module-header',
                      !isComplete ? 'hideout-view__module-header--clickable' : '',
                    ].filter(Boolean).join(' ')}
                    role={!isComplete ? 'button' : undefined}
                    tabIndex={!isComplete ? 0 : undefined}
                    aria-expanded={!isComplete ? isExpanded : undefined}
                    onClick={toggleModuleCollapsed}
                    onKeyDown={handleModuleHeaderKeyDown}
                  >
                    <span className="hideout-view__bench-image" aria-hidden="true">
                      {currentLevelImage && (
                        <img src={currentLevelImage} alt="" />
                      )}
                    </span>

                    <div className="hideout-view__module-main">
                      {!isComplete && moduleLists.length > 0 && (
                        <button
                          type="button"
                          className="qm-button hideout-view__icon-button hideout-view__bench-toggle"
                          title={
                            areAllModuleListsEnabled
                              ? t('quartermaster.hideout.disableBenchTooltip')
                              : t('quartermaster.hideout.enableBenchTooltip')
                          }
                          aria-label={
                            areAllModuleListsEnabled
                              ? t('quartermaster.hideout.disableBenchTooltip')
                              : t('quartermaster.hideout.enableBenchTooltip')
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onSetHideoutModuleListsEnabled(
                              definition.id,
                              parsedModuleListLevels,
                              !areAllModuleListsEnabled,
                            );
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {areAllModuleListsEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                      {isComplete && (
                        <span
                          className="hideout-view__icon-button hideout-view__bench-toggle hideout-view__complete-icon"
                          title={t('quartermaster.hideout.maxTierTooltip')}
                          aria-label={t('quartermaster.hideout.maxTierTooltip')}
                          role="img"
                        >
                          <CheckCircle2 size={18} />
                        </span>
                      )}

                      <span className="hideout-view__module-title">{definition.name}</span>
                      <span className="hideout-view__tier-badge">
                        {t('quartermaster.hideout.tierProgress')
                          .replace('{current}', String(currentLevel))
                          .replace('{max}', String(maxLevel))}
                      </span>
                      {!isComplete && (
                        <span
                          className="hideout-view__tracking-badge"
                          title={t('quartermaster.hideout.trackedItemsTooltip')}
                        >
                          {t('quartermaster.hideout.trackedItems').replace('{count}', String(trackedItemCount))}
                        </span>
                      )}
                      {hasAvailableNextUpgrade && (
                        <span
                          className="hideout-view__upgrade-available-badge"
                          title={t('quartermaster.hideout.upgradeAvailableTooltip')}
                        >
                          {t('quartermaster.hideout.upgradeAvailable')}
                        </span>
                      )}
                    </div>

                    {!isComplete && (
                      <span className="hideout-view__collapse-icon" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </span>
                    )}
                  </div>

                  {!isComplete && (
                    <div
                      className={[
                        'hideout-view__accordion',
                        isExpanded ? 'hideout-view__accordion--open' : '',
                      ].filter(Boolean).join(' ')}
                      aria-hidden={!isExpanded}
                      inert={!isExpanded ? true : undefined}
                    >
                      <div className="hideout-view__accordion-inner">
                        {moduleLists.length > 0 ? (
                          <div className="hideout-view__upgrade-list">
                            {moduleLists.map((list, index) => {
                              const parsed = parseHideoutListId(list.id);
                              const level = parsed?.level ?? 0;
                              const isNext = level === currentLevel + 1;
                              const isTierAvailable = list.items.every(listItem =>
                                isItemRequirementAvailable(getOwnedQuantity, listItem.itemId, listItem.quantity),
                              );

                              return (
                                <div
                                  key={list.id}
                                  className={[
                                    'hideout-view__upgrade',
                                    !list.isEnabled ? 'hideout-view__upgrade--disabled' : '',
                                    isTierAvailable ? 'hideout-view__upgrade--complete' : '',
                                    isNext ? 'hideout-view__upgrade--next' : '',
                                    list.items.length === 1 ? 'hideout-view__upgrade--single' : '',
                                  ].filter(Boolean).join(' ')}
                                >
                                  <div className="hideout-view__upgrade-header">
                                    <div className="hideout-view__upgrade-heading">
                                      <button
                                        className="qm-button hideout-view__icon-button hideout-view__upgrade-toggle"
                                        onClick={() => {
                                          if (parsed) onToggleHideoutList(parsed.moduleId, parsed.level);
                                        }}
                                        title={
                                          list.isEnabled
                                            ? t('quartermaster.hideout.disableTierTooltip')
                                            : t('quartermaster.hideout.enableTierTooltip')
                                        }
                                      >
                                        {list.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                                      </button>
                                      <span className="hideout-view__upgrade-title">
                                        {getUpgradeLabel(
                                          level,
                                          t('quartermaster.hideout.unlock'),
                                          t('quartermaster.hideout.tierLabel'),
                                        )}
                                      </span>
                                    </div>
                                    <div className="hideout-view__upgrade-badges">
                                      {isTierAvailable && (
                                        <span className="hideout-view__complete-pill">
                                          {t('quartermaster.hideout.completed')}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="hideout-view__items">
                                    {list.items.map(listItem => {
                                      const item = itemsMap[listItem.itemId];
                                      if (!item || !parsed) return null;
                                      const isRequirementAvailable = isItemRequirementAvailable(
                                        getOwnedQuantity,
                                        listItem.itemId,
                                        listItem.quantity,
                                      );
                                      const owned = getOwnedQuantity(listItem.itemId) ?? 0;
                                      const deficit = Math.max(0, listItem.quantity - owned);

                                      return (
                                        <div
                                          key={`${list.id}-${listItem.itemId}-${index}`}
                                          className={[
                                            'hideout-view__item',
                                            !listItem.isEnabled ? 'hideout-view__item--disabled' : '',
                                            isRequirementAvailable ? 'hideout-view__item--complete' : '',
                                          ].filter(Boolean).join(' ')}
                                          role="button"
                                          tabIndex={0}
                                          title={
                                            listItem.isEnabled
                                              ? t('quartermaster.hideout.disableItemTooltip')
                                              : t('quartermaster.hideout.enableItemTooltip')
                                          }
                                          onClick={() =>
                                            onToggleHideoutItem(parsed.moduleId, parsed.level, listItem.itemId)
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                            event.preventDefault();
                                            onToggleHideoutItem(parsed.moduleId, parsed.level, listItem.itemId);
                                          }}
                                        >
                                          <div className="hideout-view__item-icon-wrapper">
                                            <ItemIcon
                                              itemId={item.id}
                                              name={item.name}
                                              icon={item.icon}
                                              rarity={item.rarity}
                                              quantity={getOwnedQuantity(item.id)}
                                              size="sm"
                                              showName={false}
                                              tooltipContext={tooltipContext}
                                            />
                                            {deficit > 0 && (
                                              <span className="hideout-view__item-missing-badge">
                                                {deficit}
                                              </span>
                                            )}
                                            {isRequirementAvailable && (
                                              <span
                                                className="hideout-view__item-complete"
                                                title={t('quartermaster.hideout.itemCompleteTooltip')}
                                                aria-label={t('quartermaster.hideout.itemCompleteTooltip')}
                                              >
                                                <CheckCircle2 size={12} />
                                              </span>
                                            )}
                                          </div>
                                          <span className="hideout-view__item-name qm-item-name">{item.name}</span>
                                          <span className="hideout-view__item-progress">
                                            {owned} / {listItem.quantity}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="hideout-view__module-empty">
                            {t('quartermaster.hideout.noPendingUpgrades')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
