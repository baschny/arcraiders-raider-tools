# Maps

The Maps tool (`src/apps/maps/`) has two routes, switched by the tab bar in its header:

- `/maps` — the ARC Raiders maps full-bleed with what the game files say about them: where an item can be looted and
  where ARC enemies spawn, per map and map condition. It is a port of the map features page of embark-api
  (`tools/map-features/`); the game-side background (loot handlers, spawners, transforms, map layers, what is
  server-only) is documented there in `docs/Map-Features.md`.
- `/map-sizes` — the playable area of every map compared to scale (see [Map sizes](#map-sizes)).

## What the page does

- **Map bar** (top): switches the map. With an item selected, each map shows its score and the best is
  highlighted.
- **Condition bar** (below it): the map conditions of the open map (Normal, Night, Storm, Cold Snap, ...; major
  ones ◆, live ones ●), with the item score per condition.
- **Left bar** (a bottom sheet on phones): the mode switch and the filters. It collapses to a button; the state is
  remembered per browser.
- **Loot mode**: item search over the raider-tools items (Looting Helper goals as quick picks), the item's tags and
  loot table shares, spawn spot filters in categories (exits and spawns, containers, nature, raider containers, ARC
  husks and wrecks, carryables and activities, puzzles and locked areas, map features; container kinds split into
  container types), the best areas, a heat map and score-colored spots.
- **ARC mode**: the enemies of the map with the expected number of spawners that can produce each, multi-select
  with one color per enemy, patrol paths, each spawner drawn with the game ping icon of its most probable enemy
  (filled: patrols).
- **On the map**: hovering or clicking a spot shows its activity group (members ringed; an area hull for local
  groups; a click pins, Esc unpins) and a tooltip (container tag, area and volume, world coordinates, height,
  tables, spawn chance, group, enemy groups and respawn timers). Height marks, loot zones, the playable area, map
  layers and area labels can be toggled.

The map image is a WebP tile pyramid (512 px tiles); the page loads only the visible tiles of the level that
matches the zoom. Markers are drawn on a Canvas 2D engine of our own (`src/apps/maps/engine/`, no map library: the
maps have up to 16k spots, too many for DOM markers). Everything is computed in the browser; there is no API.

## Map sizes

The `/map-sizes` route (`MapSizes.tsx`) compares the playable area of every map. The numbers are generated, not
computed in the browser: `npm run generate:maps` measures each map's `bounds` (playable outlines, in UV of the map
texture) through its `world` size in cm — 1 UV unit = `worldSize / 100` m, so areas and distances are exact — and
writes the committed `public/data/map-data/sizes.json`. The measurement lives in `scripts/lib/map-sizes.mjs`
(`computeSizes`, unit-tested in the same folder), next to the area-outline generation; the client only loads and
renders the file (`MapSizes.tsx`, `useMapSizes` in `data/useMapData.ts`). The source is the same embark-api map
features build as the explorer (`data-game-extract/current/map-features/`); `arc-data` has no playable boundary.

The page shows, in one left-aligned column:

- a stat row (map count, total playable area, largest map, largest/smallest ratio);
- **Overlay to scale** — every outline stacked on its own centroid, on a 100 m grid with a scale bar; the list on
  the right shows/hides a map (hovering a row or an outline highlights it and shows its name);
- **Same scale** — one tile per map at a shared scale, with a 1 km reference square;
- bar charts and a table of area, bounding box, oriented length × width, diameter and fill (playable area as a share
  of the map texture; Stella Montis reads above 100 % because its limiter reaches past its smaller map widget).

Per-map colours are presentation and live in `MapSizes.tsx`; the route shows the shared `ErrorDisplay` when
`sizes.json` cannot be loaded. After a game patch, run `npm run generate:maps` and commit `sizes.json` with the rest
of `public/data/map-data/` (see the runbook above).

## Data flow

```
embark-api  scripts/build-map-features.js        -> data-game-extract/current/map-features/  (index.json, maps/*.json)
raider-tools npm run generate:maps               -> public/data/map-data/                      (committed to git)
            git push to main                     -> Amplify deploy, served at /data/map-data/
```

`scripts/generate-maps-data.mjs` (`npm run generate:maps`, not part of `npm run generate`) reads the embark-api
build (env `EMBARK_API_DIR`, default the sibling `../embark-api`) and writes the public form:

| Path | Content |
| --- | --- |
| `index.json` | map list, items (by slug), loot tables, enemies, quests, `schemaVersion`, `manifest`, `gameVersion`, `built` |
| `maps/<map>.json` | one per map; area pieces replaced by merged outlines |
| `sizes.json` | playable-area size of every map, measured by `scripts/lib/map-sizes.mjs` (the `/map-sizes` page) |
| `map-strings.<locale>.json` | localized map strings, when the build has them |
| `icons/<key>.png` | game UI icons (white on transparent, tinted in the browser) |
| `tiles/<Texture>-<hash>/` | tile pyramids, cut from the full-size game textures (fallback: the build's 2048 px images) |

The output is deterministic (same build, same bytes) and no file may exceed 5 MB. The public files hold no Embark asset
ids and no internal names (`DA_...`): loot items are identified by their raider-tools slug only (see
[Public form](#public-form)).

### Public form

`toPublicIndex` and `toPublicMap` in `generate-maps-data.mjs` turn the build into the committed form (schemaVersion
`PUBLIC_SCHEMA_VERSION`, currently 2):

- `items[]`: `id` (Embark asset id) and `asset` (`DA_...`) are dropped; `slug` is required. Loot items without a slug
  are excluded (the generator logs the count and names), and the `tables` indexes are renumbered. A `name` that is
  only the asset name (no English name in the game files) is dropped too.
- `enemies[]`: `key` (`DA_EnemyType_...`) is dropped.
- `quests[]`: `id` and `prev` (Embark ids) and the objective `assets` are dropped; `maps/<map>.json` quest markers
  lose `a` (quest assets) and `id` (level actor id). The page does not use any of them.
- Not changed: the `manifest` (a Steam depot id, a build identifier) and `cls` (the spawned class names of quest
  markers).

The client reads the item identity as follows: an item is `slug`, the join with raider-tools items is `item.slug ===
LootItem.slug` (`scoring.ts`, `lootItemsFor`, `hasLootItem`). There is no English-name fallback.
 The data is committed like the
other generated game data, game art included (as with item images). Tile folders are named by a content hash of
their source, so `amplify.yml` serves `data/map-data/tiles/**` with an immutable `Cache-Control`; JSON and icons
use the default revalidation.

The client (`src/apps/maps/data/useMapData.ts`) loads `index.json`, then the open map (all maps only when the map
bar needs scores) and, for `/map-sizes`, `sizes.json`. `data/schema.ts` checks `schemaVersion` (`MAP_SCHEMA_VERSION`, the public format) and asks
for a page reload when data and client come from different releases. The positional arrays of the map files are
documented in `src/apps/maps/data/types.ts`. Items are joined to raider-tools items by slug only (the arctracker id,
mapped from the Embark asset id in embark-api at build time).

## Per-patch runbook

After a game patch, once embark-api has the new game files:

```sh
# in embark-api
scripts/extract-all            # maps, map textures, map features build
# the UI icons are not in extract-all yet (only needed when icons changed):
scripts/arc-explorer export-textures '(Pioneer/UI/Assets/Icons/(T_|Map/|Map_Conditions/)|Core/UI/UI_Elements/Icons/(Map|Enemies|Ping)/|Pioneer/UI/Assets/Enemies/)'

# in raider-tools
npm run generate:maps          # EMBARK_API_DIR=... when not a sibling checkout (e.g. in a worktree)
npm run build && npm test
git add public/data/map-data && git commit   # then push: Amplify deploys
```

Check the generator output for warnings (missing full-size textures) and the item count it logs (items without a
slug are excluded). When the build's data changes shape, update `toPublicIndex` / `toPublicMap`; when the public
format changes, bump `PUBLIC_SCHEMA_VERSION` in the generator and `MAP_SCHEMA_VERSION` in
`src/apps/maps/data/schema.ts` and the readers in the same commit. Unknown URL values from old links (a removed map, condition, layer, item or enemy) are dropped by
`sanitizeState` in `state.ts`.

## URL and preferences

Everything that makes a view shareable is in the URL (`state.ts`); default values are left out:

| Param | Meaning | Default |
| --- | --- | --- |
| `mode` | `loot` or `arc` | `loot` |
| `map` | map key, e.g. `TheDam_02` | `TheDam_02` |
| `cond` | map condition key | `Default` (Normal) |
| `layer` | map layer index | the map's default layer |
| `item` | raider-tools item id (slug) | none |
| `show` | comma-separated filter leaves shown in Loot mode | none |
| `enemies` | comma-separated enemy indexes filtered in ARC mode | none |

Changing the map resets `cond` and `layer`. Display preferences (heat map, height marks, area labels, loot zones,
playable area, left bar open) live in `localStorage` under `raider-tools:maps-prefs`; unreadable or invalid values
fall back to the defaults. `/map-sizes` carries no state (there is nothing to share but the comparison itself).

## Scoring

An item's score (`src/apps/maps/data/scoring.ts`) is relative: it says where an item is more or less likely, not
how likely. It covers the value pools of the shipped loot tables only:

- **Pool split**: for every loot handler active under the condition, each value pool's budget is split evenly over
  its tables, a table's share over its entries and an entry's share over its items, then spread over the handler's
  sockets. A socket's score is the sum over the handlers covering it; an area's score is the sum of its sockets.
- **Category match**: a container only receives items whose area tag matches its category
  (`Socket.LootContainer.<Cat>.*` with `Item.Drop.Category.Area.<Cat>`, `Tech` = `Technological`). Ground loot
  takes any item. This fits community finds but is not confirmed in the game files.
- **Plants**: nature containers that are an item's only source (lemon tree for lemons, bird nests for bird-nest
  trinkets) are the only spots for that item. Items that only come from containers of a condition the map does not
  offer get a note (e.g. Candleberries: Cold Snap bushes).
- **Nature spots**: items without an area tag can come from any container except nature spots (plants,
  mushrooms, ...), which give only their own item. Water tanks are tagged `Nature.WaterTank` but are regular
  containers.

ARC mode counts, per enemy, the expected number of spawners that can produce it (the sum of spawn chances).

Not shown, on purpose:

- **Drop-rate estimates**: rolls, item values and many tables are server-side, so the client data gives shares,
  not chances. Estimates from community runs would mislead and could not be kept current.
- **Blueprints**: they never come from the value pools (no shipped table matches them); their drops are decided by
  server-side tables. A marker for "containers whose category fits the blueprint's drop tags" only restated the
  tags and was dropped. Details and observed rates: embark-api `docs/Map-Features.md`, section Blueprints.
- **Raider containers, caches, husks and other spawned containers** have no item lists in the client: they are
  shown and counted (expected number per round), but their contents are "unknown".

## Code layout

| Path | Role |
| --- | --- |
| `index.tsx` | `/maps` page (`MapsApp`) and `/map-sizes` (`MapSizesApp`), loading and error states, layout (left bar or bottom sheet) |
| `MapsHeader.tsx` | header tab bar linking `/maps` and `/map-sizes` |
| `MapSizes.tsx`, `styles/_sizes.scss` | the `/map-sizes` comparison view |
| `state.ts` | URL state, sanitizing, preferences |
| `model.ts` | everything derived from the state for the open map: scores, filter counts, visibility, enemies |
| `Bars.tsx`, `Sidebar.tsx`, `components.tsx`, `BottomSheet.tsx` | UI |
| `MapView.tsx`, `engine/` | canvas: `MapEngine` (drawing, input), `tiles.ts`, `iconAtlas.ts` |
| `data/` | loader, schema check, data types, spot kinds, scoring |
| `scripts/generate-maps-data.mjs`, `scripts/lib/map-tiles.mjs`, `scripts/lib/area-outlines.mjs`, `scripts/lib/map-sizes.mjs` | data generation |

Imperative canvas code stays in `engine/` classes (the React Compiler lint forbids ref access during render).
Unit tests live in `__tests__/` folders next to the code. Ideas for later: `plans/maps-integration.md`.
