import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { MAP_SLUGS } from '../../maps/routing';
import { ItemTile } from '../../whats-new/components';
import type { TileSize } from '../../whats-new/components/types';
import { PERCENT_FIELDS, useText } from '../text';
import type { UpdateChange, UpdateRelease, UpdateValue } from '../types';
import { useItemOverlay } from './overlayContext';

/** Display name of a referenced record: catalog name for items, else its localized name. */
function useRefName() {
  const { text } = useText();
  const { items } = useItemOverlay();
  return (refKey: string, release: UpdateRelease): string => {
    const slug = refKey.startsWith('item:') ? refKey.slice(5) : null;
    return (slug && items[slug]?.name) || text(release.refs[refKey]?.name) || slug || refKey;
  };
}

/** Name of a referenced record, as text. */
/** Maps app page of a map ref (`map:<slug>`), when the maps app has that map. */
function mapPathOf(refKey: string): string | null {
  const slug = refKey.startsWith('map:') ? refKey.slice(4) : null;
  return slug && (MAP_SLUGS as readonly string[]).includes(slug) ? `/maps/${slug}` : null;
}

/** Name of a referenced record, as text; maps link to their page in the maps app. */
export function RefName({ refKey, release }: { refKey: string; release: UpdateRelease }) {
  const refName = useRefName();
  const mapPath = mapPathOf(refKey);
  if (mapPath) return <Link className="up-maplink" to={mapPath}>{refName(refKey, release)}</Link>;
  return <>{refName(refKey, release)}</>;
}

/** Site image of a record without a catalog icon (skill, trader, enemy, bench), if any. */
function refImageOf(refKey: string, release: UpdateRelease): string | undefined {
  return release.refs[refKey]?.icon;
}

/**
 * A referenced record as a What's New item tile (icon, amount, name; opens the item overlay), or
 * as a name when it is no catalog item (quest, map, trader, unnamed reward).
 */
export function RefTile({
  refKey,
  release,
  amount,
  size = 48,
  layout,
  hideName,
  className,
}: {
  refKey: string;
  release: UpdateRelease;
  amount?: number;
  size?: TileSize;
  layout?: 'stack' | 'inline';
  hideName?: boolean;
  className?: string;
}) {
  const { locale } = useText();
  const { items, open } = useItemOverlay();
  const refName = useRefName();
  const slug = refKey.startsWith('item:') ? refKey.slice(5) : null;
  const item = slug ? items[slug] : undefined;
  const qty = amount != null ? `${amount.toLocaleString(locale)}×` : undefined;
  if (!item) {
    const image = refImageOf(refKey, release);
    if (image && layout === 'stack') {
      return (
        <span className={['up-name', 'up-name--image', className ?? ''].filter(Boolean).join(' ')}>
          <img className="up-name__image" src={image} alt="" style={{ width: size, height: size }} />
          {!hideName && <RefName refKey={refKey} release={release} />}
        </span>
      );
    }
    if (image && hideName) return <img className="up-name__image" src={image} alt={refName(refKey, release)} style={{ width: size, height: size }} />;
    return (
      <span className={['up-name', className ?? ''].filter(Boolean).join(' ')}>
        {qty && <span className="up-name__amount">{qty} </span>}
        <RefName refKey={refKey} release={release} />
      </span>
    );
  }
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    open(item.id, e.currentTarget);
  };
  return (
    <ItemTile
      item={{ id: item.id, name: item.name, icon: item.icon, rarity: item.rarity }}
      size={size}
      amount={qty}
      layout={layout}
      hideName={hideName}
      onClick={onClick}
      className={className}
    />
  );
}

/**
 * A scalar or list value of a field change. Item lists are one tile per line; with `other` (the
 * value on the other side) entries missing there are marked `mark` and changed amounts highlighted.
 */
export function ValueView({
  value,
  release,
  change,
  other,
  mark,
}: {
  value: UpdateValue;
  release: UpdateRelease;
  change?: UpdateChange;
  other?: UpdateValue;
  mark?: 'added' | 'removed';
}) {
  const { t, locale, text } = useText();
  const refName = useRefName();
  if (value == null) return <span className="up-value up-value--none">—</span>;
  if (typeof value === 'number') {
    const percent = change && PERCENT_FIELDS.has(change.field);
    // On the Now side: the relative change against Before (green up, red down).
    const delta = mark === 'added' && typeof other === 'number' && other !== 0 && !percent ? (value - other) / Math.abs(other) : null;
    return (
      <span className="up-value">
        {percent ? value.toLocaleString(locale, { style: 'percent' }) : value.toLocaleString(locale)}
        {delta != null && delta !== 0 && (
          <span className={`up-delta up-delta--${delta > 0 ? 'up' : 'down'}`}>
            {delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString(locale, { style: 'percent', maximumFractionDigits: Math.abs(delta) < 0.1 ? 1 : 0 })}
          </span>
        )}
      </span>
    );
  }
  if (typeof value === 'boolean') return <span className="up-value">{t(value ? 'updates.value.yes' : 'updates.value.no')}</span>;
  if (typeof value === 'string') return <span className="up-value">{value}</span>;
  if ('items' in value) {
    if (!value.items.length) return <span className="up-value up-value--none">—</span>;
    const otherAmount = other && typeof other === 'object' && 'items' in other ? new Map(other.items.map((e) => [e.ref, e.amount])) : null;
    const stateOf = (ref: string, amount: number) => {
      if (!otherAmount || !mark) return undefined;
      const was = otherAmount.get(ref);
      return was === undefined ? mark : was !== amount ? 'changed' : undefined;
    };
    return (
      <span className="up-tiles">
        {value.items.map((e, i) => {
          const state = stateOf(e.ref, e.amount);
          return <RefTile key={`${e.ref}-${i}`} refKey={e.ref} release={release} amount={e.amount} className={state ? `up-tile--${state}` : undefined} />;
        })}
      </span>
    );
  }
  if ('refs' in value) {
    if (!value.refs.length) return <span className="up-value up-value--text">{t('updates.value.all')}</span>;
    return <span className="up-value up-value--text">{value.refs.map((r) => refName(r, release)).join(', ')}</span>;
  }
  if ('text' in value) return <span className="up-value up-value--text">{text(value.text)}{value.amount != null ? ` ×${value.amount}` : ''}</span>;
  return <span className="up-value up-value--text">{t('updates.value.changed')}</span>;
}
