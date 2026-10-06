# MAP-03 Map data pipeline: generate:maps

Repo: raider-tools (`scripts/`, `package.json`, `.gitignore`, `amplify.yml`). Decisions D1–D3 in the README.

## Why

`npm run sync:map-proto` writes into the git-ignored `public/data/map-proto/`. Like the other game data
(`generate:items`, `generate:quests`, …), the map data becomes a generated, committed part of the app that
Amplify serves under `/data/map-data/`; a game patch means regenerate, commit, deploy.

## Scope

1. Rename `scripts/sync-map-prototype.mjs` → `scripts/generate-maps-data.mjs`, npm script `generate:maps`
   (keep `scripts/lib/area-outlines.mjs`, `scripts/lib/map-tiles.mjs`). Output `public/data/map-data/`
   (`public/data/maps/` already exists for the schedule and must stay untouched):
   `index.json`, `maps/*.json`, `map-strings.*.json` (MAP-02), `icons/*`, `tiles/<Texture>-<hash>/…`.
   Do not add it to the top-level `generate` script (it needs the embark-api build); document that instead.
2. Tile folders: `<hash>` = short content hash of the source texture, so a changed texture gets a new URL. The
   cache still avoids re-cutting unchanged textures; remove tile folders no map references any more, so git only
   holds the current set.
3. Make the output deterministic: stable JSON key order and formatting, no timestamps except `built` in
   `index.json` (taken from the embark-api build, not the generation time), identical bytes when regenerated from
   the same input (avoids git churn).
4. `amplify.yml` `customHeaders`: `Cache-Control: public, max-age=31536000, immutable` for
   `data/map-data/tiles/**`. The existing CSP already allows same-origin fetches and images.
5. `.gitignore`: drop `public/data/map-proto/`; `public/data/map-data/` is tracked.
6. Print a size summary (JSON, icons, tiles) and fail on any single file over 5 MB.

## Acceptance

- `npm run generate:maps` twice in a row: the second run cuts no tiles and the output is byte-identical.
- Without `/Volumes/ZWO-T` it still runs (2048 px fallback, warning).
- Build, lint, tests pass. Do not commit the generated data (MAP-11 does that with full-resolution tiles).
