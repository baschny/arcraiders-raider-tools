import React from 'react';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import type { ItemRef, ChipSize } from './types';

export interface ItemChipProps {
  item: ItemRef;
  quantity?: number;
  showName?: boolean;
  size?: ChipSize;
  onClick?: () => void;
  marker?: 'new';
  /** Rendered inside the icon tile (e.g. a corner VerdictBadge). */
  children?: React.ReactNode;
  className?: string;
  /** Draw the blueprint frame around the icon. */
  isBlueprint?: boolean;
  /** Native tooltip; defaults to the item name. */
  title?: string;
}

const SIZES: Record<ChipSize, number> = { sm: 36, md: 52, lg: 72 };

export function ItemChip({
  item,
  quantity,
  showName = false,
  size = 'md',
  onClick,
  marker,
  children,
  className,
  isBlueprint,
  title,
}: ItemChipProps) {
  const style = { '--item-icon-size': `${SIZES[size]}px` } as React.CSSProperties;
  return (
    <ItemIcon
      itemId={item.id}
      name={item.name}
      icon={item.icon}
      rarity={item.rarity}
      showName={showName}
      showQuantity={false}
      isBlueprint={isBlueprint}
      title={title ?? item.name}
      onClick={onClick}
      className={['wn-chip', `wn-chip--${size}`, className ?? ''].filter(Boolean).join(' ')}
      style={style}
    >
      {quantity !== undefined && quantity !== 1 && (
        <span className="wn-chip__qty">×{quantity}</span>
      )}
      {marker === 'new' && <span className="wn-chip__marker" data-marker="new" aria-hidden="true" />}
      {children}
    </ItemIcon>
  );
}
