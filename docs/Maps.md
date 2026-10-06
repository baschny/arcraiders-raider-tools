# Maps

The `/maps` tool (`src/apps/maps/`) shows the ARC Raiders maps full-bleed with what the game files say about them:
where an item can be looted and where ARC enemies spawn, per map and map condition. It is a port of the map
features page of embark-api (`tools/map-features/`); the game-side background (loot handlers, spawners,
transforms, map layers, what is server-only) is documented there in `docs/Map-Features.md`.

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

## Data flow

```
embark-api  scripts/build-map-features.js        -> data-game-extract/current/map-features/  (index.json, maps/*.json)
raider-tools npm run generate:maps               -> public/data/map-data/                      (committed to git)
            git push to main                     -> Amplify deploy, served at /data/map-data/
```

`scripts/generate-maps-data.mjs` (`npm run generate:maps`, not part of `npm run generate`) reads the embark-api
build (env `EMBARK_API_DIR`, default the sibling `../embark-api`) and writes:

| Path | Content |
| --- | --- |
| `index.json` | map list, items, loot tables, enemies, quests, `schemaVersion`, `manifest`, `gameVersion`, `built` |
| `maps/<map>.json` | one per map; area pieces replaced by merged outlines |
| `map-strings.<locale>.json` | localized map strings, when the build has them |
| `icons/<key>.png` | game UI icons (white on transparent, tinted in the browser) |
| `tiles/<Texture>-<hash>/` | tile pyramids, cut from the full-size game textures (fallback: the build's 2048 px images) |

The output is deterministic (same build, same bytes) and no file may exceed 5 MB. The data is committed like the
other generated game data, game art included (as with item images). Tile folders are named by a content hash of
their source, so `amplify.yml` serves `data/map-data/tiles/**` with an immutable `Cache-Control`; JSON and icons
use the default revalidation.

The client (`src/apps/maps/data/useMapData.ts`) loads `index.json`, then the open map (all maps only when the map
bar needs scores). `data/schema.ts` checks `schemaVersion` (`SCHEMA_VERSION` in `build-map-features.js`) and asks
for a page reload when data and client come from different releases. The positional arrays of the map files are
documented in `src/apps/maps/data/types.ts`. Items are joined to raider-tools items by slug (the arctracker id,
mapped from the Embark asset id in embark-api); loot items without a mapping fall back to their English name.

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

Check the generator output for warnings (missing full-size textures, items without a mapping). When the build's
`schemaVersion` changed, update `MAP_SCHEMA_VERSION` in `src/apps/maps/data/schema.ts` and the readers in the same
commit. Unknown URL values from old links (a removed map, condition, layer, item or enemy) are dropped by
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
fall back to the defaults.

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
| `index.tsx` | page, loading and error states, layout (left bar or bottom sheet) |
| `state.ts` | URL state, sanitizing, preferences |
| `model.ts` | everything derived from the state for the open map: scores, filter counts, visibility, enemies |
| `Bars.tsx`, `Sidebar.tsx`, `components.tsx`, `BottomSheet.tsx` | UI |
| `MapView.tsx`, `engine/` | canvas: `MapEngine` (drawing, input), `tiles.ts`, `iconAtlas.ts` |
| `data/` | loader, schema check, data types, spot kinds, scoring |
| `scripts/generate-maps-data.mjs`, `scripts/lib/map-tiles.mjs`, `scripts/lib/area-outlines.mjs` | data generation |

Imperative canvas code stays in `engine/` classes (the React Compiler lint forbids ref access during render).
Unit tests live in `__tests__/` folders next to the code. Ideas for later: `plans/maps-integration.md`.
