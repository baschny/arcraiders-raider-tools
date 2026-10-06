// Version check of the map features build (embark-api scripts/build-map-features.js, SCHEMA_VERSION there).
import type { MapIndex } from './types';

/** The data format this client reads. */
export const MAP_SCHEMA_VERSION = 1;

/** The map data has a format version this client does not know (data and client from different releases). */
export class MapSchemaError extends Error {
  readonly found: unknown;
  readonly expected = MAP_SCHEMA_VERSION;

  constructor(found: unknown) {
    super(`Map data format ${found === undefined ? '(none)' : String(found)} is not supported (expected ${MAP_SCHEMA_VERSION})`);
    this.name = 'MapSchemaError';
    this.found = found;
  }
}

/** Returns the index if this client can read it, else throws MapSchemaError. */
export function checkSchemaVersion(index: MapIndex): MapIndex {
  const found = (index as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (found !== MAP_SCHEMA_VERSION) throw new MapSchemaError(found);
  return index;
}
