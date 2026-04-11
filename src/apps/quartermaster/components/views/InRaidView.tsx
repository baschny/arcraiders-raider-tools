/**
 * In Raid View Component
 * See specification section 7.5, change-04 CR-008/CR-009
 */
import { useMemo } from 'react';
import { Target, Inbox, Wrench, Recycle } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { InRaidSuggestion, PlannerResult } from '../../types/planner';
import type { ItemInsightsMap } from '../../utils/itemInsights';
import { ItemIcon } from '../ItemIcon';
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

  // Split into groups: direct targets first, then craft-support (CR-006)
  const { directTargets, craftSupport } = useMemo(() => {
    const direct: InRaidSuggestion[] = [];
    const support: InRaidSuggestion[] = [];
    for (const s of suggestions) {
      if (s.reasons.includes('BRING_HOME_FINAL_TARGET')) {
        direct.push(s);
      } else {
        support.push(s);
      }
    }
    return { directTargets: direct, craftSupport: support };
  }, [suggestions]);

  const renderSuggestionGrid = (items: InRaidSuggestion[]) => (
    <div className="in-raid-view__grid">
      {items.map(suggestion => {
        const item = itemsMap[suggestion.itemId];
        if (!item) return null;

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
            </div>
          </div>
        );
      })}
    </div>
  );

  if (suggestions.length === 0) {
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
    <div className="in-raid-view">
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
  );
}
