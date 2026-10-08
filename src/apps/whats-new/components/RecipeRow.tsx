import { ItemChip } from './ItemChip';
import type { AmountRef, ChipSize } from './types';

export interface RecipeRowProps {
  inputs: AmountRef[];
  outputs: AmountRef[];
  label?: string;
  labelImage?: string;
  compact?: boolean;
  size?: ChipSize;
  onItemClick?: (id: string) => void;
}

export function RecipeRow({ inputs, outputs, label, labelImage, compact = false, size, onItemClick }: RecipeRowProps) {
  const chipSize = size ?? (compact ? 'sm' : 'md');
  const renderList = (list: AmountRef[]) =>
    list.map((a, i) => (
      <ItemChip
        key={`${a.item.id}-${i}`}
        item={a.item}
        quantity={a.quantity}
        size={chipSize}
        showName={!compact}
        onClick={onItemClick ? () => onItemClick(a.item.id) : undefined}
      />
    ));
  return (
    <div className={`wn-recipe${compact ? ' wn-recipe--compact' : ''}`}>
      {(label || labelImage) && (
        <span className="wn-recipe__label">
          {labelImage && <img className="wn-recipe__label-img" src={labelImage} alt="" loading="lazy" />}
          {label && <span>{label}</span>}
        </span>
      )}
      <div className="wn-recipe__group wn-recipe__group--inputs">{renderList(inputs)}</div>
      <span className="wn-recipe__arrow" aria-hidden="true">→</span>
      <div className="wn-recipe__group wn-recipe__group--outputs">{renderList(outputs)}</div>
    </div>
  );
}
