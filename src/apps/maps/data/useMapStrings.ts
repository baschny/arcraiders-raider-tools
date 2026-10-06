// Loads the map strings (localized map, condition, area and enemy names) of the active locale.
import { useEffect, useState } from 'react';
import type { AppLocale } from '../../../shared/i18n/config';
import { mapStringLocales, NO_STRINGS, type MapStrings } from './mapStrings';
import { DATA_BASE } from './useMapData';

const cache = new Map<AppLocale, Promise<MapStrings>>();

/** A strings file, or null when it is missing or not JSON (the SPA fallback answers unknown paths with HTML). */
async function fetchStrings(code: string): Promise<MapStrings | null> {
  try {
    const res = await fetch(`${DATA_BASE}/map-strings.${code}.json`);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as MapStrings) : null;
  } catch {
    return null;
  }
}

/** The first strings file of the locale's fallback chain that loads; none (English names) if no file does. */
export function loadMapStrings(locale: AppLocale): Promise<MapStrings> {
  let p = cache.get(locale);
  if (!p) {
    p = (async () => {
      for (const code of mapStringLocales(locale)) {
        const strings = await fetchStrings(code);
        if (strings) return strings;
      }
      return NO_STRINGS;
    })();
    cache.set(locale, p);
  }
  return p;
}

/** Map strings of `locale`; English names (no strings) while loading, for English and when no file exists. */
export function useMapStrings(locale: AppLocale): MapStrings {
  const [loaded, setLoaded] = useState<{ locale: AppLocale; strings: MapStrings } | null>(null);
  useEffect(() => {
    let live = true;
    loadMapStrings(locale).then((strings) => live && setLoaded({ locale, strings }));
    return () => {
      live = false;
    };
  }, [locale]);
  return loaded && loaded.locale === locale ? loaded.strings : NO_STRINGS;
}
