export interface CounterProps {
  label?: string;
  value: number;
  total: number;
}

export function Counter({ label, value, total }: CounterProps) {
  const done = total > 0 && value >= total;
  return (
    <span className={`wn-counter${done ? ' wn-counter--done' : ''}`}>
      {label && <span className="wn-counter__label">{label}</span>}
      <span className="wn-counter__value">{value}/{total}</span>
    </span>
  );
}
