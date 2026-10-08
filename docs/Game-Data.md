# Game data (v2)

raider-tools' game data is generated from **arc-data**, the canonical ARC Raiders data built in the
embark-api project (`../embark-api/arc-data`, see embark-api `docs/arc-data.md`). arc-data stays
close to the game (Embark asset ids, generic offers, full objective trees). The generators here
reshape it into a site schema built for the apps.

```
embark-api/arc-data ──► scripts/generate-game-data.ts ──► public/data/game/<domain>.json
                     │                                └─► public/data/game/<domain>.text.<locale>.json
                     ├─► scripts/generate-item-icons.ts ──► public/images/items/, public/images/benches/
                     └─► scripts/generate-server-mappings.ts ──► infra/lambda/data/game-mappings.json
```

## Rules

- **Slugs only in public files.** No Embark asset ids or internal asset names (`DA_…`) under
  `public/`. Slugs are frozen in `arc-data/slugs/<kind>.json`. They equal arctracker.io's ids for
  everything that existed before, so saved user state, URLs (`?item=`, `?focus=`) and arctracker
  links stay valid. Generators create slugs for new entities and append them there — **commit
  them in arc-data together with the regenerated site files.**
- **Structure and text are split.** `<domain>.json` is locale-independent, and `<domain>.text.<locale>.json`
  holds names and descriptions. English is filled in where a translation is missing.
- **Explicit relationships instead of slug heuristics.** Use `baseId`/`tier`, `upgradesTo`,
  `amplifiedFrom`, `blueprintFor`/`blueprintId`, `craftedBy`, `usedIn` and so on. Never parse slug
  shapes (`_i`…`_iv`, `_blueprint`).
- **Types are the source of truth:** `src/shared/gamedata/types.ts`. Every structure file carries
  `schemaVersion`, and the loader rejects mismatches.
- **Size budgets** per file (gzip) are enforced by the generator (`scripts/gamedata/writer.ts`).

## Domains

| Domain | Content |
| --- | --- |
| `items` | Shipped items with explicit relationships and precomputed reverse lookups. Also `arctrackerAliases`, mapping arctracker ids that differ from ours. |
| `recipes` | Bench and in-raid crafting (`station`, `benchId`, `benchLevel`). |
| `research` | Research Station offers (`researchPoints`). |
| `blueprints` | Blueprint learning (`blueprintItemId` → `unlocksItemId`). |
| `trades` | Trader offers, plus a `traders` map. |
| `benches` | Benches with levels, build costs, gates (`requires`), recipes and research per level, and what Scrappy produces. |
| `outpost` | Rooms, slots, furniture (category, size, craft, design), designs and Outpost levels. |
| `stencils` | Stencils, stencil slots and crafting. |
| `projects` | Projects with phases → steps → goals, unflattened, all goal types. Expeditions are numbered. |
| `quests` | Quests with full objective trees (keys `'0'`, `'0.1'`, …), `category`, `requires` (quests, maps, raids) and `next`. |
| `skilltree` | Skill nodes and choice groups. |
| `amplification` | Amplified weapon variants and the upgrade graph. |
| `maps` | Map slugs and names, map event types. |
| `classification` | Rarities (level + game color), stash groups in game order with subgroups, and the categories/themes used by shipped items with their parents. Texts: `rarities`, `groups`, `subgroups`, `categories`, `themes` (by id). |

`Requirement` turns the game's gate items into meaning. Its `kind` is one of `bench` (with
`level`), `outpostLevel`, `quest`, `skill`, `unlock` (a learned blueprint or design) or `item`.

### Offer classification

Generic arc-data offers are sorted into domains by one ordered rule table:
`scripts/gamedata/offer-classes.ts`. An offer that matches no rule is not shipped and is reported
as `unclassifiedOffers`, and `--strict` fails on it. Supporting a new mechanic usually means adding
one rule and, if needed, one domain module in `scripts/gamedata/domains/`.

### Item classification (from the game)

Everything an item shows about its classification comes from the game files via arc-data (embark-api
`docs/Item-Classification.md`); the overlay never overrides it.

| `Item` field | Source (arc-data item) | Notes |
| --- | --- | --- |
| `category` | `category` | Short id: `Utility.Grenade`, `Firearm.SniperRifle`, `Misc.StudyItem`, `Recipe`. The in-game item card label is `classification` text `categories.<id>` ("Quick Use", "Research Item"). |
| `group`, `subgroup` | `stashGroup`, `stashSubgroup` | Stash tab (`Utilities`, `Weapons`, `Furniture.Seating`) and its subgroup (a category id). Names: `groups.<id>`, `subgroups.<id>` (may differ from the category name, e.g. "Grenades"). Absent for items outside the stash (Amplified weapon rows, currency, stations). |
| `rarity` | `rarity` 1-6 | `Common` … `Legendary`, `Amplified`. **Absent = the game gives no rarity** (blueprints, currency, some trinkets); apps show no rarity color, no default. |
| `foundIn` | `themes` | Theme short ids (`Residential`, `OldWorld`, `ARC`); labels in `themes.<id>`. |
| `weightKg` | `weightKg` | Omitted when `null`. |
| `tier`, `baseId`, `amplifiedFrom` | computed | From the upgrade graph, as before. |
| `effects` | `effects` | `[{ value?, valueText?, showSign?, positive? }]` (defaults omitted). Per item text `effects.<index>.{title,format}` (an object keyed by index, not an array). Render `format` with `{0}` = value (`+` when `showSign`), colored by `positive`. |

Short ids are the game tags without their prefix (`UI.ItemClassification.Category.`, `…Theme.`,
`UI.Inventory.CategoryFilter.`); see `scripts/gamedata/domains/classification-ids.ts`.

`arc-data/overlay/item-properties.json` is now read only for `questItem`, `modSlots` and, for
items whose game `effects` are empty (shields, augments, …), the old label → value `effects`
(converted: title = label, `valueText` = value, no format). Its type, rarity, weight and foundIn
are ignored.

`classification` structure: `rarities` (`level`, `color` #RRGGBB, the game's colors), `groups`
(`id`, `order`, `subgroups[]`; stash tabs in game order without "All"; only groups and subgroups with
shipped items), `categories` (id → `{ parent? }` for categories and themes in use plus ancestors).
The generator reports `rarityColorMismatch` when `$rarity-*` in `src/shared/styles/_variables.scss`
differs from the game colors, and `itemsWithoutCategory` (count per canonical type; stencil and
outpost rows are expected).

## Loading data in apps

```ts
import { loadDomain, nameOf } from '../shared/gamedata/loader';
import { loadItemCatalog } from '../shared/gamedata/catalog';

const quests = await loadDomain('quests', locale); // { structure, text }
const catalog = await loadItemCatalog(locale); // items + recipes + research, per-item app fields
```

- The structure is cached across locale switches. `nameOf(loaded, slug, fallbackEn)` gives the
  localized name.
- `CatalogItem` derives the fields most apps need: the primary recipe (specialized bench before
  the Workbench, research for research-only items), `craftBench`, `stationLevelRequired`,
  `blueprintLocked`, the next tier (`upgradesTo`/`upgradeCost` = the cost to reach the next tier)
  and `isWeapon` (category `Firearm.*`). It also carries the classification: `category`/`group`/`subgroup`
  ids with localized `categoryName`/`groupName`/`subgroupName`, `foundInNames` (theme labels), `rarity`
  (may be undefined) and formatted `effects` (`formatItemEffects`: `{ label, value, positive }`).
  `catalog.classification` holds rarities (with game colors and names) and the stash groups with
  subgroups in game order, for filters.
- **Apps use the classification directly** (no English type strings, no `'Common'` default, no
  `Old World` mapping): ids drive logic, filters and persisted preferences (category `Utility.Grenade`,
  group `Utilities`, subgroup, theme `OldWorld`); localized names are only for display (item card label
  = `categoryName`, "Found in" = `foundInNames`). Filters are built with `buildGroupFilters()`
  (`src/shared/gamedata/classificationFilters.ts`) from `catalog.classification.groups`, i.e. the
  stash tabs in game order with their subgroups; `useItemClassification()` gives a component the
  classification of the active locale. Items without a group (Amplified weapon rows, currency) are
  filed under `Weapons` when they are firearms (`itemFilterGroup`), else belong to no group and are
  not matched by a group filter. Items without rarity are not subject to rarity filters (loot helper)
  or are excluded by an explicit rarity selection (quartermaster); sorting by rarity puts them after
  Common (`compareRarityDesc`). Persisted filter values are versioned (`lootStore` schema 2,
  quartermaster `*.v2` localStorage keys), so old English values are dropped silently.
- Translate arctracker API item ids with `migrateArctrackerItemId`
  (`src/shared/data/arctrackerItemIdMigration.ts`).

## Running

```bash
npm run generate                                     # game-data → icons → game-data → server mappings → schedule
npx tsx scripts/generate-game-data.ts --strict       # release check
GAME_DATA_DIR=/tmp/arc GAME_DATA_OUT=/tmp/out npx tsx scripts/generate-game-data.ts   # dry run elsewhere
```

The generator prints a report:
- dropped references (cosmetics and unlock flags are expected)
- items without a name yet (the game files lag behind the API)
- offers without a shippable reward
- unresolved requirements
- items without a category, rarity colors that differ from the game, unknown rarity levels

Map data (`npm run generate:maps`) is separate; see `docs/Maps.md`.
