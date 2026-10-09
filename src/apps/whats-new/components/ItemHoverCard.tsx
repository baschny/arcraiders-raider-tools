import {
  cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { ItemRef } from './types';

export interface HoverRow {
  key: string;
  item?: ItemRef;
  /** Bench / trader image, used when there is no item. */
  image?: string;
  /** Free icon (e.g. a glyph), used when there is neither item nor image. */
  glyph?: ReactNode;
  label: string;
  /** Muted line under the label, e.g. "Level 2 · 2,000 RP". */
  detail?: string;
  /** Right-aligned, e.g. "3×". */
  amount?: string;
  isBlueprint?: boolean;
}

export interface HoverSection {
  key: string;
  title: string;
  rows: HoverRow[];
  /** Renders a "+N more" line below the rows. */
  more?: number;
}

export interface ItemHoverCardProps {
  item: ItemRef;
  /** Category / rarity text under the name. */
  subtitle?: string;
  badges?: string[];
  sections: HoverSection[];
  /** The trigger, e.g. an ItemTile. */
  children: ReactElement;
  disabled?: boolean;
}

const OPEN_DELAY = 150;
const CLOSE_DELAY = 120;
const GAP = 8;
const MARGIN = 8;

// ---- one card open at a time ---------------------------------------------------------------
let activeId: string | null = null;
const listeners = new Set<() => void>();
function setActive(id: string | null) {
  if (activeId === id) return;
  activeId = id;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getActive = () => activeId;

// ---- presentational body ---------------------------------------------------------------------
function RowIcon({ row }: { row: HoverRow }) {
  if (row.item) {
    return (
      <ItemIcon
        itemId={row.item.id}
        name={row.item.name}
        icon={row.item.icon}
        rarity={row.item.rarity}
        isBlueprint={row.isBlueprint}
        showName={false}
        showQuantity={false}
        className="wn-hc__row-icon"
      />
    );
  }
  if (row.image) return <img className="wn-hc__row-image" src={row.image} alt="" loading="lazy" />;
  if (row.glyph) return <span className="wn-hc__row-glyph">{row.glyph}</span>;
  return <span className="wn-hc__row-glyph" />;
}

export interface ItemHoverCardBodyProps {
  item: ItemRef;
  subtitle?: string;
  badges?: string[];
  sections: HoverSection[];
}

/** The card content without positioning; rendered inside the portal. */
export function ItemHoverCardBody({ item, subtitle, badges, sections }: ItemHoverCardBodyProps) {
  const { tm } = useLocale();
  const shown = sections.filter((s) => s.rows.length > 0);
  return (
    <>
      <div className={`wn-hc__header${shown.length > 0 ? ' wn-hc__header--divided' : ''}`}>
        <ItemIcon
          itemId={item.id}
          name={item.name}
          icon={item.icon}
          rarity={item.rarity}
          showName={false}
          showQuantity={false}
          className="wn-hc__icon"
        />
        <div className="wn-hc__title">
          <h3>{item.name}</h3>
          {subtitle && <div className="wn-hc__subtitle">{subtitle}</div>}
          {badges && badges.length > 0 && (
            <div className="wn-hc__badges">
              {badges.map((b) => (
                <span key={b} className="wn-hc__badge">{b}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {shown.map((section) => (
        <div className="wn-hc__section" key={section.key}>
          <h4>{section.title}</h4>
          <div className="wn-hc__rows">
            {section.rows.map((row) => (
              <div className="wn-hc__row" key={row.key}>
                <RowIcon row={row} />
                <div className="wn-hc__row-text">
                  <span className="wn-hc__row-label">{row.label}</span>
                  {row.detail && <span className="wn-hc__row-detail">{row.detail}</span>}
                </div>
                {row.amount && <span className="wn-hc__row-amount">{row.amount}</span>}
              </div>
            ))}
          </div>
          {section.more !== undefined && section.more > 0 && (
            <div className="wn-hc__more">{tm('whatsNew.common.more', { count: section.more })}</div>
          )}
        </div>
      ))}
    </>
  );
}

// ---- the interactive wrapper -----------------------------------------------------------------
export function ItemHoverCard({ item, subtitle, badges, sections, children, disabled = false }: ItemHoverCardProps) {
  const id = `wn-hc-${useId().replace(/:/g, '')}`;
  const open = useSyncExternalStore(subscribe, getActive, getActive) === id && !disabled;
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const lastPointer = useRef<string>('mouse');
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const openSoon = useCallback((delay: number) => {
    clearTimer();
    timer.current = window.setTimeout(() => setActive(id), delay);
  }, [id]);
  const closeSoon = useCallback((delay: number) => {
    clearTimer();
    timer.current = window.setTimeout(() => {
      if (activeId === id) setActive(null);
    }, delay);
  }, [id]);

  useEffect(() => () => {
    clearTimer();
    if (activeId === id) setActive(null);
  }, [id]);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = card.offsetWidth;
    const h = Math.min(card.scrollHeight, vh - 2 * MARGIN);
    let left = r.right + GAP;
    if (left + w > vw - MARGIN) left = r.left - GAP - w;
    left = Math.max(MARGIN, Math.min(left, vw - MARGIN - w));
    const top = Math.max(MARGIN, Math.min(r.top, vh - MARGIN - h));
    setPos({ left, top, maxHeight: vh - 2 * MARGIN });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Page scrolling moves the trigger away: close instead of chasing it (scrolling inside the card is fine).
    const onScroll = (e: Event) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return;
      setActive(null);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      setPos(null);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || cardRef.current?.contains(t)) return;
      setActive(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (disabled) return children;

  const childClickable = Boolean((children.props as { onClick?: unknown }).onClick);
  const trigger = (
    <div
      ref={triggerRef}
      className="wn-hc-trigger"
      tabIndex={childClickable ? undefined : 0}
      aria-describedby={open ? id : undefined}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
      }}
      onPointerEnter={(e) => {
        lastPointer.current = e.pointerType;
        if (e.pointerType === 'mouse') openSoon(OPEN_DELAY);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') closeSoon(CLOSE_DELAY);
      }}
      onFocus={() => openSoon(0)}
      onBlur={() => closeSoon(CLOSE_DELAY)}
      onClick={() => {
        if (lastPointer.current !== 'mouse') {
          clearTimer();
          setActive(activeId === id ? null : id);
        }
      }}
    >
      {cloneElement(children)}
    </div>
  );

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={cardRef}
            id={id}
            role="tooltip"
            className="wn-hc"
            style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { left: 0, top: 0, visibility: 'hidden' }}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') clearTimer();
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') closeSoon(CLOSE_DELAY);
            }}
          >
            <ItemHoverCardBody item={item} subtitle={subtitle} badges={badges} sections={sections} />
          </div>,
          document.body,
        )}
    </>
  );
}
