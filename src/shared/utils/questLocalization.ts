import type { AppLocale } from '../i18n/config';
import { getLocaleCandidates, SUPPORTED_LOCALES } from '../i18n/config';
import { loadText } from '../gamedata/loader';
import type { Quest } from '../types/quest';

let mapNameLocalizations: Record<string, Record<string, string>> = {};

export function normalizeMapId(mapId: string): string {
  switch (mapId) {
    case 'dam_battlegrounds':
      return 'dam-battleground';
    case 'buried_city':
      return 'buried-city';
    case 'the_spaceport':
      return 'the-spaceport';
    case 'the_blue_gate':
      return 'blue-gate';
    case 'riven_tides':
      return 'riven-tides';
    case 'pendola_pass':
      return 'pendola-pass';
    case 'stella_montis':
    case 'stella_montis_upper':
    case 'stella_montis_lower':
      return 'stella-montis';
    default:
      return mapId;
  }
}

const TRADER_NAME_LOCALIZATIONS: Record<string, Record<string, string>> = {
  Map: {
    en: 'Map',
    de: 'Karte',
    'pt-BR': 'Mapa',
  },
  Celeste: {
    en: 'Celeste',
    de: 'Celeste',
    'pt-BR': 'Celeste',
  },
  Shani: {
    en: 'Shani',
    de: 'Shani',
    'pt-BR': 'Shani',
  },
  Lance: {
    en: 'Lance',
    de: 'Lance',
    'pt-BR': 'Lance',
  },
  'Tian Wen': {
    en: 'Tian Wen',
    de: 'Tian Wen',
    'pt-BR': 'Tian Wen',
  },
  Apollo: {
    en: 'Apollo',
    de: 'Apollo',
    'pt-BR': 'Apollo',
  },
};

function getLocalizedValue(
  localizations: Record<string, string> | undefined,
  locale: AppLocale,
  fallback: string,
): string {
  if (!localizations) {
    return fallback;
  }

  for (const candidate of getLocaleCandidates(locale)) {
    const localized = localizations[candidate];
    if (localized) {
      return localized;
    }
  }

  return fallback;
}

export function getLocalizedMapName(mapId: string, locale: AppLocale): string {
  const normalizedMapId = normalizeMapId(mapId);
  return getLocalizedValue(mapNameLocalizations[normalizedMapId], locale, mapId);
}

export function getLocalizedMapNodeName(
  mapId: string | undefined,
  fallbackName: string,
  locale: AppLocale,
): string {
  if (!mapId) {
    return fallbackName;
  }

  const normalizedMapId = normalizeMapId(mapId);
  return getLocalizedValue(mapNameLocalizations[normalizedMapId], locale, fallbackName);
}

export function getLocalizedTraderName(trader: string, locale: AppLocale): string {
  return getLocalizedValue(TRADER_NAME_LOCALIZATIONS[trader], locale, trader);
}

export function getQuestWikiName(quest: Pick<Quest, 'name' | 'originalNameEn'>): string {
  return quest.originalNameEn ?? quest.name;
}

/** Loads map names of all locales from the v2 maps domain (small text files). */
export async function loadQuestMapLocalizations(): Promise<void> {
  const texts = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => [locale, await loadText('maps', locale)] as const),
  );
  const next: Record<string, Record<string, string>> = {};
  for (const [locale, text] of texts) {
    for (const [mapId, entry] of Object.entries(text)) {
      if (typeof entry.name === 'string' && entry.name) (next[mapId] ??= {})[locale] = entry.name;
    }
  }
  mapNameLocalizations = next;
}
