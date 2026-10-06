// Page state: everything that makes a view shareable lives in the URL; display preferences in localStorage.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Item, ItemsMap } from '../loot-helper/types/item';
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

function parseState(params: URLSearchParams, defaultMap: string): MapState {
  return {
    mode: params.get('mode') === 'arc' ? 'arc' : 'loot',
    map: params.get('map') ?? defaultMap,
    cond: params.get('cond') ?? 'Default',
    layer: params.get('layer') != null ? Number(params.get('layer')) : null,
    item: params.get('item'),
    show: new Set((params.get('show') ?? '').split(',').filter(Boolean)),
    enemies: new Set((params.get('enemies') ?? '').split(',').filter(Boolean).map(Number)),
  };
}

function serializeState(next: MapState): URLSearchParams {
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
const DEFAULT_PREFS: Prefs = { heat: true, height: true, pois: true, zones: false, bounds: true, side: true };
const PREFS_KEY = 'raider-tools:maps-prefs';

export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
    } catch {
      return DEFAULT_PREFS;
    }
  });
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

/** raider-tools items that can be found in static loot (matched by English name). */
export function useLootableItems(index: MapIndex, items: ItemsMap | null): Item[] {
  return useMemo(() => {
    if (!items) return [];
    const names = new Set(index.items.map((it) => it.name.toLowerCase()));
    return Object.values(items)
      .filter((it) => names.has(englishName(it).toLowerCase()))
      .sort((a, b) => a.name.en.localeCompare(b.name.en));
  }, [index, items]);
}
