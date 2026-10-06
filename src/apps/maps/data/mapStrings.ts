// Localized map names (maps, conditions, areas, enemies). The data carries English names plus the game string they
// come from (`nameKey` / `titleKey`, "<table>/<key>"); map-strings.<locale>.json maps those keys to the game's
// translation (embark-api scripts/build-map-features.js). English needs no file: it is the data itself.
import { getLocaleCandidates, type AppLocale } from '../../../shared/i18n/config';
import type { MapIndex } from './types';

/** String key -> translated text, for one locale. */
export type MapStrings = Readonly<Record<string, string>>;

export const NO_STRINGS: MapStrings = Object.freeze({});

/**
 * Locales whose map-strings file to try for `locale`, best first (the site's fallback chain, e.g.
 * pt-BR -> pt). English is left out: its names are in the data.
 */
export function mapStringLocales(locale: AppLocale): string[] {
  return getLocaleCandidates(locale).filter((code) => code !== 'en');
}

/** Text of a game string, or the English name when the string or its translation is missing. */
export function mapString(strings: MapStrings, key: string | undefined, english: string): string {
  return (key && strings[key]) || english;
}

/** Display names for the map page; every getter falls back to the English name. */
export interface MapNames {
  /** Map, condition, area label: anything with `name` and `nameKey`. */
  of: (x: { name: string; nameKey?: string }) => string;
  /** Area (POI) title. */
  poi: (p: { title: string; titleKey?: string }) => string;
  /** Enemy by index into MapIndex.enemies. */
  enemy: (e: number) => string;
  /** Condition by its English name (as used in `also` and item / container conditions). */
  condition: (englishName: string) => string;
}

export function mapNames(index: MapIndex, strings: MapStrings): MapNames {
  const conditionKeys = new Map((index.conditions ?? []).map((c) => [c.name, c.nameKey]));
  return {
    of: (x) => mapString(strings, x.nameKey, x.name),
    poi: (p) => mapString(strings, p.titleKey, p.title),
    enemy: (e) => {
      const t = index.enemies[e];
      return t ? mapString(strings, t.nameKey, t.name) : '?';
    },
    condition: (name) => mapString(strings, conditionKeys.get(name), name),
  };
}
