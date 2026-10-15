import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ItemTooltip } from '../../quartermaster/components/ItemTooltip';
import type { ItemsMap } from '../../quartermaster/types/item';
import { ItemOverlayContext } from './overlayContext';

interface OverlayState {
  slug: string;
  position: { x: number; y: number; maxHeight: number };
}

const WIDTH = 430;
const HEIGHT = 560;
const MARGIN = 12;

// Same placement as the Quartermaster: right of the anchor, else left, clamped to the viewport.
function placeNextTo(anchor: HTMLElement): OverlayState['position'] {
  const rect = anchor.getBoundingClientRect();
  let x = rect.right + 10;
  let y = rect.top;
  if (x + WIDTH > window.innerWidth - MARGIN) x = rect.left - WIDTH - 10;
  if (x < MARGIN) x = MARGIN;
  if (y + HEIGHT > window.innerHeight - MARGIN) y = window.innerHeight - HEIGHT - MARGIN;
  if (y < MARGIN) y = MARGIN;
  return { x, y, maxHeight: Math.max(250, window.innerHeight - y - MARGIN) };
}

/** Hosts the item overlay (Quartermaster `ItemTooltip` in catalog mode) for the update pages. */
export function ItemOverlayProvider({ items, children }: { items: ItemsMap; children: ReactNode }) {
  const [state, setState] = useState<OverlayState | null>(null);

  const open = useCallback((slug: string, anchor: HTMLElement) => {
    setState((cur) => (cur?.slug === slug ? null : { slug, position: placeNextTo(anchor) }));
  }, []);

  // Closes on a click elsewhere, Escape or scrolling (the overlay is fixed to the viewport).
  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.querySelector('.main-content')?.addEventListener('scroll', close, { passive: true });
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      document.querySelector('.main-content')?.removeEventListener('scroll', close);
      window.removeEventListener('scroll', close);
    };
  }, [state]);

  const api = useMemo(() => ({ items, open }), [items, open]);
  const item = state ? items[state.slug] : undefined;

  return (
    <ItemOverlayContext.Provider value={api}>
      {children}
      {state && item && <ItemTooltip item={item} itemsMap={items} position={state.position} visible />}
    </ItemOverlayContext.Provider>
  );
}
