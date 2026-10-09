import { useRef } from 'react';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
  /** Small image before the label (e.g. a trader portrait), 32 px. */
  image?: string;
}

export interface SegmentedControlProps<V extends string = string> {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Accessible name of the group. */
  ariaLabel: string;
  className?: string;
}

/** Radio-group style switch between sub-views (arrow keys move and select). */
export function SegmentedControl<V extends string = string>({ options, value, onChange, ariaLabel, className }: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={['wn-segmented', className ?? ''].filter(Boolean).join(' ')} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`wn-segmented__option${checked ? ' is-active' : ''}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.image && <img className="wn-segmented__img" src={option.image} alt="" loading="lazy" />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
