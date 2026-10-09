import type { Verdict } from './types';

export interface VerdictBadgeProps {
  verdict: Verdict;
  /** Label text, supplied by the caller (localized). Falls back to the verdict key. */
  label?: string;
  count?: number;
  /** Position absolutely in the top-left corner of an ItemIcon tile. */
  corner?: boolean;
}

/** Class that positions a VerdictBadge on an ItemIcon corner (also applied by `corner`). */
export const VERDICT_CORNER_CLASS = 'wn-verdict--corner';

export function VerdictBadge({ verdict, label, count, corner = false }: VerdictBadgeProps) {
  return (
    <span
      className={`wn-verdict wn-verdict--${verdict}${corner ? ` ${VERDICT_CORNER_CLASS}` : ''}`}
      data-verdict={verdict}
    >
      {label ?? verdict}
      {count !== undefined && <span className="wn-verdict__count">{count}</span>}
    </span>
  );
}
