// Page state: everything that makes a view shareable lives in the URL; display preferences in localStorage.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Item, ItemsMap } from '../loot-helper/types/item';
import { hasLootItem } from './data/scoring';
import type { MapData, MapIndex } from './data/types';

export type Mode = 'loot' | 'arc';

export type { Patch as MapPatch };

export interface MapState {
  mode: Mode;
  map: string;
  cond: string;
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

/**
 * Page state from URL params (missing or malformed values fall back to the defaults). Values the data does not know
 * are dropped later by sanitizeState.
 */
export function parseState(params: URLSearchParams, defaultMap: string): MapState {
  return {
    mode: params.get('mode') === 'arc' ? 'arc' : 'loot',
    map: params.get('map') || defaultMap,
    cond: params.get('cond') || 'Default',
    layer: index(params.get('layer')),
    item: params.get('item') || null,
    show: new Set((params.get('show') ?? '').split(',').filter(Boolean)),
    enemies: new Set((params.get('enemies') ?? '').split(',').map(index).filter((e) => e != null)),
  };
}

/**
 * The corrections for URL state that references things the data no longer has (after a game update, or a hand-edited
 * link): an unknown map becomes the default map, an unknown condition Normal, a missing layer the default layer, an
 * unknown item none, unknown enemies are dropped. Null when nothing needs fixing. `map` is checked once loaded and
 * `items` once loaded (null: not yet).
 */
export function sanitizeState(state: MapState, index: MapIndex, map: MapData | null, items: ItemsMap | null, defaultMap: string): Partial<MapState> | null {
  const fix: Partial<MapState> = {};
  if (!index.maps.some((m) => m.map === state.map) && index.maps.length) {
    fix.map = index.maps.some((m) => m.map === defaultMap) ? defaultMap : sortedMaps(index)[0].map;
    fix.cond = 'Default';
    fix.layer = null;
  } else if (map && map.map === state.map) {
    if (state.cond !== 'Default' && !map.conditions.some((c) => c.key === state.cond)) fix.cond = 'Default';
    if (state.layer != null && !(map.layers && state.layer < map.layers.length)) fix.layer = null;
  }
  if (state.item && items && !items[state.item]) fix.item = null;
  if ([...state.enemies].some((e) => !index.enemies[e])) fix.enemies = new Set([...state.enemies].filter((e) => index.enemies[e]));
  return Object.keys(fix).length ? fix : null;
}

/** URL params for a state; default values are left out. */
export function serializeState(next: MapState): URLSearchParams {
  const q = new URLSearchParams();
  if (next.mode !== 'loot') q.set('mode', next.mode);
  q.set('map', next.map);
  if (next.cond !== 'Default') q.set('cond', next.cond);
  if (next.layer != null) q.set('layer', String(next.layer));
  if (next.item) q.set('item', next.item);
  if (next.show.size) q.set('show', [...next.show].join(','));
  if (next.enemies.size) q.set('enemies', [...next.enemies].join(','));
  return q;
}

/** State from the URL; the setter takes a patch or a function of the latest state (for toggles). */
export function useMapState(defaultMap: string): [MapState, (p: Patch) => void] {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseState(params, defaultMap), [params, defaultMap]);
  // Patch the live URL: react-router's functional updater gets the params of the render that created the setter,
  // so a stale setter (e.g. in a memoized model) would undo changes made since.
  const set = (p: Patch) => setParams(() => {
    const cur = parseState(new URLSearchParams(window.location.search), defaultMap);
    const patch = typeof p === 'function' ? p(cur) : p;
    const next = { ...cur, ...patch };
    if (patch.map && patch.map !== cur.map) Object.assign(next, { layer: null, cond: 'Default' });
    return serializeState(next);
  }, { replace: true });
  return [state, set];
}

export interface Prefs {
  heat: boolean;
  height: boolean;
  pois: boolean;
  zones: boolean;
  bounds: boolean;
  /** Left bar expanded. */
  side: boolean;
}
export const DEFAULT_PREFS: Prefs = { heat: true, height: true, pois: true, zones: false, bounds: true, side: true };
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

export const MAP_ORDER = ['TheDam_02', 'BuriedCity_01', 'Spaceport_01', 'TheBlueGate_01', 'MountainCompound', 'RivenTides_01'];
export const sortedMaps = (index: MapIndex) => [...index.maps].sort((a, b) => MAP_ORDER.indexOf(a.map) - MAP_ORDER.indexOf(b.map));
const MAP_THUMBS: Record<string, string> = {
  BuriedCity_01: 'buried-city', MountainCompound: 'stella-montis', RivenTides_01: 'riven-tides',
  Spaceport_01: 'the-spaceport', TheBlueGate_01: 'blue-gate', TheDam_02: 'dam-battleground',
};
export const mapThumb = (key: string) => `/images/maps/${MAP_THUMBS[key] ?? 'buried-city'}.webp`;

export const englishName = (it: Item) => it.originalNameEn ?? it.name.en;

/** raider-tools items that can be found in static loot (matched by slug, else by English name). */
export function useLootableItems(index: MapIndex, items: ItemsMap | null): Item[] {
  return useMemo(() => {
    if (!items) return [];
    return Object.values(items)
      .filter((it) => hasLootItem(index, it.id, englishName(it)))
      .sort((a, b) => a.name.en.localeCompare(b.name.en));
  }, [index, items]);
}
