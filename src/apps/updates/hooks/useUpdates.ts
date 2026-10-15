import { useEffect, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { loadAllItems } from '../../quartermaster/utils/dataLoader';
import type { ItemsMap } from '../../quartermaster/types/item';
import { UPDATES_SCHEMA_VERSION, type UpdateRelease, type UpdatesIndex } from '../types';

const BASE = '/data/updates';

async function fetchJson<T extends { schemaVersion: number }>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = (await res.json()) as T;
  if (data.schemaVersion !== UPDATES_SCHEMA_VERSION) throw new Error(`${url}: schema ${data.schemaVersion}, expected ${UPDATES_SCHEMA_VERSION}`);
  return data;
}

export interface Loaded<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => !cancelled && setState({ data, loading: false, error: null }),
      (err: Error) => !cancelled && setState({ data: null, loading: false, error: err.message }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useUpdatesIndex(): Loaded<UpdatesIndex> {
  return useLoad(() => fetchJson<UpdatesIndex>(`${BASE}/index.json`), []);
}

export function useUpdateRelease(id: string): Loaded<UpdateRelease> {
  return useLoad(() => fetchJson<UpdateRelease>(`${BASE}/${id}.json`), [id]);
}

/** Item catalog in the Quartermaster shape (names, icons, recipes) for item icons and the item overlay. */
export function useItems(): Loaded<ItemsMap> {
  const { locale } = useLocale();
  return useLoad(() => loadAllItems(locale), [locale]);
}
