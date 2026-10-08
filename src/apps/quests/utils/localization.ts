import type { AppLocale } from '../../../shared/i18n/config';
import type { LoadedDomain } from '../../../shared/gamedata/types';

let mapNames: Record<string, string> = {};

/** Registers the localized map names of the `maps` domain (call before building the quest view). */
export function setMapLocalizations(maps: LoadedDomain<'maps'>): void {
  mapNames = Object.fromEntries(
    Object.values(maps.structure.maps).map((map) => {
      const text = maps.text[map.id]?.name;
      return [map.id, typeof text === 'string' && text ? text : map.nameEn];
    }),
  );
}

// `locale` is kept for call-site compatibility: names are loaded for the active locale.
export function getLocalizedMapName(mapId: string, locale?: AppLocale): string {
  void locale;
  return mapNames[mapId] ?? mapId;
}

export function getLocalizedMapNodeName(
  mapId: string | undefined,
  fallbackName: string,
  locale?: AppLocale,
): string {
  void locale;
  if (!mapId) return fallbackName;
  return mapNames[mapId] ?? fallbackName;
}

export function getQuestWikiName(quest: { name: string; originalNameEn?: string }): string {
  return quest.originalNameEn ?? quest.name;
}
