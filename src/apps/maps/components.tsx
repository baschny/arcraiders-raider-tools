// Components shared by the map page.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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

/** A "(?)" that explains something on hover or focus (portal: the floating panels clip their content). */
export function Help({ children, label = 'Help' }: { children: ReactNode; label?: string }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAt({ x: Math.max(8, Math.min(r.left + r.width / 2 - 150, window.innerWidth - 308)), y: r.bottom + 6 });
  };
  return (
    <span className="mx-help" tabIndex={0} role="button" aria-label={label}
      onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setAt(null)} onFocus={(e) => show(e.currentTarget)} onBlur={() => setAt(null)}>
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

