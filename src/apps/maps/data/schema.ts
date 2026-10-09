// Version check of the public map data (public/data/map-data, written by scripts/generate-maps-data.mjs). The build
// in embark-api has its own SCHEMA_VERSION; the public format bumps this one whenever its shape changes.
/** The public data format this client reads (2: items and references by slug only). */
export const MAP_SCHEMA_VERSION = 2;

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

/** Returns the data if this client can read its format version, else throws MapSchemaError (index.json, sizes.json). */
export function checkSchemaVersion<T extends { schemaVersion?: unknown }>(data: T): T {
  const found = data?.schemaVersion;
  if (found !== MAP_SCHEMA_VERSION) throw new MapSchemaError(found);
  return data;
}
