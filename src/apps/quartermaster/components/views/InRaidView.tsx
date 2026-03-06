/**
 * In Raid View Component
 * See specification section 7.5, change-04 CR-008/CR-009
 */

import { useState, useMemo } from 'react';
import { Target, Inbox, Wrench } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { InRaidSuggestion, PlannerResult } from '../../types/planner';
import { ItemIcon } from '../ItemIcon';

interface InRaidViewProps {
  itemsMap: ItemsMap;
  plannerResult: PlannerResult;
}

export function InRaidView({ itemsMap, plannerResult }: InRaidViewProps) {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const suggestions = plannerResult.inRaidSuggestions.items;

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

  // Render hover detail tooltip (spec 7.5.2, CR-009)
  const renderHoverDetail = (suggestion: InRaidSuggestion) => {
    const item = itemsMap[suggestion.itemId];
    if (!item) return null;

    const isFinalTarget = suggestion.reasons.includes('BRING_HOME_FINAL_TARGET');
    const deficit = plannerResult.deficit[suggestion.itemId] ?? 0;
    const required = plannerResult.required[suggestion.itemId] ?? 0;

    // Find stash quantity from required - deficit
    const stashQty = required > 0 ? required - deficit : 0;

    return (
      <div className="in-raid-view__hover-detail">
        <div className="in-raid-view__hover-header">
          <strong>{item.name}</strong>
        </div>

        {/* Final target: show list provenance and quantity context */}
        {isFinalTarget && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Missing as final target:</div>
            {required > 0 && (
              <div className="in-raid-view__hover-value">
                Required: {required} · Stash: {stashQty} · Missing: {deficit}
              </div>
            )}
            {suggestion.listSources && suggestion.listSources.length > 0 && (
              <ul className="in-raid-view__hover-list">
                {suggestion.listSources.map(source => (
                  <li key={source.listId}>
                    {source.listName} ({source.quantity}×)
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Craft-support: show impacted targets */}
        {suggestion.impactedTargetItemIds.length > 0 && !isFinalTarget && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Produces needed materials for:</div>
            <ul className="in-raid-view__hover-list">
              {suggestion.impactedTargetItemIds.map(targetId => {
                const targetItem = itemsMap[targetId];
                return targetItem ? (
                  <li key={targetId}>{targetItem.name}</li>
                ) : null;
              })}
            </ul>
          </div>
        )}

        {/* Direct material deficit (non-final-target) */}
        {deficit > 0 && !isFinalTarget && suggestion.reasons.includes('BRING_HOME_DIRECT_MATERIAL') && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Needed as crafting material:</div>
            <div className="in-raid-view__hover-value">Missing: {deficit}</div>
          </div>
        )}

        {/* Recycling vs salvage comparison */}
        {(item.recyclesInto || item.salvagesInto) && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Recycling vs Salvage:</div>

            {item.recyclesInto && Object.keys(item.recyclesInto).length > 0 && (
              <div className="in-raid-view__hover-subsection">
                <div className="in-raid-view__hover-sublabel">Recycle yields:</div>
                <ul className="in-raid-view__hover-list">
                  {Object.entries(item.recyclesInto).map(([yieldId, qty]) => {
                    const yieldItem = itemsMap[yieldId];
                    const isNeeded = (plannerResult.deficit[yieldId] ?? 0) > 0;
                    return yieldItem ? (
                      <li key={yieldId} className={isNeeded ? 'in-raid-view__hover-needed' : ''}>
                        {qty}× {yieldItem.name}
                        {isNeeded && ' (needed)'}
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            )}

            {item.salvagesInto && Object.keys(item.salvagesInto).length > 0 && (
              <div className="in-raid-view__hover-subsection">
                <div className="in-raid-view__hover-sublabel">Salvage yields:</div>
                <ul className="in-raid-view__hover-list">
                  {Object.entries(item.salvagesInto).map(([yieldId, qty]) => {
                    const yieldItem = itemsMap[yieldId];
                    const isNeeded = (plannerResult.deficit[yieldId] ?? 0) > 0;
                    return yieldItem ? (
                      <li key={yieldId} className={isNeeded ? 'in-raid-view__hover-needed' : ''}>
                        {qty}× {yieldItem.name}
                        {isNeeded && ' (needed)'}
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            )}

            {(!item.recyclesInto || Object.keys(item.recyclesInto).length === 0) &&
             (!item.salvagesInto || Object.keys(item.salvagesInto).length === 0) && (
              <div className="in-raid-view__hover-value">No yields available</div>
            )}
          </div>
        )}

        {/* Multi-reason explanation */}
        {suggestion.reasons.length > 1 && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Reasons:</div>
            <ul className="in-raid-view__hover-list">
              {suggestion.reasons.map(reason => (
                <li key={reason}>{formatReason(reason)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderSuggestionGrid = (items: InRaidSuggestion[]) => (
    <div className="in-raid-view__grid">
      {items.map(suggestion => {
        const item = itemsMap[suggestion.itemId];
        if (!item) return null;

        const isFinalTarget = suggestion.reasons.includes('BRING_HOME_FINAL_TARGET');
        const deficit = plannerResult.deficit[suggestion.itemId] ?? 0;

        // Determine action icon and color class
        let ActionIconComponent: typeof Inbox | typeof Wrench;
        let actionClass: string;
        if (isFinalTarget) {
          ActionIconComponent = Inbox;
          actionClass = 'in-raid-view__action-icon--target';
        } else if (suggestion.badge === 'CAN_SALVAGE') {
          ActionIconComponent = Wrench;
          actionClass = 'in-raid-view__action-icon--salvage';
        } else {
          ActionIconComponent = Inbox;
          actionClass = 'in-raid-view__action-icon--bring-home';
        }

        return (
          <div
            key={suggestion.itemId}
            className="in-raid-view__item"
            onMouseEnter={() => setHoveredItemId(suggestion.itemId)}
            onMouseLeave={() => setHoveredItemId(null)}
          >
            <ItemIcon
              itemId={item.id}
              name={item.name}
              icon={item.icon}
              rarity={item.rarity}
              quantity={isFinalTarget ? deficit : (suggestion.impactedTargetItemIds.length || 1)}
            />
            <div className={`in-raid-view__action-icon ${actionClass}`}>
              <ActionIconComponent size={16} strokeWidth={2} />
            </div>
            {hoveredItemId === suggestion.itemId && renderHoverDetail(suggestion)}
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
          <p>No loot suggestions. Configure lists to see what items to look for.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="in-raid-view">
      {directTargets.length > 0 && (
        <>
          <h3 className="qm-section-title">Direct Targets – Bring Home</h3>
          {renderSuggestionGrid(directTargets)}
        </>
      )}

      {craftSupport.length > 0 && (
        <>
          <h3 className="qm-section-title">Crafting Materials</h3>
          {renderSuggestionGrid(craftSupport)}
        </>
      )}
    </div>
  );
}

function formatReason(reason: string): string {
  switch (reason) {
    case 'BRING_HOME_FINAL_TARGET': return 'Direct target from your lists';
    case 'BRING_HOME_DIRECT_MATERIAL': return 'Needed as crafting material';
    case 'SALVAGE_FOR_MATERIAL': return 'Can be salvaged for needed materials';
    case 'BRING_HOME_FOR_RECYCLE_YIELD': return 'Can be recycled for needed materials';
    default: return reason;
  }
}
