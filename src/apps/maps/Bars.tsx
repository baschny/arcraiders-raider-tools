// Map switcher and condition bar (floating over the map), and the Loot / ARC mode switch (top of the left bar).
import { Crosshair, Package } from 'lucide-react';
import { fmtScore } from './data/scoring';
import { ConditionImage } from './components';
import type { Explorer } from './model';
import { sortedMaps, type Mode } from './state';

export function MapBar({ ex }: { ex: Explorer }) {
  const totals = ex.state.mode === 'loot' ? ex.mapTotals : null;
  const best = totals ? Math.max(...totals.values()) : 0;
  return (
    <nav className="mx-mapbar">
      {sortedMaps(ex.index).map((m) => {
        const sc = totals?.get(m.map);
        return (
          <button key={m.map} className={`${m.map === ex.map.map ? 'active' : ''} ${sc && sc === best ? 'best' : ''}`} onClick={() => ex.set({ map: m.map })}
            title={totals ? `${m.name}: item score ${sc ? fmtScore(sc) : '–'} (normal conditions)` : m.name}>
            <span>{m.name}</span>
            {totals && <small>{sc ? fmtScore(sc) : '–'}</small>}
          </button>
        );
      })}
    </nav>
  );
}

export function ConditionBar({ ex }: { ex: Explorer }) {
  const { map, ci, condTotals } = ex;
  if (map.conditions.length < 2) return null;
  const also = map.conditions[ci].category === 'normal' ? map.conditions[0].also : undefined;
  return (
    <nav className="mx-conds">
      {map.conditions.map((c, i) => {
        const title = c.category === 'normal' ? `Normal map${c.also ? ` — same static loot and spawns as: ${c.also.join(', ')}` : ''}`
          : `${c.category === 'major' ? 'Major' : 'Minor'} condition${c.live ? ' (in the current schedule)' : ''}`;
        return (
          <button key={c.key} className={`${i === ci ? 'on' : ''} ${c.category} ${c.live ? 'live' : ''}`} onClick={() => ex.set({ cond: c.key })} title={title}>
            <ConditionImage name={c.name} />
            <span>{c.name}</span>
            {condTotals && <small>{condTotals[i] ? fmtScore(condTotals[i]) : '–'}</small>}
          </button>
        );
      })}
      {also && <span className="mx-also" title={also.join(', ')}>+ {also.length} same as Normal</span>}
    </nav>
  );
}

const MODES: { key: Mode; label: string; icon: typeof Package }[] = [
  { key: 'loot', label: 'Loot', icon: Package },
  { key: 'arc', label: 'ARC', icon: Crosshair },
];

export function ModeSwitch({ ex }: { ex: Explorer }) {
  return (
    <nav className="mx-modes">
      {MODES.map((m) => (
        <button key={m.key} className={`${ex.state.mode === m.key ? 'on' : ''} mode-${m.key}`} onClick={() => ex.set({ mode: m.key })}>
          <m.icon size={14} />{m.label}
        </button>
      ))}
    </nav>
  );
}
