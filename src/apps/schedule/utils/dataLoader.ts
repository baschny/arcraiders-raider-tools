import { DEFAULT_LOCALE, type AppLocale } from '../../../shared/i18n/config';
import { loadDomain, nameOf } from '../../../shared/gamedata/loader';
import type { MapEventsData } from '../types/mapEvents';
const LOCAL_MAP_EVENTS_URL = '/data/schedule/map-events.json';
const MAP_EVENTS_URL = import.meta.env.VITE_SCHEDULE_DATA_URL || LOCAL_MAP_EVENTS_URL;
const EVENT_TYPES_URL = '/data/schedule/event-types.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEventTypeRecord(value: unknown): value is MapEventsData['eventTypes'] {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) =>
      isRecord(item) &&
      typeof item.displayName === 'string' &&
      typeof item.icon === 'string' &&
      typeof item.translationKey === 'string' &&
      typeof item.category === 'string'
  );
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  return response.json();
}

async function loadMapEventsJson(): Promise<Partial<MapEventsData>> {
  try {
    return await loadJson<Partial<MapEventsData>>(MAP_EVENTS_URL);
  } catch (error) {
    if (MAP_EVENTS_URL === LOCAL_MAP_EVENTS_URL) {
      throw error;
    }

    return loadJson<Partial<MapEventsData>>(LOCAL_MAP_EVENTS_URL);
  }
}

async function loadEventTypesJson(): Promise<MapEventsData['eventTypes']> {
  const data = await loadJson<unknown>(EVENT_TYPES_URL);

  if (isRecord(data) && isEventTypeRecord(data.eventTypes)) {
    return data.eventTypes;
  }

  if (isEventTypeRecord(data)) {
    return data;
  }

  return {};
}

export async function loadMapEventsData(
  locale: AppLocale = DEFAULT_LOCALE
): Promise<MapEventsData> {
  const [mapEventsData, eventTypes, gameMaps] = await Promise.all([
    loadMapEventsJson(),
    loadEventTypesJson(),
    // Map and event names come from the game data v2 `maps` domain; the schedule
    // keeps its own event metadata (icon, category) and falls back to it on failure.
    loadDomain('maps', locale).catch(() => null),
  ]);

  const fallbackEventTypes =
    mapEventsData.eventTypes && typeof mapEventsData.eventTypes === 'object'
      ? mapEventsData.eventTypes
      : {};

  const mergedMaps = Object.fromEntries(
    Object.entries(mapEventsData.maps ?? {}).map(([mapId, mapInfo]) => [
      mapId,
      {
        ...mapInfo,
        displayName: gameMaps
          ? nameOf(gameMaps, mapId, gameMaps.structure.maps[mapId]?.nameEn ?? mapInfo.displayName)
          : mapInfo.displayName,
      },
    ])
  );

  const mergedEventTypes = Object.fromEntries(
    Object.entries({
      ...fallbackEventTypes,
      ...(eventTypes ?? {}),
    }).map(([eventId, eventType]) => [
      eventId,
      {
        ...eventType,
        displayName: gameMaps
          ? nameOf(
              gameMaps,
              eventId,
              gameMaps.structure.eventTypes[eventId]?.nameEn ?? eventType.displayName
            )
          : eventType.displayName,
      },
    ])
  );

  return {
    eventTypes: mergedEventTypes,
    maps: mergedMaps,
    regions: mapEventsData.regions ?? {},
    schedule: mapEventsData.schedule ?? {},
    metadata: mapEventsData.metadata,
  };
}
