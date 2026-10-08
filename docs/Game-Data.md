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

`Requirement` turns the game's gate items into meaning. Its `kind` is one of `bench` (with
`level`), `outpostLevel`, `quest`, `skill`, `unlock` (a learned blueprint or design) or `item`.

### Offer classification

Generic arc-data offers are sorted into domains by one ordered rule table:
`scripts/gamedata/offer-classes.ts`. An offer that matches no rule is not shipped and is reported
as `unclassifiedOffers`, and `--strict` fails on it. Supporting a new mechanic usually means adding
one rule and, if needed, one domain module in `scripts/gamedata/domains/`.

### Item properties not in the API

Site type, rarity, weight, effects, mod slots, "found in" and the quest flag are not served by the
API. They come from `arc-data/overlay/item-properties.json`, seeded from the last arcraiders-data
snapshot. Items without an entry get a type derived from their kind and name, and rarity `Common`;
the generator reports how many. This will be replaced by game-file item data (embark-api ticket
A15).

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
  and `isWeapon`.
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

Map data (`npm run generate:maps`) is separate; see `docs/Maps.md`.
