// Components shared by the map page.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { Item } from '../loot-helper/types/item';
import { ItemIcon } from '../../shared/components/ItemIcon';
import { conditionImage } from './data/kinds';
import { iconUrl } from './data/useMapData';
import { englishName } from './state';

/** A game UI icon, tinted via CSS mask. */
export function GameIcon({ icon, color, size = 18, className }: { icon: string; color?: string; size?: number; className?: string }) {
  const style = { '--gi-url': `url(${iconUrl(icon)})`, '--gi-size': `${size}px`, ...(color ? { '--gi-color': color } : {}) } as CSSProperties;
  return <span className={`game-icon ${className ?? ''}`} style={style} aria-hidden />;
}

/**
 * A "(?)" that explains something on hover or focus, or on tap on touch screens (tap again or elsewhere to close).
 * Portal: the floating panels clip their content.
 */
export function Help({ children, label = 'Help' }: { children: ReactNode; label?: string }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const el = useRef<HTMLSpanElement>(null);
  // Pointer type of the press in progress: touch opens and closes on tap, not on the focus the tap causes.
  const press = useRef('');
  const show = (target: HTMLElement) => {
    const r = target.getBoundingClientRect();
    setAt({ x: Math.max(8, Math.min(r.left + r.width / 2 - 150, window.innerWidth - 308)), y: r.bottom + 6 });
  };
  const open = at != null;
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!(e.target instanceof Node && el.current?.contains(e.target))) setAt(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <span ref={el} className="mx-help" tabIndex={0} role="button" aria-label={label} aria-expanded={open}
      onPointerDown={(e) => { press.current = e.pointerType; }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}
      onFocus={(e) => press.current !== 'touch' && show(e.currentTarget)}
      onBlur={() => setAt(null)}
      onClick={(e) => {
        if (press.current === 'touch') {
          if (open) setAt(null);
          else show(e.currentTarget);
        }
        press.current = '';
      }}>
      ?
      {at && createPortal(<div className="mx-help-tip" role="tooltip" style={{ left: at.x, top: at.y }}>{children}</div>, document.body)}
    </span>
  );
}

export function ConditionImage({ name, className }: { name: string; className?: string }) {
  if (name === 'Normal') return <span className={`cond-img cond-img--normal ${className ?? ''}`} />;
  return <img className={`cond-img ${className ?? ''}`} src={conditionImage(name)} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />;
}

export function ItemSearch({ items, value, onChange, placeholder = 'Find an item…', compact }: {
  items: Item[]; value: Item | null; onChange: (it: Item | null) => void; placeholder?: string; compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return items.filter((it) => it.name.en.toLowerCase().includes(n) || englishName(it).toLowerCase().includes(n)).slice(0, 12);
  }, [q, items]);
  if (value && !open) {
    return (
      <div className={`item-search item-search--selected ${compact ? 'item-search--compact' : ''}`}>
        <ItemIcon itemId={value.id} name={value.name.en} icon={value.imageFilename} rarity={value.rarity} showName={false} />
        <button className="item-search__name" onClick={() => setOpen(true)}>{value.name.en}</button>
        <button className="item-search__clear" title="Clear" onClick={() => onChange(null)}><X size={14} /></button>
      </div>
    );
  }
  return (
    <div className={`item-search ${compact ? 'item-search--compact' : ''}`}>
      <Search size={15} className="item-search__icon" />
      <input
        autoFocus={open}
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) { onChange(hits[0]); setQ(''); setOpen(false); }
          if (e.key === 'Escape') { setQ(''); setOpen(false); }
        }}
      />
      {hits.length > 0 && (
        <ul className="item-search__results">
          {hits.map((it) => (
            <li key={it.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(it); setQ(''); setOpen(false); }}>
                <ItemIcon itemId={it.id} name={it.name.en} icon={it.imageFilename} rarity={it.rarity} showName={false} />
                <span>{it.name.en}</span>
                <small>{it.type}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

