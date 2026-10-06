// Loads the map data (scripts/generate-maps-data.mjs, public/data/map-data/): index.json once, one map JSON per map
// switch, all maps only for the map ranking of a searched item. Promises are cached in memory; reloadMapData() drops
// them (retry button, or tile folders replaced by a deploy while the page was open).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { checkSchemaVersion, MapSchemaError } from './schema';
import type { MapData, MapIndex } from './types';

export const DATA_BASE = '/data/map-data';
export const iconUrl = (key: string) => `${DATA_BASE}/icons/${key}.png`;

/**
 * Why the map data could not be loaded: `network` (request failed, server error), `missing` (404, or not JSON: the
 * SPA fallback answers unknown paths with index.html), `schema` (data format this client does not know).
 */
export type MapLoadErrorKind = 'network' | 'missing' | 'schema';

export class MapLoadError extends Error {
  readonly kind: MapLoadErrorKind;
  readonly url: string;
  /** Map key when a map file failed, else null (index.json). */
  readonly map: string | null;

  constructor(kind: MapLoadErrorKind, url: string, detail: string, map: string | null = null) {
    super(`${url}: ${detail}${kind === 'missing' && import.meta.env.DEV ? ' (run npm run generate:maps)' : ''}`);
    this.name = 'MapLoadError';
    this.kind = kind;
    this.url = url;
    this.map = map;
  }
}

/** Any loader failure as a MapLoadError. */
export const asLoadError = (e: unknown): MapLoadError =>
  e instanceof MapLoadError ? e
    : e instanceof MapSchemaError ? new MapLoadError('schema', `${DATA_BASE}/index.json`, e.message)
      : new MapLoadError('network', DATA_BASE, e instanceof Error ? e.message : String(e));

let indexPromise: Promise<MapIndex> | null = null;
const mapPromises = new Map<string, Promise<MapData>>();
/** After a reload, revalidate with the server instead of trusting the browser cache. */
let revalidate = false;

const fetchJson = async <T,>(url: string, map: string | null = null): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url, revalidate ? { cache: 'no-cache' } : undefined);
  } catch (e) {
    throw new MapLoadError('network', url, e instanceof Error ? e.message : String(e), map);
  }
  if (!res.ok) throw new MapLoadError(res.status === 404 ? 'missing' : 'network', url, `HTTP ${res.status}`, map);
  try {
    return (await res.json()) as T;
  } catch {
    throw new MapLoadError('missing', url, 'not JSON', map);
  }
};

/** The map index; rejects with a MapLoadError (kind `schema` when its format version is unknown). */
export function loadIndex(): Promise<MapIndex> {
  if (!indexPromise) {
    const p = fetchJson<MapIndex>(`${DATA_BASE}/index.json`).then((index) => {
      try {
        return checkSchemaVersion(index);
      } catch (e) {
        throw asLoadError(e);
      }
    });
    p.catch(() => indexPromise === p && (indexPromise = null)); // a failed index is fetched again on retry
    indexPromise = p;
  }
  return indexPromise;
}

export function loadMap(index: MapIndex, key: string): Promise<MapData> {
  let p = mapPromises.get(key);
  if (!p) {
    const meta = index.maps.find((m) => m.map === key);
    if (!meta) return Promise.reject(new MapLoadError('missing', `${DATA_BASE}/index.json`, `no map ${key}`, key));
    const q = fetchJson<MapData>(`${DATA_BASE}/${meta.file}`, key);
    q.catch(() => mapPromises.get(key) === q && mapPromises.delete(key)); // fetched again on the next try
    mapPromises.set(key, q);
    p = q;
  }
  return p;
}

// Data generation: bumped by reloadMapData(); the hooks refetch when it changes.
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const useGeneration = () => useSyncExternalStore(subscribe, () => generation);

/** Drop the cached data and fetch it again. */
export function reloadMapData() {
  indexPromise = null;
  mapPromises.clear();
  revalidate = true;
  generation++;
  listeners.forEach((fn) => fn());
}

let tileReload = false;
/**
 * A map tile failed to load. Tile folders carry a content hash, so a page left open across a deploy asks for folders
 * that no longer exist: reload index.json (and the map files naming the folders) once per page.
 */
export function reportTileError() {
  if (tileReload) return;
  tileReload = true;
  console.warn('Map tile failed to load: reloading the map data once');
  reloadMapData();
}

/**
 * The map index, or the error that keeps the page from showing it. A reload keeps the last index on screen; its
 * failure only shows when there is nothing to show, or when the data format changed.
 */
export function useMapIndex(): { index: MapIndex | null; error: MapLoadError | null } {
  const gen = useGeneration();
  const [res, setRes] = useState<{ gen: number; index: MapIndex | null; error: MapLoadError | null }>({ gen: -1, index: null, error: null });
  useEffect(() => {
    let live = true;
    loadIndex().then(
      (index) => live && setRes({ gen, index, error: null }),
      (e: unknown) => {
        const error = asLoadError(e);
        console.error(error);
        if (live) setRes((r) => ({ gen, index: r.index, error }));
      },
    );
    return () => {
      live = false;
    };
  }, [gen]);
  const error = res.gen === gen && res.error && (!res.index || res.error.kind === 'schema') ? res.error : null;
  return { index: error ? null : res.index, error };
}

/** One map, or its error when there is nothing to show (a reload keeps the loaded map on screen). */
export function useMap(index: MapIndex | null, key: string | null): { map: MapData | null; error: MapLoadError | null } {
  const [res, setRes] = useState<{ index: MapIndex | null; key: string | null; map: MapData | null; error: MapLoadError | null }>(
    { index: null, key: null, map: null, error: null });
  useEffect(() => {
    if (!index || !key) return;
    let live = true;
    loadMap(index, key).then(
      (map) => live && setRes({ index, key, map, error: null }),
      (e: unknown) => {
        const error = asLoadError(e);
        console.error(error);
        if (live) setRes((r) => ({ index, key, map: r.map, error }));
      },
    );
    return () => {
      live = false;
    };
  }, [index, key]);
  const map = res.map && res.map.map === key ? res.map : null;
  const error = !map && res.error && res.index === index && res.key === key ? res.error : null;
  return { map, error };
}

/** All maps at once (map ranking for an item); null while loading or when one of them fails. */
export function useAllMaps(index: MapIndex | null) {
  const [maps, setMaps] = useState<MapData[] | null>(null);
  useEffect(() => {
    if (!index) return;
    Promise.all(index.maps.map((m) => loadMap(index, m.map))).then(setMaps, (e) => console.error(e));
  }, [index]);
  return maps;
}
