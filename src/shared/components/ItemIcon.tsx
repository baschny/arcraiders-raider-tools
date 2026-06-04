import React from 'react';
import { normalizeItemRarity, getRarityClass } from '../utils/rarity';

export interface ItemIconProps {
  itemId: string;
  name: string;
  icon?: string | null;
  rarity?: string | null;
  quantity?: number | null;
  showName?: boolean;
  showQuantity?: boolean;
  isBlueprint?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  containerRef?: React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement>;
}

export { getRarityClass, normalizeItemRarity };
export type { ItemRarity } from '../types/item';

export function ItemIcon({
  itemId,
  name,
  icon,
  rarity,
  quantity,
  showName = true,
  showQuantity = false,
  isBlueprint = false,
  onClick,
  className,
  style,
  children,
  containerRef,
}: ItemIconProps) {
  const normalizedRarity = normalizeItemRarity(rarity);

  const classNames = [
    'item-icon',
    getRarityClass(rarity),
    isBlueprint ? 'item-icon--blueprint' : '',
    onClick ? 'item-icon--clickable' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <div
      className={classNames}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      data-rarity={normalizedRarity.toLowerCase()}
      data-item-id={itemId}
      style={style}
      ref={containerRef}
    >
      <div className="item-icon__container">
        {icon && (
          <img
            className="item-icon__image"
            src={icon}
            alt={name}
            loading="lazy"
          />
        )}
        {children}
      </div>
      {showName && (
        <span className="item-icon__name">{name}</span>
      )}
      {showQuantity && (
        <span className={`item-icon__quantity ${quantity === null ? 'item-icon__quantity--unknown' : ''}`}>
          {quantity === null ? '?' : quantity}
        </span>
      )}
    </div>
  );
}
