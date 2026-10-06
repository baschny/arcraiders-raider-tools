// Left bar: Loot mode (item search, spawn spot filters down to container types, best areas) and ARC mode (enemy
// filter). Every filter row works the same at every depth: the chevron opens it, the rest of the row switches it.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronRight, Minus } from 'lucide-react';
import { CATEGORIES, enemyIcon, kindsOf, leavesOf, lootZone, type SpotCategory, type SpotKind } from './data/kinds';
import { lootStore, useStore } from '../../shared/state/stores';
import { GameIcon, Help, ItemSearch } from './components';
import type { Count, Explorer } from './model';
import { useMapText, type MapText } from './text';

const AREA_ICON: Record<string, string> = {
  Electrical: 'loot-electrical', Industrial: 'loot-industrial', Commercial: 'loot-commercial', Residential: 'loot-household',
  Technological: 'loot-tech', Mechanical: 'loot-mechanical', Medical: 'loot-medical', Security: 'loot-military', OldWorld: 'loot-educational',
  Exodus: 'loot-exodus', ARC: 'loot-arc', Raider: 'loot-raider', Nature: 'loot-nature',
};

const ZERO: Count = { n: 0, hit: 0, exp: 0 };

export function Sidebar({ ex, onFocusPoi }: { ex: Explorer; onFocusPoi: (i: number) => void }) {
  return (
    <aside className="mx-side">
      {ex.state.mode === 'loot' ? <LootPanel ex={ex} onFocusPoi={onFocusPoi} /> : <ArcPanel ex={ex} />}
    </aside>
  );
}

function LootPanel({ ex, onFocusPoi }: { ex: Explorer; onFocusPoi: (i: number) => void }) {
  const tx = useMapText();
  const [loot] = useStore(lootStore);
  const goals = useMemo(() => ex.lootable.filter((it) => loot.goalItems.includes(it.id)), [ex.lootable, loot.goalItems]);
  const { item, lootItem, share, score, map } = ex;
  const tables = share ? Object.keys(share).sort((a, b) => share[b] - share[a]) : [];
  const areaTags = (lootItem?.tags ?? []).filter((t) => t.startsWith('Category.Area.')).map((t) => t.split('.')[2]);
  const best = useMemo(() => {
    if (!score) return [];
    const rows = map.pois.map((p, i) => ({ i, p, ...score.pois[i] })).filter((r) => r.score > 0 && ex.onLayer('pois', r.i)).sort((a, b) => b.score - a.score).slice(0, 25);
    const max = Math.max(1e-9, ...rows.map((r) => r.score));
    return rows.map((r) => ({ ...r, rel: r.score / max }));
  }, [score, map, ex]);

  return (
    <>
      <section className="mx-sec">
        <ItemSearch items={ex.lootable} value={item} onChange={(it) => ex.set({ item: it?.id ?? null, show: new Set() })} placeholder={tx.t('maps.loot.searchPlaceholder')} />
        {goals.length > 0 && !item && (
          <div className="mx-goals" title={tx.t('maps.loot.goalsTitle')}>
            {goals.slice(0, 12).map((g) => (
              <button key={g.id} onClick={() => ex.set({ item: g.id, show: new Set() })} title={tx.itemName(g)}>
                <img src={g.imageFilename} alt={tx.itemName(g)} />
              </button>
            ))}
          </div>
        )}
        {item && lootItem && (
          <div className="mx-item">
            <div className="mx-item__tags">
              {areaTags.map((t) => <span key={t}><GameIcon icon={AREA_ICON[t] ?? 'pin'} size={12} />{tx.location(t)}</span>)}
              {(lootItem.tags ?? []).filter((t) => t.startsWith('Tier.') || t.startsWith('Rarity.')).map((t) => <span key={t} className="tier">{tx.itemTag(t)}</span>)}
            </div>
            <div className="mx-item__tables" title={tx.t('maps.loot.tablesTitle')}>
              {tables.length ? tables.slice(0, 6).map((t) => <span key={t}><b>{t}</b> {tx.pct(share![t], 1)}</span>) : tx.t('maps.loot.noTables')}
            </div>
            {ex.note && (
              <div className="mx-item__note">
                {tx.tm('maps.loot.onlyHarvested', {
                  containers: tx.list(ex.note.containers.map(tx.containerName)),
                  conditions: tx.list(ex.note.conditions.map((c) => (c.why
                    ? tx.tm('maps.loot.conditionWhy', { condition: ex.names.condition(c.name), reason: tx.conditionReason(c.why) })
                    : ex.names.condition(c.name)))),
                })}
              </div>
            )}
          </div>
        )}
        {item && !lootItem && <p className="mx-empty">{tx.t('maps.loot.notInLoot')}</p>}
      </section>

      <SpotFilters ex={ex} />

      {best.length > 0 && (
        <section className="mx-sec">
          <div className="mx-sec__head">
            <h3>{tx.tm('maps.best.title', { condition: ex.names.of(ex.cond) })}</h3>
            <Help label={tx.t('maps.best.helpLabel')}>{tx.t('maps.best.help')}</Help>
          </div>
          <div className="mx-best">
            {best.map((r) => {
              const z = lootZone(r.p.threat, r.p.themes);
              return (
                <button key={r.i} onClick={() => onFocusPoi(r.i)}>
                  <span className="mx-best__top"><b>{ex.names.poi(r.p)}</b><em>{tx.score(r.score)}</em></span>
                  <span className="mx-best__sub">
                    {[tx.plural('maps.best.spots', r.sockets, { hits: tx.num(r.hits) }), tx.tm('maps.best.perSpot', { score: tx.score(r.score / r.sockets) }), z ? tx.zone(z) : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                  <span className="mx-bar"><i style={{ '--rel': `${(r.rel * 100).toFixed(1)}%` } as CSSProperties} /></span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- spawn spot filters

type Sel = 'on' | 'partial' | 'off';

/** Count cell: main number, optional "/ total", and a tooltip saying what it means. */
interface CountView { main: string; of?: string; title: string; dim?: boolean }

function FilterRow({ tx, depth, sel, open, onOpen, onToggle, icon, label, count, color, dim, strong }: {
  tx: MapText; depth: 0 | 1 | 2; sel: Sel; open?: boolean; onOpen?: () => void; onToggle: () => void; icon?: ReactNode; label: string;
  count: CountView; color?: string; dim?: boolean; strong?: boolean;
}) {
  return (
    <div className={`mx-row mx-row--d${depth} is-${sel} ${dim ? 'is-dim' : ''} ${strong ? 'mx-row--cat' : ''}`} style={color ? ({ '--kind': color } as CSSProperties) : undefined}>
      {onOpen
        ? <button className={`mx-row__exp ${open ? 'open' : ''}`} onClick={onOpen} aria-expanded={!!open}
          aria-label={tx.tm(open ? 'maps.filters.collapseGroup' : 'maps.filters.expandGroup', { group: label })} title={open ? tx.t('shared.sidebar.collapse') : tx.t('maps.filters.expand')}><ChevronRight size={14} /></button>
        : <span className="mx-row__exp" />}
      <button className="mx-row__main" role="checkbox" aria-checked={sel === 'on' ? true : sel === 'partial' ? 'mixed' : false} onClick={onToggle}>
        <span className="mx-check">{sel === 'on' ? <Check size={11} strokeWidth={3} /> : sel === 'partial' ? <Minus size={11} strokeWidth={3} /> : null}</span>
        {icon}
        <span className="mx-row__label" title={label}>{label}</span>
        <span className={`mx-row__n ${count.dim ? 'dim' : ''}`} title={count.title}>{count.main}{count.of && <small>/{count.of}</small>}</span>
      </button>
    </div>
  );
}

function SpotFilters({ ex }: { ex: Explorer }) {
  const tx = useMapText();
  const { counts, shown, cls, score, map } = ex;
  const item = !!score;
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(['Exits', 'Containers']));
  const [openKinds, setOpenKinds] = useState<Set<string>>(() => new Set());
  // With a new item, open exactly the categories that hold it.
  const autoKey = item ? `${ex.state.item}|${map.map}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (autoKey && autoKey !== seenKey) {
    setSeenKey(autoKey);
    setOpenCats(new Set(CATEGORIES.filter((cat) => (counts.get(cat.key)?.hit ?? 0) > 0).map((cat) => cat.key)));
  }

  const c = (key: string) => counts.get(key) ?? ZERO;
  const kindsHere = (cat: SpotCategory) => kindsOf(cat.key).filter((x) => c(x.key).n);
  // Container types sorted by their label in the site language.
  const leavesHere = (kind: SpotKind) => leavesOf(cls, kind).filter((l) => c(l).n)
    .map((l) => ({ l, label: cls.types.has(kind.key) ? tx.containerType(l.slice(2)) : '' }))
    .sort((a, b) => a.label.localeCompare(b.label, tx.intlLocale)).map((x) => x.l);
  // With an item and nothing picked, the implicit selection (all that can hold it) becomes explicit first.
  const toggle = (keys: string[]) => ex.set((cur) => {
    const next = new Set(cur.show.size ? cur.show : shown), all = keys.every((x) => next.has(x));
    keys.forEach((x) => (all ? next.delete(x) : next.add(x)));
    return { show: next };
  });
  const selOf = (leaves: string[]): Sel => {
    const on = leaves.filter((l) => shown.has(l)).length;
    return on === 0 ? 'off' : on === leaves.length ? 'on' : 'partial';
  };
  const flip = (set: Set<string>, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  };

  const count = (cnt: Count, spawned: boolean, sockets: boolean): CountView => {
    const n = tx.num(cnt.n);
    if (sockets) {
      if (!item) return { main: n, title: tx.plural('maps.filters.count.spots', cnt.n) };
      return cnt.hit
        ? { main: tx.num(cnt.hit), of: n, title: tx.plural('maps.filters.count.hits', cnt.n, { hits: tx.num(cnt.hit) }) }
        : { main: '–', of: n, title: tx.plural('maps.filters.count.noHits', cnt.n), dim: true };
    }
    if (spawned && item) return { main: '?', of: n, title: tx.t('maps.filters.count.serverSide'), dim: true };
    if (cnt.n - cnt.exp < 0.05) return { main: n, title: tx.plural('maps.filters.count.spots', cnt.n) };
    return { main: `~${tx.exp(cnt.exp)}`, of: n, title: tx.plural('maps.filters.count.expected', cnt.n, { expected: tx.exp(cnt.exp) }) };
  };

  const allLeaves = CATEGORIES.flatMap((cat) => kindsHere(cat).flatMap(leavesHere));
  const auto = item && !ex.state.show.size;

  return (
    <section className="mx-sec mx-spots">
      <div className="mx-sec__head">
        <h3>{tx.t('maps.filters.title')}</h3>
        <Help label={tx.t('maps.filters.helpLabel')}>{tx.t('maps.filters.help')}</Help>
        {auto && <span className="mx-chip" title={tx.t('maps.filters.autoTitle')}>{tx.t('maps.filters.auto')}</span>}
        <div className="mx-seg">
          <button onClick={() => ex.set({ show: new Set(allLeaves) })} title={tx.t('maps.filters.showAll')}><Check size={12} />{tx.t('lootHelper.filters.all')}</button>
          <button onClick={() => ex.set({ show: new Set() })} title={tx.t('maps.filters.hideAll')}><Minus size={12} />{tx.t('lootHelper.filters.none')}</button>
        </div>
      </div>
      {CATEGORIES.map((cat) => {
        const kinds = kindsHere(cat);
        if (!kinds.length) return null;
        const catLeaves = kinds.flatMap(leavesHere), open = openCats.has(cat.key);
        return (
          <div key={cat.key} className="mx-cat">
            <FilterRow tx={tx} depth={0} strong sel={selOf(catLeaves)} open={open} onOpen={() => setOpenCats(flip(openCats, cat.key))} onToggle={() => toggle(catLeaves)}
              icon={<GameIcon icon={cat.icon} size={15} className="mx-row__icon" />} label={tx.category(cat.key)}
              count={count(c(cat.key), !!cat.spawned, !!cat.sockets)} />
            {open && kinds.map((kind) => {
              const leaves = leavesHere(kind), types = cls.types.has(kind.key) && leaves.length > 1, kindOpen = openKinds.has(kind.key);
              const spawned = !!cat.spawned || !!kind.spawned, kc = c(kind.key);
              return (
                <div key={kind.key}>
                  <FilterRow tx={tx} depth={1} sel={selOf(leaves)} color={kind.color} open={kindOpen} onOpen={types ? () => setOpenKinds(flip(openKinds, kind.key)) : undefined}
                    onToggle={() => toggle(leaves)} icon={<span className="mx-sw"><GameIcon icon={kind.icon} size={12} /></span>} label={tx.kind(kind)}
                    count={count(kc, spawned, !!cat.sockets)} dim={item && !!cat.sockets && !kc.hit} />
                  {types && kindOpen && leaves.map((l) => {
                    const lc = c(l);
                    return (
                      <FilterRow key={l} tx={tx} depth={2} sel={shown.has(l) ? 'on' : 'off'} color={kind.color} onToggle={() => toggle([l])}
                        label={tx.containerType(l.slice(2))} count={count(lc, false, true)} dim={item && !lc.hit} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- ARC mode

function ArcPanel({ ex }: { ex: Explorer }) {
  const tx = useMapText();
  const { enemyRows, state, index } = ex;
  const toggle = (e: number) => ex.set((cur) => {
    const next = new Set(cur.enemies);
    if (next.has(e)) next.delete(e);
    else next.add(e);
    return { enemies: next };
  });
  return (
    <section className="mx-sec">
      <div className="mx-sec__head">
        <h3>{tx.tm('maps.arc.title', { condition: ex.names.of(ex.cond) })}</h3>
        <Help label={tx.t('maps.arc.helpLabel')}>{tx.t('maps.arc.help')}</Help>
        <div className="mx-seg">
          <button onClick={() => ex.set({ enemies: new Set() })} disabled={!state.enemies.size} title={tx.t('maps.arc.showAll')}><Check size={12} />{tx.t('lootHelper.filters.all')}</button>
        </div>
      </div>
      <div className={`mx-enemies ${state.enemies.size ? '' : 'all'}`}>
        {enemyRows.map((r) => {
          const name = index.enemies[r.e]?.name ?? '?'; // English: icon lookup
          const on = state.enemies.has(r.e);
          return (
            <button key={r.e} className={on ? 'on' : ''} style={{ '--kind': r.color } as CSSProperties} onClick={() => toggle(r.e)} role="checkbox" aria-checked={on}>
              <span className="mx-check">{on && <Check size={11} strokeWidth={3} />}</span>
              <span className="mx-enemies__icon"><GameIcon icon={enemyIcon(name)} size={15} /></span>
              <span className="mx-enemies__name">{ex.names.enemy(r.e)}</span>
              <span className="mx-row__n" title={tx.plural('maps.arc.expected', r.spots, { expected: tx.exp(r.expected) })}>~{tx.exp(r.expected)}<small>/{tx.num(r.spots)}</small></span>
            </button>
          );
        })}
        {!enemyRows.length && <p className="mx-empty">{tx.t('maps.arc.empty')}</p>}
      </div>
    </section>
  );
}
