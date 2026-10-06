// Map switcher and condition bar (floating over the map), and the Loot / ARC mode switch (top of the left bar).
import { Crosshair, Package } from 'lucide-react';
import { ConditionImage } from './components';
import type { Explorer } from './model';
import { sortedMaps, type Mode } from './state';
import { useMapText } from './text';

export function MapBar({ ex }: { ex: Explorer }) {
  const tx = useMapText();
  const totals = ex.state.mode === 'loot' ? ex.mapTotals : null;
  const best = totals ? Math.max(...totals.values()) : 0;
  const name = ex.names.of;
  return (
    <nav className="mx-mapbar">
      {sortedMaps(ex.index).map((m) => {
        const sc = totals?.get(m.map);
        return (
          <button key={m.map} className={`${m.map === ex.map.map ? 'active' : ''} ${sc && sc === best ? 'best' : ''}`} onClick={() => ex.set({ map: m.map })}
            title={totals ? tx.tm('maps.mapBar.scoreTitle', { map: name(m), score: sc ? tx.score(sc) : '–' }) : name(m)}>
            <span>{name(m)}</span>
            {totals && <small>{sc ? tx.score(sc) : '–'}</small>}
          </button>
        );
      })}
    </nav>
  );
}

export function ConditionBar({ ex }: { ex: Explorer }) {
  const tx = useMapText();
  const { map, ci, condTotals, names } = ex;
  if (map.conditions.length < 2) return null;
  const also = map.conditions[ci].category === 'normal' ? map.conditions[0].also?.map(names.condition) : undefined;
  return (
    <nav className="mx-conds">
      {map.conditions.map((c, i) => {
        const title = c.category === 'normal'
          ? (c.also ? tx.tm('maps.conditionBar.normalAlso', { conditions: tx.list(c.also.map(names.condition)) }) : tx.t('maps.conditionBar.normal'))
          : tx.t(`maps.conditionBar.${c.category === 'major' ? 'major' : 'minor'}${c.live ? 'Live' : ''}`);
        return (
          <button key={c.key} className={`${i === ci ? 'on' : ''} ${c.category} ${c.live ? 'live' : ''}`} onClick={() => ex.set({ cond: c.key })} title={title}>
            <ConditionImage name={c.name} />
            <span>{names.of(c)}</span>
            {condTotals && <small>{condTotals[i] ? tx.score(condTotals[i]) : '–'}</small>}
          </button>
        );
      })}
      {also && <span className="mx-also" title={tx.list(also)}>{tx.tm('maps.conditionBar.sameAsNormal', { count: tx.num(also.length), normal: names.condition('Normal') })}</span>}
    </nav>
  );
}

const MODES: { key: Mode; label: string; icon: typeof Package }[] = [
  { key: 'loot', label: 'maps.modes.loot', icon: Package },
  { key: 'arc', label: 'lootHelper.locations.arc', icon: Crosshair },
];

export function ModeSwitch({ ex }: { ex: Explorer }) {
  const { t } = useMapText();
  return (
    <nav className="mx-modes">
      {MODES.map((m) => (
        <button key={m.key} className={`${ex.state.mode === m.key ? 'on' : ''} mode-${m.key}`} onClick={() => ex.set({ mode: m.key })}>
          <m.icon size={14} />{t(m.label)}
        </button>
      ))}
    </nav>
  );
}
