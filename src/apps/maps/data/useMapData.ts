import { useEffect, useState } from 'react';
import { checkSchemaVersion } from './schema';
import type { MapData, MapIndex } from './types';

export const DATA_BASE = '/data/map-data';
export const iconUrl = (key: string) => `${DATA_BASE}/icons/${key}.png`;

let indexPromise: Promise<MapIndex> | null = null;
const mapPromises = new Map<string, Promise<MapData>>();

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} — run npm run sync:map-proto`);
  return res.json() as Promise<T>;
};

/** The map index; rejects with MapSchemaError when its format version is unknown. */
export function loadIndex(): Promise<MapIndex> {
  indexPromise ??= fetchJson<MapIndex>(`${DATA_BASE}/index.json`).then(checkSchemaVersion);
  return indexPromise;
}

export function loadMap(index: MapIndex, key: string): Promise<MapData> {
  let p = mapPromises.get(key);
  if (!p) {
    const meta = index.maps.find((m) => m.map === key);
    if (!meta) return Promise.reject(new Error(`Unknown map ${key}`));
    p = fetchJson<MapData>(`${DATA_BASE}/${meta.file}`);
    mapPromises.set(key, p);
  }
  return p;
}

export function useMapIndex() {
  const [index, setIndex] = useState<MapIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadIndex().then(setIndex, (e: Error) => setError(e.message));
  }, []);
  return { index, error };
}

export function useMap(index: MapIndex | null, key: string | null) {
  const [map, setMap] = useState<MapData | null>(null);
  useEffect(() => {
    if (!index || !key) return;
    let live = true;
    loadMap(index, key).then((m) => live && setMap(m), (e) => console.error(e));
    return () => {
      live = false;
    };
  }, [index, key]);
  return map && map.map === key ? map : null;
}

/** All maps at once (map ranking for an item). */
export function useAllMaps(index: MapIndex | null) {
  const [maps, setMaps] = useState<MapData[] | null>(null);
  useEffect(() => {
    if (!index) return;
    Promise.all(index.maps.map((m) => loadMap(index, m.map))).then(setMaps, (e) => console.error(e));
  }, [index]);
  return maps;
}
