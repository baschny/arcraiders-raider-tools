# MAP-01 Data contract: schema version, documented arrays, item ids

Repos: embark-api (`scripts/build-map-features.js`), raider-tools (`src/apps/maps/data/`).

## Why

The client reads compact positional arrays (`sockets[i][6]`, `enemySpawners[i][4]`, …) whose meaning lives only
in the generator. Items are joined by English name (`lootItemsByName`, `englishName` → `originalNameEn`), which
breaks on renames and localized names. Committed data that changes per game patch needs a version the client can check.

## Scope

1. embark-api `build-map-features.js`:
   - Add to `index.json`: `schemaVersion: 1`, `manifest` (game manifest id), `gameVersion` (if known), `built`
     (ISO date).
   - Per loot item in `index.items`: add `slug` = arctracker item id from
     `arcraiders-api-mapping/item-mapping.json` (join by Embark asset id; resolve paths from the project root,
     never `../`). Log items without a mapping; keep `name` as fallback.
2. raider-tools:
   - Document every positional array in `src/apps/maps/data/types.ts` (named index constants or tuple types with
     labelled elements; no change to the file format beyond the new fields).
   - Join items by `slug` (raider-tools item ids are the arctracker slugs) in `scoring.ts`/`state.ts`/`model.ts`;
     fall back to the English name only when `slug` is missing.
   - Reject data with an unknown `schemaVersion` (throw a typed error the loader in MAP-05 can show).
3. Update `docs/Map-Features.md` in embark-api with the new fields.

## Acceptance

- `node scripts/build-map-features.js` runs and writes the new fields; the count of unmapped items is printed
  and is 0 or each case is explained in the report.
- raider-tools `npm run sync:map-proto && npm run build && npm run lint && npm test` pass.
- Searching an item whose localized name differs from English still scores the same as before.
