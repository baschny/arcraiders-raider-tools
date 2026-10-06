# Maps in raider-tools: plan

Status: prototype on branch `map-prototype`, route `/maps`. It uses the real map features build from
`../embark-api` (manifest 4879539862843747573): the feature set of the embark-api map features page (Loot and
ARC modes; Quests later) on a full-bleed map.

```sh
# in ../embark-api, once per game version (the icon export is not yet in scripts/extract-all)
scripts/arc-explorer export-textures '(Pioneer/UI/Assets/Icons/(T_|Map/|Map_Conditions/)|Core/UI/UI_Elements/Icons/(Map|Enemies|Ping)/|Pioneer/UI/Assets/Enemies/)'
node scripts/build-map-features.js
# here
npm run sync:map-proto    # -> public/data/map-proto/ (git-ignored, 19.6 MB: game art)
npm run dev               # http://localhost:5173/maps
```

## Prototype (round 2)

One feature set, ported from `embark-api/tools/map-features/index.html`:

- Map switcher (first level; with an item: score per map, best highlighted), mode switcher Loot / ARC with the map
  conditions (second level; major ◆, live ●, item score per condition), filters in the left bar.
- Loot: item search over raider-tools items (Looting Helper goals as quick picks), item tags and loot table shares,
  "match container category" toggle, spawn spot filters in 8 categories (exits & spawns, containers, nature,
  raider containers, ARC husks & wrecks, carryables & activities, puzzles & locked areas, map features), container
  kinds split further into container types (`Industrial › Lockers`), best areas list, heat map and score-colored spots.
- ARC: enemy list with expected spawner counts, multi-select with one color per enemy, patrol paths, each spawner
  drawn with the game ping icon of its most probable enemy (filled = patrols).
- Map: activity groups of the hovered / clicked spawner (members ringed, area hull for local groups; click pins,
  Esc unpins), rich tooltips (container tag, POI and volume id, world coordinates, height and cover, server tables,
  spawn chance, group, key items, enemy groups and respawn timers), height marks, loot zones, playable area, map
  layers, area labels.

Layout: full-bleed map. Map switcher and conditions float at the top, left-aligned next to the left bar, and
wrap onto more lines when needed. The left bar holds the Loot / ARC switch and the filters; it collapses to a small
button (remembered per browser). The Docked and Tiles layouts of round 2 were dropped after review.

Markers: muted palette, small game-icon discs (10–15 px, slightly larger for major kinds such as exits, caches,
probes, locked rooms), containers as 2–6 px dots that become icon discs from 4.5× zoom.

Open points: container type names are the raw tag parts (`Wrh`, `Rsr Machine M01`) and need a label map; the
2048 px textures get soft from ~4× zoom (tiles); quests mode needs more design work.

## Infrastructure

**No new API endpoints are needed for v1.** Everything is static and computed in the browser:

| File | Raw | gzip |
| --- | --- | --- |
| `index.json` (items, loot tables, enemies, quests) | 448 KB | 37 KB |
| one map (`Spaceport_01.json`, the largest) | 1.2 MB | 209 KB |
| one map texture (2048² JPG) | 0.1–2 MB | — |

Item scoring for all six maps runs in a few milliseconds; the canvas draws 16k markers without frame drops.

Hosting: the data changes with each game patch, not with each app deploy, and it contains game art. Recommended:

1. `build-map-features.js` (embark-api) gets an `--publish` output: compact JSON with a `schemaVersion`, map tiles
   and the icon set, under `maps/<manifest>/…`.
2. Upload to the existing S3/CloudFront setup behind `api.raider-tools.app` (as the schedule data is), with
   immutable caching per manifest and a small `maps/latest.json` pointer. The CSP already allows
   `connect-src https://api.raider-tools.app` and `img-src https:`.
3. The SPA reads `latest.json`, then the versioned files. A game update means one upload, no app release.

Alternative for the first release: commit the JSON (not the art) to `public/data/maps/` and serve textures and
icons from S3. Not recommended long term (≈ 5 MB of JSON churn per patch in git).

Rendering: keep the custom Canvas 2D engine from the prototype (`src/apps/maps/engine/`, no new dependencies)
and add tile loading. Leaflet (`CRS.Simple`) would give tiles for free, but its DOM markers cannot handle 16k
spots, so it would need a custom canvas layer anyway; MapLibre / deck.gl only if WebGL becomes necessary.

Map tiles (done in the prototype): `npm run sync:map-proto` cuts the 4096² game textures into 512 px WebP tile
pyramids (levels 0–3, `scripts/lib/map-tiles.mjs`, WebP q78: about half the size of the old JPEGs at the same
resolution), 0.1–7.6 MB per texture, 32 MB for all; the page loads only the visible tiles of the level that matches
the zoom (≈ 0.3 MB for the first view instead of 2 MB). Moves into the embark-api publish step later.

Data contract (to fix before v1):

- Join items by Embark id → arctracker slug (`arcraiders-api-mapping/item-mapping.json`) instead of English
  names (the prototype matches `originalNameEn`).
- Localize POI and area names from the game string tables (export per locale, like `items.<locale>.json`); kind
  labels go into `en.json` (Crowdin), not into the data.
- Keep the positional arrays (they keep the files small) but document them in `types.ts` and version them.

When endpoints become necessary (later):

- Per-user state (saved filters, pinned spots, "my route"): a new `maps` domain in `UserStateStore`, so it uses the
  existing `/me/state` API, no new endpoint.
- Crowdsourced finds ("found a blueprint in this container", to calibrate drop rates the client data cannot
  provide): new endpoint, table and moderation. Only worth it with enough users.

## Integration with the other tools

- Item detail (Looting Helper, Quartermaster, Craft Calculator): a "Where to find" link to
  `/maps?mode=item&item=<slug>`. Scoring already supports several items at once, so a Quartermaster shopping list
  can be one heat map.
- Looting Helper goals: one-click chips in the item search (in the prototype).
- Quest Tracker: quest objectives with locations link to `/maps?quest=<id>` (data is in the build: 264 of 276
  objective assets are placed).
- Schedule: "Open map" from an event card with `cond=` set; the condition chips can mark the live ones.

## Phases

1. **Decide** the direction (this prototype) and the hosting option.
2. **MVP**: publish pipeline and versioned data, item-id join, A + "Find item" mode, i18n, mobile layout (panel
   as bottom sheet), production polish of the icon mapping.
3. **Depth**: tiles, quests mode, enemies layer with the C styling, briefing tab, links from the other tools.
4. **Personal / community**: saved state via `UserStateStore`, share links, optional crowdsourced finds.

## Open questions

- Which direction (or mix) do you want to continue with?
- S3 publishing from embark-api (needs AWS credentials there) or a manual upload step?
- Is the game art (map textures, UI icons) acceptable on the public site in the same way as the item images?
- Mobile: full feature parity or a reduced "find item" view?
