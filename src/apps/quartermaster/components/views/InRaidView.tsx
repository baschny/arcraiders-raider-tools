/**
 * In Raid View Component
 * See specification section 7.5
 */

import { useState } from 'react';
import { Target } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { LootSuggestionList, PlannerResult } from '../../types/planner';
import { ItemIcon, type ItemIconBadge } from '../ItemIcon';

interface InRaidViewProps {
  itemsMap: ItemsMap;
  lootSuggestions: LootSuggestionList;
  plannerResult: PlannerResult;
}

export function InRaidView({ itemsMap, lootSuggestions, plannerResult }: InRaidViewProps) {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  // Helper to get final loadout items that are missing
  const getMissingLoadoutItems = () => {
    return Object.entries(plannerResult.required)
      .filter(([itemId]) => (plannerResult.deficit[itemId] ?? 0) > 0)
      .map(([itemId]) => itemId);
  };

  // Helper to determine which missing loadout items a suggestion impacts
  const getImpactedItems = (suggestionItemId: string) => {
    const item = itemsMap[suggestionItemId];
    if (!item) return [];

    const missingItems = getMissingLoadoutItems();
    const impacted = new Set<string>();

    // Check if it's directly missing
    if (missingItems.includes(suggestionItemId)) {
      impacted.add(suggestionItemId);
    }

    // Check recycle yields
    if (item.recyclesInto) {
      for (const [yieldItemId] of Object.entries(item.recyclesInto)) {
        if ((plannerResult.deficit[yieldItemId] ?? 0) > 0) {
          // Find which missing loadout items need this material
          for (const missingItemId of missingItems) {
            const missingItem = itemsMap[missingItemId];
            if (missingItem?.recipe && yieldItemId in missingItem.recipe) {
              impacted.add(missingItemId);
            }
          }
        }
      }
    }

    // Check salvage yields
    if (item.salvagesInto) {
      for (const [yieldItemId] of Object.entries(item.salvagesInto)) {
        if ((plannerResult.deficit[yieldItemId] ?? 0) > 0) {
          // Find which missing loadout items need this material
          for (const missingItemId of missingItems) {
            const missingItem = itemsMap[missingItemId];
            if (missingItem?.recipe && yieldItemId in missingItem.recipe) {
              impacted.add(missingItemId);
            }
          }
        }
      }
    }

    return Array.from(impacted).sort();
  };

  // Render hover detail tooltip (spec 7.5.2)
  const renderHoverDetail = (itemId: string) => {
    const item = itemsMap[itemId];
    if (!item) return null;

    const impactedItems = getImpactedItems(itemId);
    const deficit = plannerResult.deficit[itemId] ?? 0;

    return (
      <div className="in-raid-view__hover-detail">
        <div className="in-raid-view__hover-header">
          <strong>{item.name}</strong>
        </div>

        {deficit > 0 && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Required for:</div>
            <div className="in-raid-view__hover-value">Your loadouts (need {deficit})</div>
          </div>
        )}

        {impactedItems.length > 0 && deficit === 0 && (
          <div className="in-raid-view__hover-section">
            <div className="in-raid-view__hover-label">Produces needed materials for:</div>
            <ul className="in-raid-view__hover-list">
              {impactedItems.map(impactedId => {
                const impactedItem = itemsMap[impactedId];
                return impactedItem ? (
                  <li key={impactedId}>{impactedItem.name}</li>
                ) : null;
              })}
            </ul>
          </div>
        )}

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
      </div>
    );
  };

  if (lootSuggestions.items.length === 0) {
    return (
      <div className="in-raid-view">
        <div className="qm-empty-state">
          <Target size={48} />
          <p>No loot suggestions. Configure loadouts to see what items to look for.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="in-raid-view">
      <h3 className="qm-section-title">Items to Look For</h3>
      
      <div className="in-raid-view__grid">
        {lootSuggestions.items.map(suggestion => {
          const item = itemsMap[suggestion.itemId];
          if (!item) return null;

          const badges: ItemIconBadge[] = [];
          
          // Add loot badge
          if (suggestion.badge === 'CAN_SALVAGE') {
            badges.push({
              key: 'badge',
              label: 'Salvage',
              type: 'salvage',
              priority: 1,
            });
          } else {
            badges.push({
              key: 'badge',
              label: 'Bring',
              type: 'bring-home',
              priority: 1,
            });
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
                quantity={suggestion.impactedTargetsCount ?? 1}
                badges={badges}
              />
              {hoveredItemId === suggestion.itemId && renderHoverDetail(suggestion.itemId)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
