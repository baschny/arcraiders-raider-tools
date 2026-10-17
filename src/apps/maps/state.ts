// Page state: everything that makes a view shareable lives in the URL (/maps/<map slug>?<params>); display preferences
// in localStorage.
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Item, ItemsMap } from '../loot-helper/types/item';
import { getItemDisplayName } from '../loot-helper/utils/localization';
import { hasLootItem } from './data/scoring';
import type { MapData, MapIndex, MapIndexEntry } from './data/types';

const OBSOLETE_PUZZLE_FILTERS = new Set(['PowerSocket', 'FuelCell', 'PuzzleButton', 'PuzzleRelay', 'CardReader', 'TubeTerminal', 'PuzzleDoor', 'HotelKey', 'Puzzles']);

export type Mode = 'loot' | 'arc';

export type { Patch as MapPatch };

export interface MapState {
  mode: Mode;
  /** Map slug. */
  map: string;
  cond: string;
  /** Loot setup (1-based, MapData.lootSetups); null: dynamic zones at their base level. */
  setup: number | null;
  /** Map layer; null: the map's default (the one with most sockets). */
  layer: number | null;
  /** raider-tools item id. */
  item: string | null;
  /** Filter leaves shown in Loot mode. */
  show: Set<string>;
  /** Enemy types filtered in ARC mode. */
  enemies: Set<number>;
}

type Patch = Partial<MapState> | ((s: MapState) => Partial<MapState>);

/** Non-negative integer from a URL value, else null. */
const index = (v: string | null) => {
  const n = v == null || v.trim() === '' ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Map slug of a page path (`/maps/<slug>`, also below a locale prefix), else null. */
export function pathMap(pathname: string): string | null {
  const m = /\/maps\/([^/]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Page path of a map. */
export const mapPath = (slug: string) => `/maps/${encodeURIComponent(slug)}`;

/** Index entry of a map slug. */
export const mapEntry = (index: MapIndex, slug: string): MapIndexEntry | undefined => index.maps.find((m) => m.slug === slug);

/**
 * Page state from the map slug of the path and the URL params (missing or malformed values fall back to the
 * defaults). `?map=<level name>` is the map of old links (sanitizeState turns it into the slug). Values the data does
 * not know are dropped later by sanitizeState.
 */
export function parseState(params: URLSearchParams, map: string | null | undefined, defaultMap: string): MapState {
  return {
    mode: params.get('mode') === 'arc' ? 'arc' : 'loot',
    map: map || params.get('map') || defaultMap,
    cond: params.get('cond') || 'Default',
    setup: index(params.get('setup')) || null,
    layer: index(params.get('layer')),
    item: params.get('item') || null,
    show: new Set((params.get('show') ?? '').split(',').filter((key) => key && !OBSOLETE_PUZZLE_FILTERS.has(key))),
    enemies: new Set((params.get('enemies') ?? '').split(',').map(index).filter((e) => e != null)),
  };
}

/**
 * The corrections for URL state that references things the data no longer has (after a game update, or a hand-edited
 * link): the level name of an old link becomes its slug, an unknown map the default map, an unknown condition Normal,
 * a missing layer the default layer, an unknown item none, unknown enemies are dropped. Null when nothing needs
 * fixing. `map` is checked once loaded and `items` once loaded (null: not yet).
 */
export function sanitizeState(state: MapState, index: MapIndex, map: MapData | null, items: ItemsMap | null, defaultMap: string): Partial<MapState> | null {
  const fix: Partial<MapState> = {};
  const entry = mapEntry(index, state.map);
  const legacy = entry ? undefined : index.maps.find((m) => m.map === state.map);
  if (legacy) {
    // Same map: keep its condition and layer.
    Object.assign(fix, { map: legacy.slug, cond: state.cond, layer: state.layer, setup: state.setup });
  } else if (!entry && index.maps.length) {
    fix.map = mapEntry(index, defaultMap) ? defaultMap : sortedMaps(index)[0].slug;
    fix.cond = 'Default';
    fix.layer = null;
    fix.setup = null;
  } else if (map && entry && map.map === entry.map) {
    if (state.cond !== 'Default' && !map.conditions.some((c) => c.key === state.cond)) fix.cond = 'Default';
    if (state.setup != null && !map.lootSetups?.[state.setup - 1]) fix.setup = null;
    if (state.layer != null && !(map.layers && state.layer < map.layers.length)) fix.layer = null;
  }
  if (state.item && items && !items[state.item]) fix.item = null;
  if ([...state.enemies].some((e) => !index.enemies[e])) fix.enemies = new Set([...state.enemies].filter((e) => index.enemies[e]));
  return Object.keys(fix).length ? fix : null;
}

/** URL params for a state (the map is in the path, see mapPath); default values are left out. */
export function serializeState(next: MapState): URLSearchParams {
  const q = new URLSearchParams();
  if (next.mode !== 'loot') q.set('mode', next.mode);
  if (next.cond !== 'Default') q.set('cond', next.cond);
  if (next.setup != null) q.set('setup', String(next.setup));
  if (next.layer != null) q.set('layer', String(next.layer));
  if (next.item) q.set('item', next.item);
  if (next.show.size) q.set('show', [...next.show].join(','));
  if (next.enemies.size) q.set('enemies', [...next.enemies].join(','));
  return q;
}

/** State from the URL; the setter takes a patch or a function of the latest state (for toggles). */
export function useMapState(defaultMap: string): [MapState, (p: Patch) => void] {
  const { mapSlug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = useMemo(() => parseState(params, mapSlug, defaultMap), [params, mapSlug, defaultMap]);
  // Patch the live URL: the state of the render that created the setter may be stale (e.g. in a memoized model),
  // and would undo changes made since.
  const set = (p: Patch) => {
    const cur = parseState(new URLSearchParams(window.location.search), pathMap(window.location.pathname), defaultMap);
    const patch = typeof p === 'function' ? p(cur) : p;
    // Another map starts on its default layer and condition, unless the patch sets them.
    const reset = patch.map && patch.map !== cur.map ? { layer: null, cond: 'Default', setup: null } : {};
    const next = { ...cur, ...reset, ...patch };
    const q = serializeState(next).toString();
    navigate(`${mapPath(next.map)}${q ? `?${q}` : ''}`, { replace: true });
  };
  return [state, set];
}

export interface Prefs {
  heat: boolean;
  height: boolean;
  pois: boolean;
  zones: boolean;
  bounds: boolean;
  /** ARC Frigate layer (poses, Reclaimer landing rings, cargo sites) under the Frigate condition. */
  frigate: boolean;
  /** Entrance filter only; guide selection is never persisted. */
  puzzleDoors: boolean;
  /** Left bar expanded. */
  side: boolean;
}
export const DEFAULT_PREFS: Prefs = { heat: true, height: true, pois: true, zones: false, bounds: true, frigate: true, puzzleDoors: false, side: true };
export const PREFS_KEY = 'raider-tools:maps-prefs';

/** Stored prefs over the defaults; the default for every pref that is unreadable, corrupt or of the wrong type. */
export function loadPrefs(): Prefs {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return { ...DEFAULT_PREFS };
  }
  const prefs = { ...DEFAULT_PREFS };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return prefs;
  for (const key of Object.keys(prefs) as (keyof Prefs)[]) {
    const v = (stored as Record<string, unknown>)[key];
    if (typeof v === 'boolean') prefs[key] = v;
  }
  return prefs;
}

export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // private mode: keep it for this session only
    }
  };
  return [prefs, update];
}

/** Condition index on a map (conditions folded into Normal or not offered there fall back to Normal). */
export const condIndex = (map: MapData, key: string) => Math.max(0, map.conditions.findIndex((c) => c.key === key));
/** Default map layer: the one with most sockets (Stella Montis: the upper floor). */
export const defaultLayer = (map: MapData) => (map.layers ? map.layers.reduce((b, l, i) => (l.sockets > map.layers![b].sockets ? i : b), 0) : null);

const MAP_ORDER = ['TheDam_02', 'BuriedCity_01', 'Spaceport_01', 'TheBlueGate_01', 'MountainCompound', 'RivenTides_01'];
export const sortedMaps = (index: MapIndex) => [...index.maps].sort((a, b) => MAP_ORDER.indexOf(a.map) - MAP_ORDER.indexOf(b.map));

/** English item name (`name.en` holds the name in the site language, see loot-helper loadAllItems). */
export const englishName = (it: Item) => it.originalNameEn ?? it.name.en;

/** raider-tools items that can be found in static loot (matched by slug). */
export function useLootableItems(index: MapIndex, items: ItemsMap | null): Item[] {
  return useMemo(() => {
    if (!items) return [];
    return Object.values(items)
      .filter((it) => hasLootItem(index, it.id))
      .sort((a, b) => getItemDisplayName(a).localeCompare(getItemDisplayName(b)));
  }, [index, items]);
}
