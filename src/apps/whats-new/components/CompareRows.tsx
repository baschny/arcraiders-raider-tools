import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemTile } from './ItemTile';
import type { TileSpec } from './types';

export interface CompareCost extends TileSpec {
  /** `removed`: only before 2.0 (dimmed); `added`: only now (green outline). */
  state?: 'removed' | 'added';
}

export interface CompareRow {
  key: string;
  /** The thing that changed (64 px tile with name). */
  item: TileSpec;
  before: readonly CompareCost[];
  now: readonly CompareCost[];
  /** Shown instead of an empty `before` / `now` list (default "—"). */
  beforeText?: string;
  nowText?: string;
  /** `removed`: the whole row is dimmed; `added`: the item tile gets a green outline. */
  status?: 'removed' | 'added';
}

export interface CompareRowsProps {
  rows: readonly CompareRow[];
  /** Column headings; default "Before 2.0" and "Now". */
  beforeLabel?: string;
  nowLabel?: string;
  /** Heading of the item column (visually hidden when omitted). */
  itemLabel?: string;
  className?: string;
}

function Costs({ costs, text }: { costs: readonly CompareCost[]; text?: string }) {
  if (costs.length === 0) return <span className="wn-compare__none">{text ?? '—'}</span>;
  return (
    <div className="wn-compare__costs">
      {costs.map((cost, i) => (
        <ItemTile
          key={`${cost.item.id}-${i}`}
          item={cost.item}
          size={48}
          amount={cost.amount}
          sublabel={cost.sublabel}
          isBlueprint={cost.isBlueprint}
          className={cost.state ? `wn-compare__cost wn-compare__cost--${cost.state}` : 'wn-compare__cost'}
        />
      ))}
    </div>
  );
}

export function CompareRows({ rows, beforeLabel, nowLabel, itemLabel, className }: CompareRowsProps) {
  const { t } = useLocale();
  return (
    <div className={['wn-compare', className ?? ''].filter(Boolean).join(' ')} role="table">
      <div className="wn-compare__head" role="row">
        <span className={itemLabel ? 'wn-compare__col' : 'wn-compare__col wn-compare__col--hidden'} role="columnheader">{itemLabel ?? ''}</span>
        <span className="wn-compare__col" role="columnheader">{beforeLabel ?? t('whatsNew.common.before')}</span>
        <span className="wn-compare__col" role="columnheader">{nowLabel ?? t('whatsNew.common.now')}</span>
      </div>
      {rows.map((row) => (
        <div className={`wn-compare__row${row.status ? ` wn-compare__row--${row.status}` : ''}`} role="row" key={row.key}>
          <div className="wn-compare__item" role="cell">
            <ItemTile item={row.item.item} size={64} amount={row.item.amount} sublabel={row.item.sublabel} isBlueprint={row.item.isBlueprint} />
          </div>
          <div className="wn-compare__cell" role="cell">
            <Costs costs={row.before} text={row.beforeText} />
          </div>
          <div className="wn-compare__cell" role="cell">
            <Costs costs={row.now} text={row.nowText} />
          </div>
        </div>
      ))}
    </div>
  );
}
