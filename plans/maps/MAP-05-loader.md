# MAP-05 Client data loader

Repo: raider-tools `src/apps/maps/data/useMapData.ts`, `index.tsx`. Depends on MAP-01, MAP-03.

## Scope

1. `DATA_BASE = '/data/map-data'` (was `/data/map-proto`); tiles, icons and map strings below it. Keep the
   in-memory promise cache; one map JSON per map switch, `useAllMaps` only when an item is searched (as now).
2. Loading and errors: use `src/shared/components/LoadingSpinner` and `ErrorDisplay`; specific messages for
   network failure, unknown `schemaVersion` (MAP-01) and a missing map; a retry button. A page left open across
   a deploy may hit a 404 for a replaced hashed tile folder: reload `index.json` once on tile errors.
3. If the URL references a map, condition or item the data no longer has, fall back to defaults and clean the
   URL params instead of crashing.
4. Show the game data version (manifest / build date) where the prototype header shows it.

## Acceptance

- Works with `/data/map-data` after `npm run generate:maps`.
- Simulated failures (missing file, edited `schemaVersion`) show the error state, not a blank page.
- Build, lint, tests pass.
