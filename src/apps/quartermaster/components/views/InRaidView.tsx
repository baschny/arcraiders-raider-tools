/**
 * In Raid View Component
 * See specification section 7.5, change-04 CR-008/CR-009
 */
import { useMemo, useState } from 'react';
import { Target, Inbox, Wrench, Recycle, Star, X } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { InRaidSuggestion, PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { ItemIcon } from '../ItemIcon';
import { usePrioritizedItems } from '../../hooks/usePrioritizedItems';
import { useLocale } from '../../../../shared/context/LocaleContext';

interface InRaidViewProps {
  itemsMap: ItemsMap;
  plannerResult: PlannerResult;
  itemInsights: ItemInsightsMap;
  getOwnedQuantity: (itemId: string) => number | null;
}

export function InRaidView({
  itemsMap,
  plannerResult,
  itemInsights,
  getOwnedQuantity,
}: InRaidViewProps) {
  const { t, tm, compareText } = useLocale();
  const { prioritizedSet, clearAllPrioritized } = usePrioritizedItems();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const suggestions = plannerResult.inRaidSuggestions.items;
  const tooltipContext = {
    itemsMap,
    plannerResult,
    itemInsights,
  };

  type ActionKind = 'keep' | 'recycle' | 'salvage';

  const resolveActionKind = (suggestion: InRaidSuggestion): ActionKind => {
    if (suggestion.reasons.includes('BRING_HOME_FINAL_TARGET')) return 'keep';
    if (suggestion.badge === 'CAN_SALVAGE') return 'salvage';
    if (suggestion.reasons.includes('BRING_HOME_FOR_RECYCLE_YIELD')) return 'recycle';
    return 'keep';
  };

  const getKeepBreakdown = (itemId: string, suggestion: InRaidSuggestion) => {
    const totals = new Map<string, { listName: string; quantity: number }>();
    const listSources = suggestion.listSources?.length
      ? suggestion.listSources
      : (itemInsights[itemId]?.finalListNeeds ?? []).map((need) => ({
          listId: need.listId,
          listName: need.listName,
          quantity: need.quantity,
        }));

    for (const source of listSources) {
      const existing = totals.get(source.listName);
      if (existing) {
        existing.quantity += source.quantity;
      } else {
        totals.set(source.listName, { listName: source.listName, quantity: source.quantity });
      }
    }

    return Array.from(totals.values()).sort((a, b) => compareText(a.listName, b.listName));
  };

  const renderActionTooltip = (actionKind: ActionKind, suggestion: InRaidSuggestion) => {
    const item = itemsMap[suggestion.itemId];
    if (!item) return null;

    if (actionKind === 'keep') {
      const keepBreakdown = getKeepBreakdown(item.id, suggestion);
      return (
        <div className="in-raid-view__icon-tooltip">
          <div className="in-raid-view__icon-tooltip-title">{t('quartermaster.inRaid.keep')}</div>
          <div className="in-raid-view__icon-tooltip-subtitle">{t('quartermaster.inRaid.neededForLists')}</div>
          {keepBreakdown.length > 0 ? (
            <ul className="in-raid-view__icon-tooltip-list">
              {keepBreakdown.map((source) => (
                <li key={source.listName}>
                  <span>{source.listName}</span>
                  <span>{source.quantity}×</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="in-raid-view__icon-tooltip-empty">{t('quartermaster.inRaid.noListBreakdown')}</div>
          )}
        </div>
      );
    }

    const yields =
      actionKind === 'salvage'
        ? item.salvagesInto
        : item.recyclesInto;
    const yieldEntries = Object.entries(yields ?? {}).sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="in-raid-view__icon-tooltip">
        <div className="in-raid-view__icon-tooltip-title">
          {actionKind === 'salvage' ? t('quartermaster.inRaid.salvage') : t('quartermaster.inRaid.recycle')}
        </div>
        <div className="in-raid-view__icon-tooltip-subtitle">{t('quartermaster.inRaid.yields')}</div>
        {yieldEntries.length > 0 ? (
          <ul className="in-raid-view__icon-tooltip-list">
            {yieldEntries.map(([yieldId, quantity]) => (
              <li key={yieldId}>
                <span className="qm-item-name">{itemsMap[yieldId]?.name ?? yieldId}</span>
                <span>{quantity}×</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="in-raid-view__icon-tooltip-empty">{t('quartermaster.inRaid.noYields')}</div>
        )}
      </div>
    );
  };

  // Create synthetic suggestions for prioritized items that the planner did not suggest.
  // These have no planner reasons — just the star to indicate user priority.
  const syntheticPrioritized: InRaidSuggestion[] = useMemo(() => {
    const seenIds = new Set(suggestions.map((s) => s.itemId));
    const result: InRaidSuggestion[] = [];
    for (const itemId of prioritizedSet) {
      if (seenIds.has(itemId)) continue;
      const item = itemsMap[itemId];
      if (!item) continue;
      result.push({
        itemId,
        reasons: [],
        badge: 'BRING_HOME',
        impactedTargetItemIds: [],
      });
    }
    return result.sort((a, b) => a.itemId.localeCompare(b.itemId));
  }, [suggestions, prioritizedSet, itemsMap]);

  // Merge synthetic into existing, then split into three groups:
  // Priority Targets, Direct Targets (excluding prioritized), Crafting Materials (excluding prioritized).
  const { prioritized, directTargets, craftSupport } = useMemo(() => {
    const prio: InRaidSuggestion[] = [...syntheticPrioritized];
    const direct: InRaidSuggestion[] = [];
    const support: InRaidSuggestion[] = [];

    for (const s of suggestions) {
      if (prioritizedSet.has(s.itemId)) {
        prio.push(s);
      } else if (s.reasons.includes('BRING_HOME_FINAL_TARGET')) {
        direct.push(s);
      } else {
        support.push(s);
      }
    }
    return { prioritized: prio, directTargets: direct, craftSupport: support };
  }, [suggestions, prioritizedSet, syntheticPrioritized]);

  const renderSuggestionGrid = (items: InRaidSuggestion[]) => (
    <div className="in-raid-view__grid">
      {items.map(suggestion => {
        const item = itemsMap[suggestion.itemId];
        if (!item) return null;

        const hasReasons = suggestion.reasons.length > 0;
        const isFinalTarget = suggestion.reasons.includes('BRING_HOME_FINAL_TARGET');
        const deficit = plannerResult.deficit[suggestion.itemId] ?? 0;
        const required = plannerResult.required[suggestion.itemId] ?? 0;
        const actionKind = resolveActionKind(suggestion);

        return (
          <div
            key={suggestion.itemId}
            className="in-raid-view__item-card"
          >
            <div className="in-raid-view__item-main">
              <ItemIcon
                itemId={item.id}
                name={item.name}
                icon={item.icon}
                rarity={item.rarity}
                quantity={getOwnedQuantity(item.id)}
                tooltipContext={tooltipContext}
              />
              {hasReasons && (
                <div className="in-raid-view__action-stack">
                  <div className="in-raid-view__action-wrapper">
                    <div className={`in-raid-view__action-icon in-raid-view__action-icon--${actionKind}`}>
                      {actionKind === 'keep' && <Inbox size={16} strokeWidth={2} />}
                      {actionKind === 'recycle' && <Recycle size={16} strokeWidth={2} />}
                      {actionKind === 'salvage' && <Wrench size={16} strokeWidth={2} />}
                    </div>
                    {renderActionTooltip(actionKind, suggestion)}
                  </div>

                  {isFinalTarget && required > 0 && (
                    <div className="in-raid-view__missing-wrapper">
                      <div className="in-raid-view__missing-circle">{deficit}</div>
                      <div className="in-raid-view__mini-tooltip">{tm('quartermaster.stash.missingCount', { missing: deficit, required })}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Show In Raid view when there are suggestions OR prioritized items.
  const hasPrioritized = prioritized.length > 0;

  const handleClearAll = () => {
    clearAllPrioritized();
    setShowClearConfirm(false);
  };

  if (suggestions.length === 0 && !hasPrioritized) {
    return (
      <div className="in-raid-view">
        <div className="qm-empty-state">
          <Target size={48} />
          <p>{t('quartermaster.inRaid.empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {showClearConfirm && (
        <div className="qm-modal-backdrop" role="presentation" onClick={() => setShowClearConfirm(false)}>
          <div
            className="qm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('quartermaster.inRaid.prioritizeClearAllTitle')}</h3>
            <p>{t('quartermaster.inRaid.prioritizeClearAllBody')}</p>
            <div className="qm-modal__actions">
              <button
                type="button"
                className="qm-button qm-button--danger"
                onClick={handleClearAll}
              >
                {t('quartermaster.inRaid.prioritizeClearAllConfirm')}
              </button>
              <button
                type="button"
                className="qm-button"
                onClick={() => setShowClearConfirm(false)}
              >
                {t('quartermaster.lists.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="in-raid-view">
        {hasPrioritized && (
          <section className="in-raid-view__section in-raid-view__section--prioritized">
            <div className="in-raid-view__section-header">
              <h3 className="qm-section-title">
                <Star size={18} fill="currentColor" strokeWidth={1.5} />
                {t('quartermaster.inRaid.priorityTargets')}
              </h3>
              <button
                type="button"
                className="in-raid-view__clear-all"
                onClick={() => setShowClearConfirm(true)}
                title={t('quartermaster.inRaid.prioritizeClearAll')}
                aria-label={t('quartermaster.inRaid.prioritizeClearAll')}
              >
                <X size={14} strokeWidth={2} />
                {t('quartermaster.inRaid.prioritizeClearAll')}
              </button>
            </div>
            {renderSuggestionGrid(prioritized)}
          </section>
        )}

        {directTargets.length > 0 && (
          <section className="in-raid-view__section">
            <h3 className="qm-section-title">{t('quartermaster.inRaid.directTargets')}</h3>
            {renderSuggestionGrid(directTargets)}
          </section>
        )}

        {craftSupport.length > 0 && (
          <section className="in-raid-view__section">
            <h3 className="qm-section-title">{t('quartermaster.inRaid.craftingMaterials')}</h3>
            {renderSuggestionGrid(craftSupport)}
          </section>
        )}
      </div>
    </>
  );
}