import { ItemTile, type ItemRef } from '../../components';

export interface StencilTileProps {
  item: ItemRef;
  /** Optional swatch image (see `STENCIL_IMAGES`); falls back to the item icon, then a neutral swatch. */
  image?: string;
  selected: boolean;
  onClick: () => void;
}

/** Stencil items have no icon: show a calm neutral swatch in the same footprint as an 80 px item tile. */
export function StencilTile({ item, image, selected, onClick }: StencilTileProps) {
  const src = image ?? item.icon;
  if (src) return <ItemTile item={{ ...item, icon: src }} size={80} selected={selected} onClick={onClick} />;
  return (
    <button
      type="button"
      className={`wn-tile wn-tile--80 wn-tile--button wn-stencil-tile${selected ? ' is-selected' : ''}`}
      style={{ '--item-icon-size': '80px' } as React.CSSProperties}
      onClick={onClick}
      aria-pressed={selected}
      title={item.name}
    >
      <span className="wn-stencil-tile__swatch" aria-hidden="true" />
      <span className="wn-tile__name">{item.name}</span>
    </button>
  );
}
