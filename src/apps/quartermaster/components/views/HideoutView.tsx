/**
 * Hideout View Component
 * See specification section 4.5 and UX section 4.4
 */

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff, Home, RefreshCw } from 'lucide-react';
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
  onToggleHideoutList: (moduleId: string, level: number) => void;
  onSetHideoutModuleListsEnabled: (moduleId: string, levels: number[], isEnabled: boolean) => void;
  onToggleHideoutItem: (moduleId: string, level: number, itemId: string) => void;
}

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

function getUpgradeLabel(
  moduleName: string,
  level: number,
  unlockLabel: string,
  upgradeToTierLabel: string,
): string {
  return level === 1
    ? `${moduleName}: ${unlockLabel}`
    : `${moduleName}: ${upgradeToTierLabel.replace('{level}', String(level))}`;
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
  onToggleHideoutList,
  onSetHideoutModuleListsEnabled,
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
    const aIndex = HIDEOUT_MODULE_ORDER.indexOf(a.id);
    const bIndex = HIDEOUT_MODULE_ORDER.indexOf(b.id);

    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }

    return compareText(a.name, b.name);
  });
  const hasPendingUpgrades = hideoutLists.length > 0;

  return (
    <div className="hideout-view">
      <div className="hideout-view__header">
        <div>
          <h2>{t('quartermaster.nav.hideout')}</h2>
          <p>{t('quartermaster.hideout.subtitle')}</p>
        </div>
        <button
          className="qm-button qm-button--primary"
          onClick={onSyncHideout}
          disabled={isSyncingHideout}
        >
          <RefreshCw size={16} className={isSyncingHideout ? 'animate-spin' : ''} />
          {t('quartermaster.common.syncHideouts')}
        </button>
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
              const parsedModuleListLevels = moduleLists
                .map(list => parseHideoutListId(list.id)?.level)
                .filter((level): level is number => typeof level === 'number');
              const areAllModuleListsEnabled = moduleLists.every(list => list.isEnabled);

              return (
                <section
                  key={definition.id}
                  className={[
                    'hideout-view__module',
                    isComplete ? 'hideout-view__module--complete' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="hideout-view__module-header">
                    <div className="hideout-view__module-main">
                      {isComplete ? (
                        <div className="hideout-view__module-summary">
                          <span className="hideout-view__module-heading">
                            <span className="hideout-view__module-title">{definition.name}</span>
                          </span>
                          <span className="hideout-view__tier-badge">
                            {t('quartermaster.hideout.tierProgress')
                              .replace('{current}', String(currentLevel))
                              .replace('{max}', String(maxLevel))}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="hideout-view__module-toggle"
                          aria-expanded={isExpanded}
                          onClick={() => {
                            updateCollapsedModules({
                              ...collapsedModules,
                              [definition.id]: !collapsedModules[definition.id],
                            });
                          }}
                        >
                          <span className="hideout-view__module-heading">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            <span className="hideout-view__module-title">{definition.name}</span>
                          </span>
                          <span className="hideout-view__tier-badge">
                            {t('quartermaster.hideout.tierProgress')
                              .replace('{current}', String(currentLevel))
                              .replace('{max}', String(maxLevel))}
                          </span>
                        </button>
                      )}
                    </div>

                    {isComplete ? (
                      <CheckCircle2 className="hideout-view__complete-icon" size={18} />
                    ) : moduleLists.length > 0 && (
                      <button
                        type="button"
                        className="qm-button hideout-view__icon-button"
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
                        onClick={() =>
                          onSetHideoutModuleListsEnabled(
                            definition.id,
                            parsedModuleListLevels,
                            !areAllModuleListsEnabled,
                          )
                        }
                      >
                        {areAllModuleListsEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                  </div>

                  {isExpanded && moduleLists.length > 0 ? (
                    <div className="hideout-view__upgrade-list">
                      {moduleLists.map((list, index) => {
                        const parsed = parseHideoutListId(list.id);
                        const level = parsed?.level ?? 0;
                        const isNext = level === currentLevel + 1;

                        return (
                          <div
                            key={list.id}
                            className={[
                              'hideout-view__upgrade',
                              !list.isEnabled ? 'hideout-view__upgrade--disabled' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            <div className="hideout-view__upgrade-header">
                              <div>
                                <span className="hideout-view__upgrade-title">
                                  {getUpgradeLabel(
                                    definition.name,
                                    level,
                                    t('quartermaster.hideout.unlock'),
                                    t('quartermaster.hideout.upgradeToTierLabel'),
                                  )}
                                </span>
                                {isNext && (
                                  <span className="hideout-view__next-pill">
                                    {t('quartermaster.hideout.next')}
                                  </span>
                                )}
                              </div>
                              <button
                                className="qm-button hideout-view__icon-button"
                                onClick={() => {
                                  if (parsed) onToggleHideoutList(parsed.moduleId, parsed.level);
                                }}
                              >
                                {list.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                              </button>
                            </div>

                            <div className="hideout-view__items">
                              {list.items.map(listItem => {
                                const item = itemsMap[listItem.itemId];
                                if (!item || !parsed) return null;

                                return (
                                  <div
                                    key={`${list.id}-${listItem.itemId}-${index}`}
                                    className={[
                                      'hideout-view__item',
                                      !listItem.isEnabled ? 'hideout-view__item--disabled' : '',
                                    ].filter(Boolean).join(' ')}
                                  >
                                    <button
                                      className="qm-button hideout-view__icon-button"
                                      onClick={() =>
                                        onToggleHideoutItem(parsed.moduleId, parsed.level, listItem.itemId)
                                      }
                                    >
                                      {listItem.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>
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
                                    <div className="hideout-view__item-meta">
                                      <span className="hideout-view__item-name qm-item-name">{item.name}</span>
                                      <span className="hideout-view__qty">{listItem.quantity}x</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : isExpanded && !isComplete ? (
                    <div className="hideout-view__module-empty">
                      {t('quartermaster.hideout.noPendingUpgrades')}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
