import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownAZ,
  CheckCircle2,
  Eye,
  EyeOff,
  ListChecks,
  Network,
  RefreshCw,
  ScrollText,
} from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import { ItemIcon } from '../ItemIcon';
import { QuestTooltip } from '../../../../shared/components/QuestTooltip';
import type { Quest } from '../../../../shared/types/quest';
import { loadQuestSortMode, saveQuestSortMode, type QuestSortMode } from '../../utils/preferences';
import type { ItemsMap } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { QuestDefinition } from '../../types/quest';
import type { PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';

interface QuestsViewProps {
  itemsMap: ItemsMap;
  questDefinitions: QuestDefinition[];
  fullQuestById: Map<string, Quest>;
  questLists: StoredList[];
  completedQuestIds: Set<string>;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
  hasLinkedSnapshot: boolean;
  linkedSource: string | null;
  gameDataSource: string | null;
  onSyncQuests: () => void;
  isSyncingQuests: boolean;
  onSetQuestTrackingMode: (mode: 'enable-all' | 'disable-all') => void;
  onToggleQuestItem: (questId: string, itemId: string) => void;
}

type SortMode = QuestSortMode;
type TrackingMode = 'enable-all' | 'disable-all';

function isItemRequirementAvailable(
  getOwnedQuantity: (itemId: string) => number | null,
  itemId: string,
  requiredQuantity: number,
): boolean {
  const ownedQuantity = getOwnedQuantity(itemId);
  return ownedQuantity !== null && ownedQuantity >= requiredQuantity;
}

function computeHopDistances(
  questDefs: QuestDefinition[],
  completedQuestIds: Set<string>,
): Map<string, number | null> {
  const distances = new Map<string, number | null>();
  const incomplete = questDefs.filter(q => !completedQuestIds.has(q.id));

  const frontier: string[] = [];
  for (const q of incomplete) {
    const allPrereqsDone = q.previousQuestIds.length === 0
      || q.previousQuestIds.every(pid => completedQuestIds.has(pid));
    if (allPrereqsDone) {
      distances.set(q.id, 0);
      frontier.push(q.id);
    }
  }

  const queue = [...frontier];
  const idToDef = new Map(incomplete.map(q => [q.id, q]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = distances.get(current)!;
    const def = idToDef.get(current);
    if (!def) continue;

    for (const nextId of def.nextQuestIds) {
      if (completedQuestIds.has(nextId)) continue;
      if (distances.has(nextId)) continue;
      if (!idToDef.has(nextId)) continue;

      distances.set(nextId, currentDist + 1);
      queue.push(nextId);
    }
  }

  for (const q of incomplete) {
    if (!distances.has(q.id)) {
      distances.set(q.id, null);
    }
  }

  return distances;
}

const TOOLTIP_ESTIMATED_WIDTH = 440;
const TOOLTIP_ESTIMATED_HEIGHT = 520;
const TOOLTIP_MARGIN = 12;

export function QuestsView({
  itemsMap,
  questDefinitions,
  fullQuestById,
  questLists,
  completedQuestIds,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
  hasLinkedSnapshot,
  onSyncQuests,
  isSyncingQuests,
  onSetQuestTrackingMode,
  onToggleQuestItem,
}: QuestsViewProps) {
  const { t, compareText } = useLocale();
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState<SortMode>(() => loadQuestSortMode());

  const [hoveredQuestId, setHoveredQuestId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, maxHeight: TOOLTIP_ESTIMATED_HEIGHT });
  const hoverTimeoutRef = useRef<number | null>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const showTooltip = useCallback(
    (questId: string) => {
      clearHoverTimeout();
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredQuestId(questId);
        const el = blockRefs.current.get(questId);
        if (el) {
          const rect = el.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          let x = rect.right + 10;
          let y = rect.top;

          if (x + TOOLTIP_ESTIMATED_WIDTH > viewportWidth - TOOLTIP_MARGIN) {
            x = rect.left - TOOLTIP_ESTIMATED_WIDTH - 10;
          }
          if (x < TOOLTIP_MARGIN) {
            x = TOOLTIP_MARGIN;
          }
          if (y + TOOLTIP_ESTIMATED_HEIGHT > viewportHeight - TOOLTIP_MARGIN) {
            y = viewportHeight - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_MARGIN;
          }
          if (y < TOOLTIP_MARGIN) {
            y = TOOLTIP_MARGIN;
          }

          const maxHeight = Math.max(260, viewportHeight - y - TOOLTIP_MARGIN);
          setTooltipPos({ x, y, maxHeight });
        }
      }, 400);
    },
    [clearHoverTimeout],
  );

  const hideTooltip = useCallback(() => {
    clearHoverTimeout();
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredQuestId(null);
    }, 120);
  }, [clearHoverTimeout]);

  const cancelHide = useCallback(() => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const listByQuestId = useMemo(() => {
    const map = new Map<string, StoredList>();
    for (const list of questLists) {
      const match = list.id.match(/^quest_(.+)$/);
      if (match) {
        map.set(match[1], list);
      }
    }
    return map;
  }, [questLists]);

  const hopDistances = useMemo(
    () => computeHopDistances(questDefinitions, completedQuestIds),
    [questDefinitions, completedQuestIds],
  );

  const sortedQuestIds = useMemo(() => {
    const ids = [...listByQuestId.keys()];
    if (sortMode === 'alphabetical') {
      ids.sort((a, b) => {
        const defA = questDefinitions.find(d => d.id === a);
        const defB = questDefinitions.find(d => d.id === b);
        return compareText(defA?.name ?? a, defB?.name ?? b);
      });
    } else {
      ids.sort((a, b) => {
        const hopA = hopDistances.get(a);
        const hopB = hopDistances.get(b);
        const distA = hopA ?? Number.MAX_SAFE_INTEGER;
        const distB = hopB ?? Number.MAX_SAFE_INTEGER;
        if (distA !== distB) return distA - distB;
        const defA = questDefinitions.find(d => d.id === a);
        const defB = questDefinitions.find(d => d.id === b);
        return compareText(defA?.name ?? a, defB?.name ?? b);
      });
    }
    return ids;
  }, [listByQuestId, sortMode, hopDistances, questDefinitions, compareText]);

  const handleGoToQuestTree = useCallback((questId: string) => {
    navigate(`/quests?focus=${encodeURIComponent(questId)}`);
  }, [navigate]);

  if (!hasLinkedSnapshot) {
    return (
      <div className="quests-view">
        <div className="quests-view__no-data">
          <ScrollText size={48} />
          <p>{t('quartermaster.quests.noLinkedData')}</p>
        </div>
      </div>
    );
  }

  const hasPendingItems = questLists.length > 0;

  const currentMode: TrackingMode | 'custom' = (() => {
    if (!hasPendingItems) return 'disable-all';
    let allEnabled = true;
    let allDisabled = true;
    for (const list of questLists) {
      for (const item of list.items) {
        if (item.isEnabled) allDisabled = false;
        else allEnabled = false;
      }
    }
    if (allEnabled) return 'enable-all';
    if (allDisabled) return 'disable-all';
    return 'custom';
  })();

  const handleTrackingMode = (mode: TrackingMode) => {
    onSetQuestTrackingMode(mode);
  };

  const hoveredQuest = hoveredQuestId ? fullQuestById.get(hoveredQuestId) : null;

  return (
    <div className="quests-view">
      <div className="quests-view__controls">
        <button
          className="qm-button"
          onClick={onSyncQuests}
          disabled={isSyncingQuests}
          title={t('quartermaster.quests.syncTooltip')}
        >
          <RefreshCw size={16} className={isSyncingQuests ? 'animate-spin' : ''} />
          <span className="quests-view__button-text quests-view__button-text--sync-full">
            {t('quartermaster.quests.syncQuests')}
          </span>
          <span className="quests-view__button-text quests-view__button-text--sync-short">
            {t('quartermaster.common.sync')}
          </span>
        </button>

        <div className="quests-view__tracking">
          <span className="quests-view__tracking-label">{t('quartermaster.projects.tracking')}</span>
          <div className="qm-segmented-control">
            <button
              type="button"
              className={['qm-segmented-control__button', currentMode === 'disable-all' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => handleTrackingMode('disable-all')}
              disabled={!hasPendingItems}
              title={t('quartermaster.quests.disableAll')}
            >
              <EyeOff size={14} />
              <span className="quests-view__button-text quests-view__button-text--secondary">
                {t('quartermaster.quests.disableAll')}
              </span>
            </button>
            <button
              type="button"
              className={['qm-segmented-control__button', currentMode === 'enable-all' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => handleTrackingMode('enable-all')}
              disabled={!hasPendingItems}
              title={t('quartermaster.quests.enableAllPending')}
            >
              <Eye size={14} />
              <span className="quests-view__button-text quests-view__button-text--secondary">
                {t('quartermaster.quests.enableAllPending')}
              </span>
            </button>
          </div>
        </div>

        <div className="quests-view__actions">
          <div className="quests-view__sort">
            <span className="quests-view__sort-label">{t('quartermaster.quests.sortBy')}</span>
            <div className="qm-segmented-control">
              <button
                type="button"
                className={['qm-segmented-control__button', sortMode === 'alphabetical' ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => { setSortMode('alphabetical'); saveQuestSortMode('alphabetical'); }}
                title={t('quartermaster.quests.sortAlphabetical')}
              >
                <ArrowDownAZ size={14} />
                <span className="quests-view__button-text quests-view__button-text--secondary">
                  {t('quartermaster.quests.sortAlphabetical')}
                </span>
              </button>
              <button
                type="button"
                className={['qm-segmented-control__button', sortMode === 'next-quests' ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => { setSortMode('next-quests'); saveQuestSortMode('next-quests'); }}
                title={t('quartermaster.quests.sortNextQuests')}
              >
                <ListChecks size={14} />
                <span className="quests-view__button-text quests-view__button-text--secondary">
                  {t('quartermaster.quests.sortNextQuests')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {!hasPendingItems && (
        <div className="quests-view__empty">
          <p>{t('quartermaster.quests.allComplete')}</p>
        </div>
      )}

      {hasPendingItems && (
        <div className="quests-view__grid">
          {sortedQuestIds.map((questId) => {
            const list = listByQuestId.get(questId)!;
            const def = questDefinitions.find(d => d.id === questId);
            const hop = hopDistances.get(questId);
            const questData = fullQuestById.get(questId);

            const handleEnter = () => showTooltip(questId);
            const handleLeave = () => hideTooltip();

            return (
              <div key={questId} className="quests-view__block">
                <div
                  className="quests-view__block-header"
                  ref={(el) => {
                    if (el) blockRefs.current.set(questId, el);
                    else blockRefs.current.delete(questId);
                  }}
                  onMouseEnter={handleEnter}
                  onMouseLeave={handleLeave}
                >
                  <span className="quests-view__block-name">{def?.name ?? questId}</span>
                  {sortMode === 'next-quests' && hop !== undefined && hop !== null && (
                    <span className="quests-view__hop-badge" title={t('quartermaster.quests.hopsAway').replace('{hops}', String(hop))}>
                      {hop === 0 ? t('quartermaster.quests.now') : hop}
                    </span>
                  )}
                  {questData && (
                    <button
                      className="quests-view__tree-link"
                      onClick={() => handleGoToQuestTree(questId)}
                      title={t('quartermaster.quests.viewInQuestTree')}
                      aria-label={t('quartermaster.quests.viewInQuestTree')}
                    >
                      <Network size={14} />
                    </button>
                  )}
                </div>
                <div className="quests-view__block-items">
                  {list.items.map((listItem) => {
                    const item = itemsMap[listItem.itemId];
                    if (!item) return null;

                    const isComplete = isItemRequirementAvailable(
                      getOwnedQuantity,
                      listItem.itemId,
                      listItem.quantity,
                    );
                    const owned = getOwnedQuantity(listItem.itemId) ?? 0;
                    const deficit = Math.max(0, listItem.quantity - owned);
                    const handleItemToggle = () => onToggleQuestItem(questId, listItem.itemId);
                    const handleItemKeyDown = (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemToggle();
                      }
                    };

                    return (
                      <div
                        key={`${questId}-${listItem.itemId}`}
                        className={[
                          'quests-view__item',
                          !listItem.isEnabled ? 'quests-view__item--disabled' : '',
                          isComplete ? 'quests-view__item--complete' : '',
                        ].filter(Boolean).join(' ')}
                        role="button"
                        tabIndex={0}
                        title={listItem.isEnabled
                          ? t('quartermaster.quests.disableItemTooltip')
                          : t('quartermaster.quests.enableItemTooltip')}
                        onClick={handleItemToggle}
                        onKeyDown={handleItemKeyDown}
                      >
                        <div className="quests-view__item-icon-wrapper">
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
                            <span className="quests-view__item-missing-badge">
                              {deficit}
                            </span>
                          )}
                          {isComplete && (
                            <span
                              className="quests-view__item-complete"
                              title={t('quartermaster.quests.itemCompleteTooltip')}
                              aria-label={t('quartermaster.quests.itemCompleteTooltip')}
                            >
                              <CheckCircle2 size={12} />
                            </span>
                          )}
                        </div>
                        <span className="quests-view__item-name qm-item-name">{item.name}</span>
                        <span className="quests-view__item-progress">
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
      )}

      {hoveredQuest && (
        <QuestTooltip
          quest={hoveredQuest}
          position={tooltipPos}
          visible={true}
          onMouseEnter={cancelHide}
          onMouseLeave={hideTooltip}
        />
      )}
    </div>
  );
}
