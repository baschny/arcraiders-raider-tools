import type { CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { AmplifiedWeapon } from '../../../../shared/gamedata/types';
import { ItemTile } from '../../components';
import type { ItemRef } from '../../components';
import { layoutGraph, type GraphEdge } from './graph';
import { canSelect, type CanSelect } from './picker';

export interface AmplificationGraphProps {
  weapon: AmplifiedWeapon;
  selected: string[];
  /** The Amplified weapon, shown as the root of every path. */
  root: ItemRef;
  nameOf: (id: string) => string;
  onToggle: (id: string) => void;
  hovered: string | null;
  onHover: (id: string | null) => void;
}

/** The game glyph as a white mask inside a hexagon. */
export function HexGlyph({ icon }: { icon?: string }) {
  const url = icon ? `url("${icon}")` : undefined;
  return <span className="wn-hex__glyph" style={url ? { maskImage: url, WebkitMaskImage: url } : undefined} aria-hidden="true" />;
}

type EdgeState = 'idle' | 'chosen' | 'blocked';
const ORDER: Record<EdgeState, number> = { idle: 0, blocked: 1, chosen: 2 };

/**
 * The Amplifications as a graph like in the game: paths run from the Amplified weapon to the right,
 * chosen = orange hexagon and lit path, blocked by an exclusion = red path and greyed hexagon.
 */
export function AmplificationGraph({ weapon, selected, root, nameOf, onToggle, hovered, onHover }: AmplificationGraphProps) {
  const { t, tm } = useLocale();
  const layout = layoutGraph(weapon);
  const amps = new Map(weapon.amplifications.map((a) => [a.id, a]));
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  const checks = new Map<string, CanSelect>(weapon.amplifications.map((a) => [a.id, canSelect(selected, a, weapon)]));

  const stateOf = (id: string): EdgeState => {
    if (selected.includes(id)) return 'chosen';
    const c = checks.get(id);
    return c && !c.ok && c.reason === 'excluded' ? 'blocked' : 'idle';
  };

  const reasonOf = (id: string): string | undefined => {
    const c = checks.get(id);
    if (!c || c.ok || selected.includes(id)) return undefined;
    if (c.reason === 'requires') return tm('whatsNew.amplified.lockedRequires', { name: nameOf(c.by ?? '') });
    if (c.reason === 'excluded' && c.by) return tm('whatsNew.amplified.lockedExcluded', { name: nameOf(c.by) });
    return t('whatsNew.amplified.lockedUnavailable');
  };

  const edges = [...layout.edges].sort((a, b) => ORDER[stateOf(a.to)] - ORDER[stateOf(b.to)]);
  const style = { '--cols': layout.cols, '--rows': layout.rows } as CSSProperties;
  const at = (col: number, row: number) => ({ '--c': col, '--r': row }) as CSSProperties;

  const renderEdge = (e: GraphEdge) => {
    const to = pos.get(e.to);
    if (!to) return null;
    const from = e.from ? pos.get(e.from) : layout.root;
    if (!from) return null;
    const cls = `wn-graph__edge is-${stateOf(e.to)}${hovered === e.to ? ' is-hover' : ''}`;
    const vars = { '--c1': from.col, '--r1': from.row, '--c2': to.col, '--r2': to.row } as CSSProperties;
    return (
      <span key={e.to} className={cls} style={vars} aria-hidden="true">
        <span className={`wn-graph__h1${from.row !== to.row ? ' is-bent' : ''}`} />
        {from.row !== to.row && <span className="wn-graph__v" />}
        {from.row !== to.row && <span className="wn-graph__h2" />}
      </span>
    );
  };

  return (
    <div className="wn-graph" role="group" aria-label={t('whatsNew.amplified.amplification')}>
      <div className="wn-graph__canvas" style={style}>
        {edges.map(renderEdge)}
        <div className="wn-graph__root" style={at(0, layout.root.row)}>
          <ItemTile item={root} size={48} hideName title={root.name} />
        </div>
        {layout.nodes.map((n) => {
          const amp = amps.get(n.id);
          if (!amp) return null;
          const chosen = selected.includes(n.id);
          const state = stateOf(n.id);
          const reason = reasonOf(n.id);
          const name = nameOf(n.id);
          const classes = ['wn-hex', chosen ? 'is-chosen' : '', state === 'blocked' ? 'is-blocked' : '', reason ? 'is-locked' : '', hovered === n.id ? 'is-hover' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <div key={n.id} className={classes} style={at(n.col, n.row)}>
              <button
                type="button"
                className="wn-hex__shape"
                aria-pressed={chosen}
                aria-disabled={reason ? true : undefined}
                aria-label={name}
                title={reason ? `${name}: ${reason}` : name}
                onClick={() => !reason && onToggle(n.id)}
                onMouseEnter={() => onHover(n.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(n.id)}
                onBlur={() => onHover(null)}
              >
                <HexGlyph icon={amp.icon} />
              </button>
              {amp.researchItemId && (
                <span className="wn-hex__lock" title={t('whatsNew.amplified.needsResearch')}>
                  <Lock size={10} aria-hidden="true" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
