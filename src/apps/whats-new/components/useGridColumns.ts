import { useCallback, useState } from 'react';

const DEFAULT_COLS = 4;

/** Number of columns the grid currently lays out (re-measured on resize). Returns [count, ref callback]. */
export function useGridColumns(): [number, (el: HTMLElement | null) => void] {
  const [cols, setCols] = useState(DEFAULT_COLS);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n > 0) setCols(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // React 19 calls a returned cleanup when the ref detaches.
    return () => ro.disconnect();
  }, []);
  return [cols, ref as (el: HTMLElement | null) => void];
}
