import React from 'react';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import { formatAmount } from './format';
import type { ItemRef, TileSize } from './types';

export interface ItemTileProps {
  item: ItemRef;
  size: TileSize;
  /** Number renders as "3×"; a string is shown as is ("50 RP"). */
  amount?: number | string;
  /** Small line under the name, e.g. "2000 RP · L2". */
  sublabel?: string;
  selected?: boolean;
  /** Makes the tile a button. */
  onClick?: () => void;
  isBlueprint?: boolean;
  /** Omit the name line (the parent shows it elsewhere). */
  hideName?: boolean;
  /** Native tooltip; defaults to the item name. */
  title?: string;
  className?: string;
}

export function ItemTile({
  item,
  size,
  amount,
  sublabel,
  selected,
  onClick,
  isBlueprint,
  hideName = false,
  title,
  className,
}: ItemTileProps) {
  const classes = ['wn-tile', `wn-tile--${size}`, selected ? 'is-selected' : '', onClick ? 'wn-tile--button' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const style = { '--item-icon-size': `${size}px` } as React.CSSProperties;
  const body = (
    <>
      <ItemIcon
        itemId={item.id}
        name={item.name}
        icon={item.icon}
        rarity={item.rarity}
        isBlueprint={isBlueprint}
        showName={false}
        showQuantity={false}
        className="wn-tile__icon"
      />
      {amount !== undefined && <span className="wn-tile__amount">{formatAmount(amount)}</span>}
      {!hideName && <span className="wn-tile__name">{item.name}</span>}
      {sublabel && <span className="wn-tile__sub">{sublabel}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} style={style} onClick={onClick} aria-pressed={selected ?? false} title={title ?? item.name}>
        {body}
      </button>
    );
  }
  return (
    <div className={classes} style={style} title={title ?? item.name}>
      {body}
    </div>
  );
}
