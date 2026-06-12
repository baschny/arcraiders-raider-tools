/**
 * Projects View Component
 * Mirrors HideoutView for project required-item tracking
 */

import { useState, type KeyboardEvent } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  ListChecks,
  Lock,
  Play,
  RefreshCw,
} from 'lucide-react';
import type { ProjectDefinition, CachedProjects } from '../../types/project';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { ItemIcon } from '../ItemIcon';
import type { ItemsMap } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';

interface ProjectsViewProps {
  itemsMap: ItemsMap;
  projectDefinitions: ProjectDefinition[];
  cachedProjects: CachedProjects | null;
  projectLists: StoredList[];
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  onSyncProjects: () => void;
  isSyncingProjects: boolean;
  showSyncButton?: boolean;
  onToggleProjectList: (projectId: string, stepIndex: number) => void;
  onSetProjectStepsEnabled: (projectId: string, stepIndices: number[], isEnabled: boolean) => void;
  onSetProjectTrackingMode: (mode: 'enable-all' | 'disable-all' | 'next-only') => void;
  onToggleProjectItem: (projectId: string, stepIndex: number, itemId: string) => void;
}

type TrackingMode = 'enable-all' | 'disable-all' | 'next-only';

function parseProjectListId(listId: string): { projectId: string; stepIndex: number } | null {
  const match = listId.match(/^project_(.+)_(\d+)$/);
  if (!match) return null;
  return { projectId: match[1], stepIndex: parseInt(match[2], 10) };
}

function getTrackedItemCount(projectLists: StoredList[]): number {
  const trackedItemIds = new Set<string>();

  for (const list of projectLists) {
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

export function ProjectsView({
  itemsMap,
  projectDefinitions,
  cachedProjects,
  projectLists,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  onSyncProjects,
  isSyncingProjects,
  showSyncButton = true,
  onToggleProjectList,
  onSetProjectStepsEnabled,
  onSetProjectTrackingMode,
  onToggleProjectItem,
}: ProjectsViewProps) {
  const { t, formatNumber, compareText } = useLocale();
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const setAllProjectsCollapsed = (isCollapsed: boolean) => {
    const next: Record<string, boolean> = {};
    for (const def of projectDefinitions) {
      const isComplete = getIsProjectComplete(def.id);
      if (!isComplete) {
        next[def.id] = isCollapsed;
      }
    }
    setCollapsedProjects(next);
  };

  const progressByProjectId = new Map<string, Map<number, boolean>>();
  const projectCompletedMap = new Map<string, boolean>();

  if (cachedProjects) {
    for (const pp of cachedProjects.projects) {
      const stepMap = new Map<number, boolean>();
      let allComplete = true;
      for (const step of pp.steps) {
        stepMap.set(step.index, step.completed);
        if (!step.completed) allComplete = false;
      }
      progressByProjectId.set(pp.projectId, stepMap);
      projectCompletedMap.set(pp.projectId, allComplete);
    }
  }

  function getIsProjectComplete(projectId: string): boolean {
    return projectCompletedMap.get(projectId) ?? false;
  }

  function getFirstIncompleteStepIndex(projectId: string): number | null {
    const stepMap = progressByProjectId.get(projectId);
    if (!stepMap) return projectLists
      .filter((l) => parseProjectListId(l.id)?.projectId === projectId)
      .map((l) => parseProjectListId(l.id)?.stepIndex ?? 0)
      .sort((a, b) => a - b)[0] ?? null;

    for (const [index, completed] of stepMap) {
      if (!completed) return index;
    }
    return null;
  }

  const listsByProjectId = new Map<string, StoredList[]>();
  for (const list of projectLists) {
    const parsed = parseProjectListId(list.id);
    if (!parsed) continue;
    const projectLists_ = listsByProjectId.get(parsed.projectId) ?? [];
    projectLists_.push(list);
    listsByProjectId.set(parsed.projectId, projectLists_);
  }

  for (const projLists of listsByProjectId.values()) {
    projLists.sort((a, b) => {
      const aParsed = parseProjectListId(a.id);
      const bParsed = parseProjectListId(b.id);
      return (aParsed?.stepIndex ?? 0) - (bParsed?.stepIndex ?? 0);
    });
  }

  const getExpectedEnabledForMode = (mode: TrackingMode, projectId: string, stepIndex: number): boolean => {
    if (mode === 'enable-all') return true;
    if (mode === 'disable-all') return false;
    const currentStep = getFirstIncompleteStepIndex(projectId);
    return stepIndex === currentStep;
  };

  const currentMode: TrackingMode | 'custom' = (() => {
    if (projectLists.length === 0) return 'disable-all';

    const modes: TrackingMode[] = ['disable-all', 'next-only', 'enable-all'];
    for (const mode of modes) {
      const matches = projectLists.every((list) => {
        const parsed = parseProjectListId(list.id);
        if (!parsed) return true;
        return list.isEnabled === getExpectedEnabledForMode(
          mode,
          parsed.projectId,
          parsed.stepIndex,
        );
      });
      if (matches) return mode;
    }
    return 'custom';
  })();

  const isNextRedundant = projectLists.length === 0 || projectLists.every((list) => {
    const parsed = parseProjectListId(list.id);
    if (!parsed) return true;
    return getExpectedEnabledForMode('next-only', parsed.projectId, parsed.stepIndex)
      === getExpectedEnabledForMode('enable-all', parsed.projectId, parsed.stepIndex);
  });

  const sortedDefinitions = [...projectDefinitions]
    .filter((def) => listsByProjectId.has(def.id))
    .sort((a, b) => {
      const aComplete = getIsProjectComplete(a.id);
      const bComplete = getIsProjectComplete(b.id);
      if (aComplete !== bComplete) return aComplete ? 1 : -1;
      return compareText(a.name, b.name);
    });

  const hasPendingSteps = projectLists.length > 0;

  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  return (
    <div className="projects-view">
      <div className="projects-view__controls">
        {showSyncButton && (
          <button
            className="qm-button"
            onClick={onSyncProjects}
            disabled={isSyncingProjects}
            title={t('quartermaster.projects.syncTooltip')}
          >
            <RefreshCw size={16} className={isSyncingProjects ? 'animate-spin' : ''} />
            <span className="projects-view__button-text projects-view__button-text--sync-full">
              {t('quartermaster.projects.syncProjects')}
            </span>
            <span className="projects-view__button-text projects-view__button-text--sync-short">
              {t('quartermaster.common.sync')}
            </span>
          </button>
        )}

        <div className="projects-view__tracking">
          <span className="projects-view__tracking-label">{t('quartermaster.projects.tracking')}</span>
          <div className="qm-segmented-control">
            <button
              type="button"
              className={['qm-segmented-control__button', currentMode === 'disable-all' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => onSetProjectTrackingMode('disable-all')}
              disabled={!hasPendingSteps}
              title={t('quartermaster.projects.disableAllTooltip')}
            >
              <EyeOff size={14} />
              <span className="projects-view__button-text projects-view__button-text--secondary">
                {t('quartermaster.projects.disableAll')}
              </span>
            </button>

            {!isNextRedundant && (
              <button
                type="button"
                className={['qm-segmented-control__button', currentMode === 'next-only' ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => onSetProjectTrackingMode('next-only')}
                disabled={!hasPendingSteps}
                title={t('quartermaster.projects.nextOnlyTooltip')}
              >
                <ListChecks size={14} />
                <span className="projects-view__button-text projects-view__button-text--secondary">
                  {t('quartermaster.projects.nextOnly')}
                </span>
              </button>
            )}

            <button
              type="button"
              className={['qm-segmented-control__button', currentMode === 'enable-all' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => onSetProjectTrackingMode('enable-all')}
              disabled={!hasPendingSteps}
              title={t('quartermaster.projects.enableAllTooltip')}
            >
              <Eye size={14} />
              <span className="projects-view__button-text projects-view__button-text--secondary">
                {t('quartermaster.projects.enableAll')}
              </span>
            </button>
          </div>
        </div>

        <div className="projects-view__actions">
          <button
            type="button"
            className="qm-button qm-button--ghost"
            onClick={() => setAllProjectsCollapsed(true)}
            disabled={projectLists.length === 0}
            title={t('quartermaster.projects.collapseAllTooltip')}
          >
            <ChevronsUp size={16} />
            <span className="projects-view__button-text projects-view__button-text--action">
              {t('quartermaster.projects.collapseAll')}
            </span>
          </button>

          <button
            type="button"
            className="qm-button qm-button--ghost"
            onClick={() => setAllProjectsCollapsed(false)}
            disabled={projectLists.length === 0}
            title={t('quartermaster.projects.expandAllTooltip')}
          >
            <ChevronsDown size={16} />
            <span className="projects-view__button-text projects-view__button-text--action">
              {t('quartermaster.projects.expandAll')}
            </span>
          </button>
        </div>
      </div>

      {!cachedProjects && projectLists.length === 0 ? (
        <div className="qm-empty-state projects-view__empty">
          <BriefcaseBusiness size={48} />
          <p>{t('quartermaster.projects.syncPrompt')}</p>
        </div>
      ) : projectLists.length === 0 ? (
        <div className="qm-empty-state projects-view__empty">
          <BriefcaseBusiness size={48} />
          <p>{t('quartermaster.projects.noProjectsAvailable')}</p>
        </div>
      ) : (
        <>

          <div className="projects-view__modules">
            {sortedDefinitions.map((definition) => {
              const isProjectComplete = getIsProjectComplete(definition.id);
              const projLists = listsByProjectId.get(definition.id) ?? [];
              const isExpanded = !collapsedProjects[definition.id];
              const areAllListsEnabled = projLists.every((l) => l.isEnabled);
              const areAllListsDisabled = projLists.every((l) => !l.isEnabled);
              const isProjectDisabled = !isProjectComplete && projLists.length > 0 && areAllListsDisabled;
              const currentStepIndex = getFirstIncompleteStepIndex(definition.id);
              const trackedItemCount = getTrackedItemCount(projLists);

              const hasAvailableSubmit = projLists.some((list) => {
                const parsed = parseProjectListId(list.id);
                if (parsed?.stepIndex !== currentStepIndex) return false;

                const allItemsAvailable = list.items.every((li) => {
                  const isAlreadySubmitted = li.submitted !== undefined && li.required !== undefined
                    && li.submitted >= li.required;
                  if (isAlreadySubmitted) return true;
                  return isItemRequirementAvailable(getOwnedQuantity, li.itemId, li.quantity);
                });
                if (!allItemsAvailable) return false;

                return list.items.some((li) => {
                  const isAlreadySubmitted = li.submitted !== undefined && li.required !== undefined
                    && li.submitted >= li.required;
                  return !isAlreadySubmitted;
                });
              });

              const parsedStepIndices = projLists
                .map((l) => parseProjectListId(l.id)?.stepIndex)
                .filter((s): s is number => typeof s === 'number');

              const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (!isProjectComplete) toggleProjectCollapsed(definition.id);
              };

              return (
                <section
                  key={definition.id}
                  className={[
                    'projects-view__module',
                    isProjectComplete ? 'projects-view__module--complete' : '',
                    isProjectDisabled ? 'projects-view__module--disabled' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div
                    className={[
                      'projects-view__module-header',
                      !isProjectComplete ? 'projects-view__module-header--clickable' : '',
                    ].filter(Boolean).join(' ')}
                    role={!isProjectComplete ? 'button' : undefined}
                    tabIndex={!isProjectComplete ? 0 : undefined}
                    aria-expanded={!isProjectComplete ? isExpanded : undefined}
                    onClick={() => {
                      if (!isProjectComplete) toggleProjectCollapsed(definition.id);
                    }}
                    onKeyDown={handleHeaderKeyDown}
                  >
                    <div className="projects-view__module-main">
                      {!isProjectComplete && projLists.length > 0 && (
                        <button
                          type="button"
                          className="qm-button projects-view__icon-button projects-view__project-toggle"
                          title={
                            areAllListsEnabled
                              ? t('quartermaster.projects.disableProjectTooltip')
                              : t('quartermaster.projects.enableProjectTooltip')
                          }
                          aria-label={
                            areAllListsEnabled
                              ? t('quartermaster.projects.disableProjectTooltip')
                              : t('quartermaster.projects.enableProjectTooltip')
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onSetProjectStepsEnabled(
                              definition.id,
                              parsedStepIndices,
                              !areAllListsEnabled,
                            );
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {areAllListsEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                      {isProjectComplete && (
                        <span
                          className="projects-view__icon-button projects-view__project-toggle projects-view__complete-icon"
                          title={t('quartermaster.hideout.maxTierTooltip')}
                          aria-label={t('quartermaster.hideout.maxTierTooltip')}
                          role="img"
                        >
                          <CheckCircle2 size={18} />
                        </span>
                      )}

                      <span className="projects-view__module-title">{definition.name}</span>
                      {!isProjectComplete && (
                        <span
                          className="projects-view__tracking-badge"
                          title={t('quartermaster.projects.trackedItemsTooltip')}
                        >
                          {t('quartermaster.projects.trackedItems').replace('{count}', String(trackedItemCount))}
                        </span>
                      )}
                      {hasAvailableSubmit && (
                        <span
                          className="projects-view__submit-available-badge"
                          title={t('quartermaster.projects.submitAvailableTooltip')}
                        >
                          {t('quartermaster.projects.submitAvailable')}
                        </span>
                      )}
                    </div>

                    {!isProjectComplete && (
                      <span className="projects-view__collapse-icon" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </span>
                    )}
                  </div>

                  {!isProjectComplete && (
                    <div
                      className={[
                        'projects-view__accordion',
                        isExpanded ? 'projects-view__accordion--open' : '',
                      ].filter(Boolean).join(' ')}
                      aria-hidden={!isExpanded}
                      inert={!isExpanded ? true : undefined}
                    >
                      <div className="projects-view__accordion-inner">
                        {projLists.length > 0 ? (
                          <div className="projects-view__step-list">
                            {projLists.map((list) => {
                              const parsed = parseProjectListId(list.id);
                              const stepIndex = parsed?.stepIndex ?? 0;
                              const isCurrent = stepIndex === currentStepIndex;
                              const stepCompleted = progressByProjectId.get(definition.id)?.get(stepIndex) ?? false;
                              const priorIndices = projectDefinitions
                                .find((d) => d.id === definition.id)?.phases
                                .filter((p) => p.index < stepIndex)
                                .map((p) => p.index) ?? [];
                              const allPriorComplete = priorIndices.every(
                                (idx) => progressByProjectId.get(definition.id)?.get(idx) ?? false,
                              );
                              const isCompleted = allPriorComplete && stepCompleted;
                              const isStepAvailable = !isCompleted && isCurrent && list.items.every((li) =>
                                isItemRequirementAvailable(getOwnedQuantity, li.itemId, li.quantity),
                              );

                              const isFuture = currentStepIndex !== null && stepIndex > currentStepIndex;

                              return (
                                <div
                                  key={list.id}
                                  className={[
                                    'projects-view__step-row',
                                    !list.isEnabled && !isCompleted ? 'projects-view__step-row--disabled' : '',
                                    isCompleted ? 'projects-view__step-row--complete' : '',
                                    isCurrent ? 'projects-view__step-row--current' : '',
                                    isFuture ? 'projects-view__step-row--locked' : '',
                                  ].filter(Boolean).join(' ')}
                                >
                                  <div className="projects-view__step-row-header">
                                    {!isCompleted && (
                                      <button
                                        className="qm-button projects-view__icon-button projects-view__step-toggle"
                                        onClick={() => {
                                          if (parsed) onToggleProjectList(parsed.projectId, parsed.stepIndex);
                                        }}
                                        title={
                                          list.isEnabled
                                            ? t('quartermaster.projects.disableStepTooltip')
                                            : t('quartermaster.projects.enableStepTooltip')
                                        }
                                      >
                                        {list.isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                                      </button>
                                    )}
                                    <span className="projects-view__step-title">{list.name}</span>
                                    <div className="projects-view__row-badges">
                                      {isCurrent && !isCompleted && (
                                        <span className="projects-view__active-pill">
                                          <Play size={12} />
                                          {t('quartermaster.projects.active')}
                                        </span>
                                      )}
                                      {currentStepIndex !== null && stepIndex > currentStepIndex && (
                                        <span className="projects-view__lock-pill">
                                          <Lock size={12} />
                                          {t('quartermaster.projects.locked')}
                                        </span>
                                      )}
                                      {isCompleted && (
                                        <span className="projects-view__complete-pill">
                                          <CheckCircle2 size={12} />
                                          {t('quartermaster.hideout.completed')}
                                        </span>
                                      )}
                                      {isStepAvailable && (
                                        <span className="projects-view__submit-pill">
                                          {t('quartermaster.projects.submitAvailable')}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="projects-view__items">
                                    {list.items.map((listItem, idx) => {
                                      const item = itemsMap[listItem.itemId];
                                      if (!item || !parsed) return null;
                                      const isRequirementAvailable = isItemRequirementAvailable(
                                        getOwnedQuantity,
                                        listItem.itemId,
                                        listItem.quantity,
                                      );
                                      const owned = getOwnedQuantity(listItem.itemId) ?? 0;
                                      const deficit = Math.max(0, listItem.quantity - owned);
                                      const hasProgress = listItem.submitted !== undefined && listItem.required !== undefined;
                                      const isFullySubmitted = hasProgress && listItem.submitted! >= listItem.required!;
                                      const showCheckmark = isRequirementAvailable && !isFullySubmitted;

                                      const isItemDone = isCompleted || isFullySubmitted;

                                      const interactiveItemProps = isItemDone
                                        ? {}
                                        : {
                                            role: 'button' as const,
                                            tabIndex: 0,
                                            title: listItem.isEnabled
                                              ? t('quartermaster.projects.disableItemTooltip')
                                              : t('quartermaster.projects.enableItemTooltip'),
                                            onClick: () =>
                                              onToggleProjectItem(parsed.projectId, parsed.stepIndex, listItem.itemId),
                                            onKeyDown: (event: React.KeyboardEvent) => {
                                              if (event.key !== 'Enter' && event.key !== ' ') return;
                                              event.preventDefault();
                                              onToggleProjectItem(parsed.projectId, parsed.stepIndex, listItem.itemId);
                                            },
                                          };

                                      return (
                                        <div
                                          key={`${list.id}-${listItem.itemId}-${idx}`}
                                          className={[
                                            'projects-view__item',
                                            !listItem.isEnabled && !isItemDone ? 'projects-view__item--disabled' : '',
                                            isRequirementAvailable && !isFullySubmitted ? 'projects-view__item--complete' : '',
                                            isItemDone ? 'projects-view__item--done' : '',
                                          ].filter(Boolean).join(' ')}
                                          {...interactiveItemProps}
                                        >
                                          <div className="projects-view__item-icon-wrapper">
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
                                              <span className="projects-view__item-missing-badge">
                                                {deficit}
                                              </span>
                                            )}
                                            {showCheckmark && (
                                              <span
                                                className="projects-view__item-complete"
                                                title={t('quartermaster.projects.itemCompleteTooltip')}
                                                aria-label={t('quartermaster.projects.itemCompleteTooltip')}
                                              >
                                                <CheckCircle2 size={12} />
                                              </span>
                                            )}
                                          </div>
                                          <span className="projects-view__item-name qm-item-name">{item.name}</span>
                                          {hasProgress && (
                                            <span className="projects-view__item-progress">
                                              {listItem.submitted} / {listItem.required}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {list.categoryRequirements && list.categoryRequirements.length > 0 && (
                                    <div className="projects-view__category-requirements">
                                      {list.categoryRequirements.map((catReq, catIdx) => {
                                        const pct = catReq.required > 0
                                          ? Math.round((catReq.submitted / catReq.required) * 100)
                                          : 0;
                                        const isCatCompleted = catReq.submitted >= catReq.required;
                                        return (
                                          <div
                                            key={catIdx}
                                            className={[
                                              'projects-view__category-row',
                                              isCatCompleted ? 'projects-view__category-row--complete' : '',
                                            ].filter(Boolean).join(' ')}
                                          >
                                            <span className="projects-view__category-label">{catReq.category}</span>
                                            <span className="projects-view__category-counts">
                                              {formatNumber(catReq.submitted)} / {formatNumber(catReq.required)}
                                            </span>
                                            <div className="projects-view__category-bar">
                                              <div
                                                className="projects-view__category-bar-fill"
                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="projects-view__module-empty">
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
