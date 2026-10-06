// Relative item score per socket and POI (ported from embark-api tools/map-features/index.html). Covers the
// shipped value pools only: for every handler active under the condition, each pool's value is split over its
// tables, a table's share over its entries and an entry's share over its items, then spread over the handler's
// sockets. Not a drop chance: rolls and item values are server-side.
import type { LootItem, MapData, MapIndex } from './types';

/** Share of each loot table that goes to the item(s). */
export function itemShares(index: MapIndex, items: number[]): Record<string, number> {
  const share: Record<string, number> = {};
  for (const [name, entries] of Object.entries(index.tables)) {
    let s = 0;
    for (const e of entries) for (const it of items) if (e.items.includes(it)) s += 1 / entries.length / e.items.length;
    if (s) share[name] = s;
  }
  return share;
}

// Hypothesis: a container only receives items whose Area tag matches its category (Socket.LootContainer.<Cat>.* <->
// Item.Drop.Category.Area.<Cat>). Plants give only their own item; bird-nest trinkets come from bird nests.
const AREA_ALIASES: Record<string, string> = { Tech: 'Technological' };
const alnum = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
const sameName = (a: string, b: string) => {
  a = alnum(a);
  b = alnum(b);
  return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
};

/** Nature containers that are an item's only source (Lemon tree -> Lemon). */
export function dedicatedContainers(item: LootItem, containerTags: string[]): string[] {
  const tags = item.tags ?? [];
  if (!tags.includes('Category.Area.Nature')) return [];
  const own = containerTags.filter((c) => c.startsWith('Nature.') && sameName(c.split('.')[1], item.name));
  if (own.length) return own;
  if (tags.some((t) => t.endsWith('Trinket.Birdnest'))) return containerTags.filter((c) => c.startsWith('Nature.BirdNest'));
  return [];
}

function containerFilter(map: MapData, item: LootItem, match: boolean): (containerIdx: number) => boolean {
  if (!match) return () => true;
  const own = dedicatedContainers(item, map.containers);
  if (own.length) {
    const ok = map.containers.map((c) => own.includes(c));
    return (c) => c >= 0 && ok[c];
  }
  const areas = (item.tags ?? []).filter((t) => t.startsWith('Category.Area.')).map((t) => t.split('.')[2]);
  if (!areas.length) return () => true;
  const ok = map.containers.map((c) => {
    const cat = c.split('.')[0];
    return areas.includes(AREA_ALIASES[cat] ?? cat);
  });
  return (c) => c < 0 || ok[c];
}

export interface MapScore {
  sockets: Float64Array;
  pois: { score: number; hits: number; sockets: number }[];
  total: number;
  max: number;
  hits: number;
}

export function scoreMap(index: MapIndex, map: MapData, items: number[], ci: number, match = true, share = itemShares(index, items)): MapScore {
  const hs = map.handlers.map((h) => {
    let v = 0;
    for (const p of h.pools) for (const t of p.tables) if (share[t.t] && t.c.includes(ci)) v += (p.value / p.tables.length) * share[t.t] * (t.x || 1);
    return v;
  });
  const setScore = map.handlerSets.map((set) => set.reduce((a, h) => a + (hs[h] ? hs[h] / map.handlers[h].sockets : 0), 0));
  const filters = items.map((i) => containerFilter(map, index.items[i], match));
  const layers = map.conditions[ci].layers;
  const sockets = new Float64Array(map.sockets.length);
  const pois = map.pois.map(() => ({ score: 0, hits: 0, sockets: 0 }));
  let total = 0, max = 0, hits = 0;
  map.sockets.forEach((s, i) => {
    const present = s[6] < 0 || layers.includes(s[6]);
    const v = present && filters.some((f) => f(s[3])) ? setScore[s[4]] : 0;
    sockets[i] = v;
    total += v;
    if (v > max) max = v;
    if (v > 0) hits++;
    if (s[5] >= 0) {
      const p = pois[s[5]];
      p.score += v;
      p.sockets++;
      if (v > 0) p.hits++;
    }
  });
  return { sockets, pois, total, max, hits };
}

/** Loot item indexes for an English item name (one name can have several assets). */
export function lootItemsByName(index: MapIndex, englishName: string): number[] {
  const n = englishName.trim().toLowerCase();
  return index.items.map((it, i) => (it.name.toLowerCase() === n ? i : -1)).filter((i) => i >= 0);
}

/** Items that only come from containers of a condition not offered (e.g. Candleberries: Cold Snap bushes). */
export function itemNote(index: MapIndex, item: LootItem): string | null {
  const all = Object.keys(index.containerConditions);
  const own = dedicatedContainers(item, all);
  if (!own.length || own.some((c) => index.containerConditions[c] === 'always')) return null;
  const conds = [...new Set(own.flatMap((c) => Object.entries(index.containerConditions[c] as Record<string, string | null>).map(([n, why]) => (why ? `${n} (${why})` : n))))];
  return `Only harvested from ${own.map((c) => c.split('.').slice(1).join(' ')).join(', ')}, which only exist during: ${conds.join(', ')}.`;
}

export const fmtScore = (n: number) => (n >= 100 ? String(Math.round(n)) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
