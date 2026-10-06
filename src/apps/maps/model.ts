// Everything derived from the page state for the open map: scores, filter counts, visibility, enemy matching.
// One object so that the sidebar, the bars and the map agree on what is shown.
import { useMemo } from 'react';
import type { Item, ItemsMap } from '../loot-helper/types/item';
import { CATEGORIES, enemyColor as enemyTypeColor, KINDS, classify, leavesOf, tableEnemies, tableEnemyProbs, type MapClasses, type SpotKind } from './data/kinds';
import { itemNote, itemShares, lootItemsByName, scoreMap, type MapScore } from './data/scoring';
import type { LootItem, MapCondition, MapData, MapIndex } from './data/types';
import { useAllMaps } from './data/useMapData';
import { condIndex, defaultLayer, englishName, useLootableItems, type MapPatch, type MapState, type Prefs } from './state';

// Containers only take items of their own category (Socket.LootContainer.<Cat> <-> Item.Drop.Category.Area.<Cat>):
// consistent with community finds, not confirmed in the game files. A constant so it can be switched off to test.
const MATCH_CATEGORY = true;

export interface Count {
  n: number;
  hit: number;
  exp: number;
}

export interface EnemyRow {
  e: number;
  expected: number;
  spots: number;
  color: string;
}

export interface Explorer {
  index: MapIndex;
  map: MapData;
  state: MapState;
  set: (p: MapPatch) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  lootable: Item[];
  item: Item | null;
  lootIdx: number[];
  lootItem: LootItem | null;
  share: Record<string, number> | null;
  note: string | null;
  ci: number;
  cond: MapCondition;
  layer: number | null;
  cls: MapClasses;
  spawnP: number[];
  enemyP: number[];
  score: MapScore | null;
  /** Item score per map (Normal) and per condition of this map. */
  mapTotals: Map<string, number> | null;
  condTotals: number[] | null;
  /** Effective filter leaves (with an item and no selection: everything that can hold it). */
  shown: Set<string>;
  /** Counts per leaf, kind key and category key. */
  counts: Map<string, Count>;
  enemyRows: EnemyRow[];
  enemyColor: (e: number) => string;
  onLayer: (kind: 'sockets' | 'spawners' | 'enemies' | 'pois', i: number) => boolean;
  socketVisible: (i: number) => boolean;
  /** Kind a spawner is shown as (first shown kind it can spawn), or null. */
  spawnerKind: (i: number) => SpotKind | null;
  /** Enemy a spawner is drawn as (most probable among the filtered ones), -1 none of the filtered, null unknown. */
  enemyMatch: (i: number) => number | null;
  enemyVisible: (i: number) => boolean;
}

export function useExplorer(index: MapIndex, map: MapData, state: MapState, set: Explorer['set'], prefs: Prefs, setPrefs: Explorer['setPrefs'], items: ItemsMap | null): Explorer {
  const lootable = useLootableItems(index, items);
  const item = state.item ? items?.[state.item] ?? null : null;
  const lootIdx = useMemo(() => (item ? lootItemsByName(index, englishName(item)) : []), [index, item]);
  const lootItem = lootIdx.length ? index.items[lootIdx[0]] : null;
  const share = useMemo(() => (lootIdx.length ? itemShares(index, lootIdx) : null), [index, lootIdx]);
  const allMaps = useAllMaps(state.mode === 'loot' && share ? index : null);
  const ci = condIndex(map, state.cond);
  const cond = map.conditions[ci];
  const layer = map.layers ? (state.layer ?? defaultLayer(map)) : null;
  const cls = classify(map);
  const spawnP = useMemo(() => map.spawnP[ci] ?? [], [map, ci]);
  const enemyP = useMemo(() => map.enemyP?.[ci] ?? [], [map, ci]);
  const loot = state.mode === 'loot';

  const score = useMemo(() => (loot && share ? scoreMap(index, map, lootIdx, ci, MATCH_CATEGORY, share) : null), [loot, share, index, map, lootIdx, ci]);
  const mapTotals = useMemo(() => (share && allMaps ? new Map(allMaps.map((m) => [m.map, scoreMap(index, m, lootIdx, 0, MATCH_CATEGORY, share).total])) : null),
    [share, allMaps, index, lootIdx]);
  const condTotals = useMemo(() => (loot && share ? map.conditions.map((_, i) => scoreMap(index, map, lootIdx, i, MATCH_CATEGORY, share).total) : null),
    [loot, share, index, map, lootIdx]);

  const derived = useMemo(() => {
    const onLayer: Explorer['onLayer'] = (kind, i) => layer == null || (kind === 'pois' ? map.levels.pois[i] : map.levels[kind][i]?.[0] ?? 0) === layer;
    const present = (i: number) => {
      const l = map.sockets[i][6];
      return l < 0 || cond.layers.includes(l);
    };
    // Counts per leaf / kind / category (for the open map, layer and condition).
    const counts = new Map<string, Count>();
    const bump = (key: string, hit: boolean, exp: number, n = 1) => {
      const c = counts.get(key) ?? { n: 0, hit: 0, exp: 0 };
      c.n += n;
      if (hit) c.hit++;
      c.exp += exp;
      counts.set(key, c);
    };
    map.sockets.forEach((_, i) => {
      if (!present(i) || !onLayer('sockets', i)) return;
      const hit = !!score && score.sockets[i] > 0;
      const kind = cls.socketKind[i];
      bump(cls.socketLeaf[i], hit, 1);
      if (cls.socketLeaf[i] !== kind.key) bump(kind.key, hit, 1);
      bump(kind.cat, hit, 1);
    });
    map.spawners.forEach((_, i) => {
      const p = spawnP[i];
      if (!p || !onLayer('spawners', i) || !cls.spawnerKinds[i].length) return;
      for (const [kind, sh] of cls.spawnerKinds[i]) {
        bump(kind.key, false, p * sh);
        bump(kind.cat, false, p * sh, 0);
      }
      new Set(cls.spawnerKinds[i].map(([kind]) => kind.cat)).forEach((cat) => bump(cat, false, 0));
    });
    // With an item and nothing picked: every socket leaf (container type, plant, ...) that can hold it here.
    const shown = state.show.size || !score
      ? state.show
      : new Set(KINDS.filter((x) => CATEGORIES.find((c) => c.key === x.cat)?.sockets).flatMap((x) => leavesOf(cls, x)).filter((l) => counts.get(l)?.hit));
    const socketVisible = (i: number) => shown.has(cls.socketLeaf[i]) && present(i) && onLayer('sockets', i) && (!score || score.sockets[i] > 0);
    const spawnerKind = (i: number) => (spawnP[i] && onLayer('spawners', i) ? cls.spawnerKinds[i].find(([kind]) => shown.has(kind.key))?.[0] ?? null : null);

    // ARC enemies on the map: expected number of spawners that can produce each (sum of spawn chances).
    const byEnemy = new Map<number, { expected: number; spots: number }>();
    map.enemySpawners.forEach((s, i) => {
      if (!enemyP[i]) return;
      for (const e of tableEnemies(index, s[4])) {
        const r = byEnemy.get(e) ?? { expected: 0, spots: 0 };
        r.expected += enemyP[i];
        r.spots++;
        byEnemy.set(e, r);
      }
    });
    const order = [...byEnemy].sort((a, b) => b[1].expected - a[1].expected).map(([e]) => e);
    const enemyColor = (e: number) => enemyTypeColor(index.enemies[e]?.name ?? '');
    const enemyRows = order.map((e) => ({ e, ...byEnemy.get(e)!, color: enemyColor(e) }));
    const enemyMatch = (i: number) => {
      const probs = tableEnemyProbs(index, map.enemySpawners[i][4]);
      let best: number | null = null, bestP = -1;
      for (const e of order) {
        if (state.enemies.size && !state.enemies.has(e)) continue;
        const q = probs.get(e) ?? 0;
        if (q > bestP + 1e-9 && q > 0) {
          best = e;
          bestP = q;
        }
      }
      return best ?? (state.enemies.size || probs.size ? -1 : null);
    };
    const enemyVisible = (i: number) => !!enemyP[i] && onLayer('enemies', i) && (!state.enemies.size || enemyMatch(i) !== -1);
    return { onLayer, counts, shown, socketVisible, spawnerKind, enemyRows, enemyColor, enemyMatch, enemyVisible };
  }, [map, layer, cond, score, cls, spawnP, enemyP, state.show, state.enemies, index]);

  const note = lootItem ? itemNote(index, lootItem) : null;
  return { index, map, state, set, prefs, setPrefs, lootable, item, lootIdx, lootItem, share, note, ci, cond, layer, cls, spawnP, enemyP, score, mapTotals, condTotals, ...derived };
}
