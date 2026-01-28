import type { MapEventsData } from '../types/mapEvents';

const DATA_URL = '/data/schedule/map-events.json';

export async function loadMapEventsData(): Promise<MapEventsData> {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load map events data: ${response.statusText}`);
  }
  return response.json();
}
