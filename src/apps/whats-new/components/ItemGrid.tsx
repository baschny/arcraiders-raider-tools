import { useState, type CSSProperties, type ReactNode } from 'react';
import { DetailPanel } from './DetailPanel';
import { useGridColumns } from './useGridColumns';

interface GridBase {
  /** Smallest column width in px (default 112). */
  minTile?: number;
  className?: string;
}

export interface ItemGridPlainProps extends GridBase {
  children: ReactNode;
  items?: undefined;
}

export interface ItemGridSelectableProps<T> extends GridBase {
  items: readonly T[];
  getKey: (item: T) => string;
  /** Renders the tile; call `toggle` from its onClick. */
  renderTile: (item: T, state: { selected: boolean; toggle: () => void }) => ReactNode;
  /** Content of the detail panel that opens below the selected tile's row. */
  renderDetail?: (item: T, close: () => void) => ReactNode;
  /** Accessible name of the detail panel. */
  getDetailLabel?: (item: T) => string;
  /** Controlled selection (e.g. one open panel across several grids); uncontrolled when omitted. */
  selectedKey?: string | null;
  onSelectedKeyChange?: (key: string | null) => void;
  children?: undefined;
}

export type ItemGridProps<T> = ItemGridPlainProps | ItemGridSelectableProps<T>;

/**
 * Responsive tile grid (`repeat(auto-fill, minmax(112px, 1fr))`, gap 16). With `items` it also
 * handles selection: one tile open at a time, its `renderDetail` shown as a full-width
 * `DetailPanel` inserted after the last tile of the selected tile's row.
 */
export function ItemGrid<T>(props: ItemGridProps<T>) {
  const [cols, gridRef] = useGridColumns();
  const [inner, setInner] = useState<string | null>(null);
  const style = props.minTile ? ({ '--wn-grid-min': `${props.minTile}px` } as CSSProperties) : undefined;
  const className = ['wn-grid', props.className ?? ''].filter(Boolean).join(' ');

  if (props.items === undefined) {
    return (
      <div className={className} style={style} ref={gridRef}>
        {props.children}
      </div>
    );
  }

  const { items, getKey, renderTile, renderDetail, getDetailLabel } = props;
  const controlled = props.selectedKey !== undefined;
  const selected = controlled ? props.selectedKey ?? null : inner;
  const select = (key: string | null) => {
    if (!controlled) setInner(key);
    props.onSelectedKeyChange?.(key);
  };
  const selIndex = renderDetail && selected !== null ? items.findIndex((i) => getKey(i) === selected) : -1;
  const panelAfter = selIndex < 0 ? -1 : Math.min(items.length - 1, (Math.floor(selIndex / cols) + 1) * cols - 1);

  return (
    <div className={className} style={style} ref={gridRef}>
      {items.flatMap((item, idx) => {
        const key = getKey(item);
        const isSelected = key === selected;
        const nodes: ReactNode[] = [
          <div className="wn-grid__cell" key={key}>
            {renderTile(item, { selected: isSelected, toggle: () => select(isSelected ? null : key) })}
          </div>,
        ];
        if (idx === panelAfter && renderDetail) {
          const open = items[selIndex];
          nodes.push(
            <DetailPanel key={`detail-${selected}`} title={getDetailLabel?.(open) ?? getKey(open)} onClose={() => select(null)}>
              {renderDetail(open, () => select(null))}
            </DetailPanel>,
          );
        }
        return nodes;
      })}
    </div>
  );
}
