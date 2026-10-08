export interface CounterProps {
  label?: string;
  /** Omit for a total-only counter ("100 pieces"). */
  value?: number;
  total: number;
}

export function Counter({ label, value, total }: CounterProps) {
  const done = value !== undefined && total > 0 && value >= total;
  return (
    <span className={`wn-counter${done ? ' wn-counter--done' : ''}`}>
      {value !== undefined ? (
        <>
          {label && <span className="wn-counter__label">{label}</span>}
          <span className="wn-counter__value">{value}/{total}</span>
        </>
      ) : (
        <>
          <span className="wn-counter__value">{total}</span>
          {label && <span className="wn-counter__label">{label}</span>}
        </>
      )}
    </span>
  );
}
