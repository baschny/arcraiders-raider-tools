import { ItemChip } from './ItemChip';
import type { AmountRef, ItemRef } from './types';

export interface BeforeAfterRowProps {
  title?: ItemRef;
  before?: AmountRef[];
  after?: AmountRef[];
  /** Plain-value alternative to item lists, e.g. a price. */
  beforePrice?: string;
  afterPrice?: string;
  onItemClick?: (id: string) => void;
}

export function BeforeAfterRow({ title, before = [], after = [], beforePrice, afterPrice, onItemClick }: BeforeAfterRowProps) {
  const afterIds = new Set(after.map((a) => a.item.id));
  const beforeIds = new Set(before.map((a) => a.item.id));
  const click = (id: string) => (onItemClick ? () => onItemClick(id) : undefined);
  return (
    <div className="wn-ba">
      {title && <ItemChip item={title} size="md" showName onClick={click(title.id)} className="wn-ba__title" />}
      <div className="wn-ba__side wn-ba__side--before">
        {beforePrice !== undefined && <span className="wn-ba__price">{beforePrice}</span>}
        {before.map((a, i) => (
          <ItemChip
            key={`b-${a.item.id}-${i}`}
            item={a.item}
            quantity={a.quantity}
            size="sm"
            onClick={click(a.item.id)}
            className={afterIds.has(a.item.id) ? '' : 'wn-ba__removed'}
          />
        ))}
      </div>
      <span className="wn-ba__arrow" aria-hidden="true">→</span>
      <div className="wn-ba__side wn-ba__side--after">
        {afterPrice !== undefined && <span className="wn-ba__price">{afterPrice}</span>}
        {after.map((a, i) => (
          <ItemChip
            key={`a-${a.item.id}-${i}`}
            item={a.item}
            quantity={a.quantity}
            size="sm"
            onClick={click(a.item.id)}
            className={beforeIds.has(a.item.id) ? '' : 'wn-ba__added'}
          />
        ))}
      </div>
    </div>
  );
}
