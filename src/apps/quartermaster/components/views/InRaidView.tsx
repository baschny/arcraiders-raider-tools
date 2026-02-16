/**
 * In Raid View Component
 * See specification section 7.5
 */

import { Target } from 'lucide-react';
import type { ItemsMap } from '../../types/item';
import type { LootSuggestionList } from '../../types/planner';
import { ItemIcon, type ItemIconBadge } from '../ItemIcon';

interface InRaidViewProps {
  itemsMap: ItemsMap;
  lootSuggestions: LootSuggestionList;
}

export function InRaidView({ itemsMap, lootSuggestions }: InRaidViewProps) {
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
            <div key={suggestion.itemId} className="in-raid-view__item">
              <ItemIcon
                itemId={item.id}
                name={item.name}
                icon={item.icon}
                rarity={item.rarity}
                quantity={suggestion.impactedTargetsCount ?? 1}
                badges={badges}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
