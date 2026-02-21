/**
 * Item Icon Component
 * See specification section 7.7
 */

import type { ItemRarity } from '../types/item';

export interface ItemIconBadge {
  key: string;
  label?: string;
  type: 'keep' | 'recycle' | 'discard' | 'salvage' | 'bring-home' | 'missing' | 'uncraftable' | 'have' | 'can-craft';
  priority: number;
}

export interface ItemIconProps {
  itemId: string;
  name: string;
  icon: string;
  rarity: ItemRarity;
  quantity: number;
  badges?: ItemIconBadge[];
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  onClick?: () => void;
}

/**
 * Reusable component for displaying items consistently across the module
 */
export function ItemIcon({
  name,
  icon,
  rarity,
  quantity,
  badges = [],
  size = 'md',
  showName = true,
  onClick,
}: ItemIconProps) {
  // Sort badges by priority (ascending)
  const sortedBadges = [...badges].sort((a, b) => a.priority - b.priority);

  const rarityClass = `rarity-${rarity.toLowerCase()}`;
  const sizeClass = size !== 'md' ? `item-icon--${size}` : '';

  return (
    <div 
      className={`item-icon ${rarityClass} ${sizeClass}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="item-icon__container">
        <img
          className="item-icon__image"
          src={icon}
          alt={name}
          loading="lazy"
        />
        
        {/* Quantity overlay - always visible per spec */}
        <span className="item-icon__quantity">{quantity}</span>

        {/* Badges */}
        {sortedBadges.length > 0 && (
          <div className="item-icon__badges">
            {sortedBadges.map(badge => (
              <span
                key={badge.key}
                className={`item-icon__badge item-icon__badge--${badge.type}`}
              >
                {badge.label || badge.type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Name label - always visible per spec */}
      {showName && <span className="item-icon__name">{name}</span>}
    </div>
  );
}
