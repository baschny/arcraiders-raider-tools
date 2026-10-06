// Phone layout: the left bar as a bottom sheet. Collapsed it shows only its head (drag handle, mode switch, current
// item); tap the head or drag it up to open it to 60 % of the map height, down to close it.
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';

export function BottomSheet({ open, onOpenChange, head, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; head: ReactNode; children: ReactNode;
}) {
  // Height in px while dragging (null: the CSS height of the open or collapsed sheet).
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ id: number; y0: number; h0: number; min: number; max: number; moved: boolean } | null>(null);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    // Buttons in the head (mode switch, open/close) keep their taps.
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const sheet = e.currentTarget.parentElement!, body = sheet.parentElement!;
    drag.current = { id: e.pointerId, y0: e.clientY, h0: sheet.offsetHeight, min: e.currentTarget.offsetHeight, max: body.clientHeight * 0.9, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientY - d.y0) < 6) return;
    d.moved = true;
    setDragH(Math.min(d.max, Math.max(d.min, d.h0 + d.y0 - e.clientY)));
  };
  const up = (e: PointerEvent<HTMLDivElement>, released: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragH(null);
    if (!released) return;
    if (!d.moved) onOpenChange(!open);
    else {
      // Settle on the nearer state, measured against the open height (60 % of the map, max is 90 %).
      const h = Math.min(d.max, Math.max(d.min, d.h0 + d.y0 - e.clientY)), openH = (d.max / 0.9) * 0.6;
      onOpenChange(h > (d.min + openH) / 2);
    }
  };

  return (
    <div className={`mx-area-side mx-sheet ${open ? 'mx-sheet--open' : ''} ${dragH != null ? 'mx-sheet--drag' : ''}`}
      style={dragH != null ? { height: dragH } : undefined}>
      <div className="mx-sheet__head" onPointerDown={down} onPointerMove={move} onPointerUp={(e) => up(e, true)} onPointerCancel={(e) => up(e, false)}>
        <span className="mx-sheet__grip" aria-hidden />
        <div className="mx-sheet__row">
          {head}
          <button className="mx-sheet__toggle" aria-expanded={open} aria-label={open ? 'Hide filters' : 'Show filters'}
            onClick={() => onOpenChange(!open)}><ChevronUp size={18} /></button>
        </div>
      </div>
      <div className="mx-sheet__body" inert={!open && dragH == null}>{children}</div>
    </div>
  );
}
