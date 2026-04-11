import type { AppLocale } from '../../../shared/i18n/config';
import { getLocaleCandidates } from '../../../shared/i18n/config';
import type { EventType, MapInfo } from '../types/mapEvents';

export function getLocalizedEventName(event: EventType, locale: AppLocale): string {
  const candidates = getLocaleCandidates(locale);

  for (const candidate of candidates) {
    const localized = event.localizations?.[candidate];
    if (localized) {
      return localized;
    }
  }

  return event.displayName;
}

export function getLocalizedMapName(_mapId: string, mapInfo: MapInfo, locale: AppLocale): string {
  const mapLocalizations = mapInfo.localizations;
  if (!mapLocalizations) {
    return mapInfo.displayName;
  }

  const candidates = getLocaleCandidates(locale);
  for (const candidate of candidates) {
    const localized = mapLocalizations[candidate];
    if (localized) {
      return localized;
    }
  }

  return mapLocalizations.en ?? mapInfo.displayName;
}
