# ARC Raiders – Quartermaster Core Specification
## Complete Specification Document (Core Logic)

---

# 1. OVERVIEW

## 1.1 Module Context

The Loot & Crafting Planner is a new module inside the existing **Raider Tools** application.

The Raider Tools application is built using:

- React
- Vite
- SCSS

All planner calculations are performed entirely client-side.

Item data is not manually curated inside the application.  
It is imported and normalized through an external preprocessing step defined in this specification.

Module name:

Quartermaster – Loadout, Loot & Craft Planner

Sidebar label:

Quartermaster

URL slug:

/quartermaster

### Integration (Raider Tools)

The Quartermaster module must be embedded as a Raider Tools “app” under:

```
src/apps/quartermaster/
```

Integration must follow the existing pattern used by:

```
src/apps/loot-helper/
```

This includes:

- App registration inside Raider Tools.
- Route registration under `/quartermaster`.
- Sidebar integration using the same mechanism as loot-helper.

Quartermaster-specific styles must be scoped to the app container and must not leak globally, following the loot-helper CSS approach.

---

## 1.2 Purpose

The purpose of this module is to support the full gameplay lifecycle of ARC Raiders through structured inventory management and planning views:

- Stash inspection
- Dynamic loadout inspection
- Goal list planning
- Loot suggestion guidance
- Craft execution planning
- Hideout/workbench progression planning
- Community project progression planning
- Quest required-item tracking

The system must:

- Aggregate multiple lists.
- Compute global material requirements.
- Provide deterministic and meaningful crafting and recycling suggestions.
- Provide deterministic and meaningful loot suggestions for both crafting support materials and loot-only final targets.
- Generate deterministic hideout upgrade lists based on the user's current hideout module levels.
- Allow generated hideout upgrade lists to participate in planner aggregation with higher priority than user-authored lists.
- Support loot acquisition planning for hideout upgrade materials.
- Keep generated hideout list composition read-only while preserving per-list and per-item enable/disable control.
- Generate deterministic project required-item lists based on cached user project progress.
- Allow generated project lists to participate in planner aggregation with higher priority than user-authored lists but lower than hideout lists.
- Keep generated project list composition read-only while preserving per-list and per-item enable/disable control.
- Generate deterministic quest required-item lists based on quest definitions and linked quest completion data.
- Allow generated quest lists to participate in planner aggregation with priority below hideout but above project and user-authored lists.
- Exclude pure quest tokens (`questItem: true`) from quest required-item lists.
- Keep generated quest list composition read-only while preserving per-list and per-item enable/disable control.
- Limit crafting depth to practical real-world gameplay expectations.
- Avoid unnecessary or confusing steps.
- Reserve required materials before recycling.
- Suggest lootable crafting materials relevant to active lists.
- Suggest missing loot-only final targets relevant to active lists.
- Provide workbench-grouped crafting instructions.
- Operate deterministically.

---

## 1.3 System Philosophy

- No server-side optimization.
- No economic optimization.
- `value` is not optimized for profit or efficiency, but MAY be used as a deterministic priority heuristic for ordering missing targets during planning.
- No rarity protection rules.
- No destructive automation.
- No in-app execution of actions.
- Advisory-only behavior.
- Deterministic results for identical inputs.
- Practical, real-world planning model aligned with how players actually craft, recycle, loot, and progress hideout benches in-game.
- Crafting depth limited to at most two levels.
- Recycling limited to a single transformation hop (no chaining).
- Pre-alpha compatibility policy: until further notice, the application does not require backward compatibility or migration support for evolving client-side data structures, internal planner data structures, or persisted pre-release state.

---

# 2. DATA SOURCES

---

## 2.1 Static Dataset (Client-Side)

### 2.1.1 Source

Raw source data is provided by the arctracker.io data repository checked out locally at:

```
../arcraiders-data/items/
```

This path is relative to the Raider Tools repository root.

These files are in source format and are the input to the import pipeline defined in section 3.

For testing purposes, canonical fixture source (pre-import source-format files) is:

```
docs/sample/items/*.json
```

Each file contains a single item in source format, including multilingual fields and metadata.

The importer must cope with this schema and iterate over all files at this location deterministically.

---

### 2.1.2 Final Item Schema (Post-Import, In-Memory Representation)

After import normalization and load into the application, each item inside the application has the following schema:

```ts
type BenchId =
    | "equipment_bench"
    | "explosives_bench"
    | "med_station"
    | "refiner"
    | "utility_bench"
    | "weapon_bench"
    | "workbench"

interface PlannerItem {
    id: string
    name: string
    description: string
    icon: string
    rarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary"

    type: string

    category: string
    subCategory?: string

    craftBench?: BenchId
    stationLevelRequired: 1 | 2 | 3
    blueprintLocked: boolean

    craftQuantity: number

    recipe?: Record<string, number>
    recyclesInto?: Record<string, number>
    salvagesInto?: Record<string, number>
    repairCost?: Record<string, number>
    repairDurability?: number

    stackSize: number
    value?: number
    weight?: number
    foundIn?: string[]
}
```

Items excluded during import do not exist in this dataset.

---

### 2.1.3 Default Assumptions

After import:

- `stackSize` is always defined.
- `stationLevelRequired` is always defined.
- `blueprintLocked` is always defined.
- `craftBench` is either a valid BenchId or undefined.
- Items with source `craftBench = "in_raid"` may exist in the planner dataset.
- No item retains `craftBench = "in_raid"` after normalization.
- `craftQuantity` is always defined.
- Default `craftQuantity` is `1` if missing in source.
- `blueprintLocked` indicates that static game data says the item requires a learned blueprint; it is not by itself a user-specific craftability decision.

---

### 2.1.4 Aggregated Dataset File (Production Output)

The CLI import tool (section 3.5) generates a single aggregated dataset file at:

```
public/data/quartermaster/items.json
```

This file must:

- Be generated locally before committing.
- Be committed to git.
- Be deterministic for identical input sources.

Format:

```json
{
  "version": 1,
  "items": {
    "heavy_ammo": {
      "name": "...",
      "description": "...",
      "icon": "...",
      "rarity": "Uncommon",
      "type": "...",
      "category": "...",
      "subCategory": "...",
      "craftBench": "workbench",
      "stationLevelRequired": 1,
      "blueprintLocked": false,
      "craftQuantity": 10,
      "recipe": { "chemicals": 2, "metal_parts": 3 },
      "recyclesInto": {},
      "salvagesInto": {},
      "stackSize": 999,
      "value": 0,
      "weight": 0,
      "foundIn": []
    }
  }
}
```

Properties:

- Top-level keys fixed: `version`, `items`.
- `items` is a map keyed by `itemId` (ASCII).
- Items are sorted by `itemId` ascending (ASCII).
- Within each item object, keys must be written in fixed canonical order:
  1. name
  2. description
  3. icon
  4. rarity
  5. type
  6. category
  7. subCategory (if present)
  8. craftBench (if present)
  9. stationLevelRequired
  10. blueprintLocked
  11. craftQuantity
  12. recipe (if present)
  13. recyclesInto (if present)
  14. salvagesInto (if present)
  15. stackSize
  16. value (if present)
  17. weight (if present)
  18. foundIn (if present)

- `recipe`, `recyclesInto`, and `salvagesInto` maps must have keys sorted ASCII ascending.

Application load behavior:

- At application startup, Quartermaster loads:
  - `/data/quartermaster/items.json`
- For each entry in `items` map:
  - Reconstruct in-memory `PlannerItem` with:
    - `id = itemId` (map key)
- No runtime fetching from arctracker.io.

---

## 2.2 Owned Quantity Definition

Quartermaster defines a canonical **owned quantity** for all planner calculations and UI overlays.

Definition:

```
ownedQuantity[itemId] =
    stashRootQuantity[itemId]
  + stashAttachmentQuantity[itemId]
  + loadoutRootQuantity[itemId]
  + loadoutAttachmentQuantity[itemId]
```

Where:

- `stashRootQuantity` comes from top-level cached stash items.
- `stashAttachmentQuantity` comes from valid attachment items nested under cached stash items.
- `loadoutRootQuantity` includes top-level items in the current loadout:
  - weapons
  - shield
  - quick-use slots
  - backpack
  - augment slots
  - safe pocket
- `loadoutAttachmentQuantity` comes from valid attachment items nested under loadout items.

Unknown `itemId`, `null` `itemId`, non-positive quantities, and item ids not present in the static Quartermaster item dataset are ignored.

If stash or loadout state has not been synced yet, owned quantity is considered **unknown**.

In such cases:

- owned quantity must render as `"?"`
- the placeholder must be visually neutral and non-intrusive
- planner logic may use available cached sources, with missing sources contributing `0`
- planner-adjacent views must warn that owned inventory is incomplete and identify whether inventory, loadout, or both are missing

---

# 3. ITEM IMPORT & NORMALIZATION PROCESS

The import process is an external preprocessing step that converts raw source JSON files into the final aggregated dataset defined in section 2.1.4.

This process must be deterministic.

---

## 3.1 Import Filtering Rules

### 3.1.1 Excluded by Type

Items with original `type`:

- Blueprint
- Outfit
- Backpack Charm

are excluded from import.

---

### 3.1.2 In-Raid Only Crafting

If an item has:

```
craftBench = "in_raid"
```

and no additional craftBench values,

the item must not be excluded from import.

Instead:

- the item remains in the imported dataset
- its normalized `craftBench` becomes `undefined`

Rationale:

- these items may appear in stash
- these items may be used as recipe inputs
- these items may be relevant for loot suggestions and planner calculations
- `in_raid` indicates absence of a hideout bench craft location, not absence from the planner dataset

After import, no item retains `craftBench = "in_raid"`.

---

## 3.2 craftBench Normalization

Source data may contain:

- A single string
- An array

Normalization algorithm:

1. If string:
  - If `"in_raid"` -> normalize to `undefined`.
  - Otherwise keep.

2. If array:
  - Remove `"workbench"`.
  - Remove `"in_raid"`.
  - Preserve original order.
  - If one remains -> use it.
  - If multiple remain -> use first.
  - If none remain -> use `undefined`.

After normalization, `craftBench` is either a single BenchId or undefined.

---

## 3.3 Category & SubCategory Mapping

Original `type` preserved.

During import:

### 3.3.1 Weapon Mapping

If `isWeapon === true`:

```
category = "Weapon"
subCategory = original type
```

### 3.3.2 Quick Use Mapping

If `type === "Quick Use"`:

```
category = "Quick Use"
```

SubCategory:

- explosives_bench -> "Explosive"
- med_station -> "Medicinal"
- utility_bench -> "Utility"

### 3.3.3 Direct Mapping

All other items:

```
category = type
subCategory = undefined
```

---

## 3.4 Default Field Completion

During import:

- Missing `stackSize` -> 1
- Missing `stationLevelRequired` -> 1
- Missing `blueprintLocked` -> false
- Missing `craftQuantity` -> 1

---

## 3.5 Data Source & Transformations

### 3.5.1 Item Data Source

Quartermaster reads item data from the shared database at:

```
public/data/items/items.<locale>.json
```

This database is generated by the shared `scripts/generate-items.ts` pipeline (run via `npm run generate:items`). It contains all upstream item fields with no QM-specific transformations — item types, `craftBench` arrays, and field names are preserved as-is from `../arcraiders-data/items/`.

### 3.5.2 Load-Time Transformations

All QM-specific transformations (sections 3.1–3.4) are applied at **load time** in `src/apps/quartermaster/utils/dataLoader.ts::loadAllItems()`:

- **Exclusions** (3.1): Blueprint items are filtered out during loading. Outfit and Backpack Charm are already excluded by the shared generator.
- **craftBench normalization** (3.2): `string | string[]` → single `BenchId` or `undefined`.
- **Category mapping** (3.3): Category and subCategory are derived during loading.
- **Defaults** (3.4): `stationLevelRequired`, `blueprintLocked`, and `craftQuantity` get defaults.
- **Field renames**: `imageFilename` → `icon`, `weightKg` → `weight`.
- **Weapon chain metadata**: `upgradesFrom`, `weaponBaseId`, `weaponTier` are pre-computed by the shared generator and passed through.

### 3.5.3 Hideout Data Source

Hideout module definitions are generated by a dedicated script:

```
scripts/generate-hideout.ts
```

Run via `npm run generate:hideout`. Outputs to `public/data/quartermaster/hideout.<locale>.json`.

The generator:
- Reads all JSON files from `../arcraiders-data/hideout/`.
- Excludes `stash.json`.
- Sorts modules by `id` ASCII ascending.
- Sorts `requirementItemIds` by `itemId` ASCII ascending.
- Loads bench images from Embark API data when available.

### 3.5.4 package.json Integration

```json
"generate:items": "npx tsx ./scripts/generate-items.ts",
"generate:hideout": "npx tsx ./scripts/generate-hideout.ts",
```

Both generated files (items and hideout) must be committed to git.

---

# 4. DYNAMIC API INTEGRATION (ARCTRACKER VIA PROXY)

Quartermaster integrates with arctracker.io through the shared Raider Tools API layer and proxy architecture.

Quartermaster must not call arctracker.io directly.

All API interaction must go through:

```
src/shared/services/arctrackerApi.ts
```

which proxies requests to:

```
https://api.raider-tools.app/me/arctracker
```

The Lambda proxy injects the application authentication key and forwards rate-limit headers.

Quartermaster consumes cached data from IndexedDB and triggers sync operations through the shared API service.

---

## 4.1 Authentication Dependency

Quartermaster relies on the global authentication system provided by:

```
src/shared/context/AuthContext.tsx
```

Authentication flow is defined globally and not re-implemented in Quartermaster.

Quartermaster must:

- Use `useAuth()` to access:
  - `isAuthenticated`
  - `isValidating`
  - `username`
- Not implement its own token storage.
- Not access `localStorage` directly for tokens.

Behavior:

- If `isValidating === true`:
  - Show loading state.
  - Do not execute planner logic.
- If `isAuthenticated === false`:
  - Display message prompting user to log in.
  - Provide navigation to `/settings/profile`.

Logout behavior:

- On logout, token is removed and IndexedDB cache is cleared by shared logic.
- Quartermaster must respond reactively to auth state changes.

---

## 4.1A Game Data Source Selection

Quartermaster supports two authenticated game-data sources:

```ts
type GameDataSource = "arctracker" | "embark"
```

The selected source is global account state stored on the Raider Tools profile.
Quartermaster must use exactly one active source at runtime and must not combine
ArcTracker and Embark data in a single planner run.

Rules:

- `arctracker` is the default source for existing users.
- `embark` may be selected only when the user has an active Embark link and is
  allowed by the Embark access gate.
- Completing the Embark linking flow counts as selecting Embark and stores the
  source on the Raider Tools profile.
- If Embark is active and the token expires, Quartermaster must prompt the user
  to re-authenticate with Embark.
- Quartermaster must not silently fall back to ArcTracker when Embark expires.
- Source changes must not reuse stale cached data from the previous source as
  current planner input.

---

## 4.1B Embark Inventory Source

When the active source is Embark, Quartermaster syncs one shared Raider Tools
resource:

```text
POST /me/embark/inventory/sync
```

This route fetches:

```text
GET /v1/pioneer/inventory
```

from Embark server-side and normalizes the raw inventory response into the same
runtime concepts Quartermaster already uses:

- `CachedStash`
- `CachedLoadout`
- `CachedHideout`
- `CachedBlueprints`

Embark inventory sync must:

- run only through Raider Tools API routes
- require a linked Embark token
- require Embark access
- reject expired Embark tokens before calling Embark
- apply persisted throttling
- preserve previous cached data on failure
- expose unknown `gameAssetId` diagnostics without failing the whole sync

The generated Embark mapping artifact used by the Lambda is produced by:

```bash
npm run generate:embark-inventory-mapping
```

and committed at:

```text
infra/lambda/data/embark-inventory-mapping.json
```

---

## 4.2 Stash / Inventory Integration

### 4.2.1 Sync Operation

In ArcTracker mode, inventory sync must call:

```ts
syncStashAllPages()
```

Behavior:

- Fetches all stash pages through proxy.
- Aggregates server-side via shared service.
- Stores result as `CachedStash` in IndexedDB.
- Returns the synced object.

### 4.2.2 Cached Data Usage

Quartermaster reads stash using:

```ts
getStash()
```

Inventory aggregation rules:

- Aggregate by `itemId`.
- Ignore `slotIndex` for quantity calculations.
- Use `CachedStash.items`.
- Count valid `attachments` entries as separately owned items.
- Preserve attachment parent context for My Items display.
- Unknown `itemId` not present in static dataset must be ignored.
- If sync fails:
  - Previously cached stash remains available.
  - No cache clearing occurs.
- Timestamp for header:
  - Use `CachedStash.syncedAt`.

### 4.2.3 Error Handling

Sync methods may throw `ApiError`.

Behavior:

- `status === 401`:
  - Prompt user to re-authenticate.
- `status === 429` or `isRetryable === true`:
  - Show warning.
- Other errors:
  - Show error message.
- Quartermaster must not clear existing cache on failure.

---

## 4.3 Loadout Integration

### 4.3.1 Sync Operation

In ArcTracker mode, loadout sync must call:

```ts
syncLoadout()
```

### 4.3.2 Cached Data Usage

Quartermaster reads loadout using:

```ts
getLoadout()
```

Planner loadout aggregation rules:

- Loadout data is **not used as planner targets**.
- Loadout data is used as an owned inventory source.
- Count valid `attachments` entries as separately owned items.
- Preserve loadout and attachment parent context for My Items display.
- Planner logic must ignore `CachedLoadout` when computing `requiredFinal`.
- Planner logic must include `CachedLoadout` when computing owned quantities, deficits, crafting availability, recycling availability, and In Raid suggestions.

Timestamp for header:

- Use `CachedLoadout.syncedAt`.

### 4.3.3 Error Handling

Same rules as section 4.2.3.

### 4.3.4 Combined My Items Sync

In ArcTracker mode, the My Items view must expose one combined **Sync My Items**
action.

The combined sync action must:

- sync inventory first
- then sync loadout
- display the current step:
  - `Syncing inventory...`
  - `Syncing loadout...`
- preserve individual error handling internally so failures identify the failing operation

---

## 4.3.5 Embark Global Sync UX

When the active source is Embark, Quartermaster must expose one global **Sync**
action in the app header area.

Behavior:

- Label: `Sync`
- While syncing: `Syncing inventory...`
- The action syncs inventory, loadout, hideout, and blueprints from one Embark
  inventory request.
- On success, all four cached runtime concepts update together.
- On failure, the previous cache remains active.
- Throttle errors must show when sync is next available.
- Token expiry must show a reconnect action for `/profile/embark`.
- Unknown Embark items must be visible through diagnostics or a collapsed
  unknown-items section and must not affect planner calculations.

In Embark mode, per-view sync buttons must not trigger separate Embark resource
syncs. My Items, Hideout, and Crafting may either hide their local sync buttons
or delegate them to the global Embark sync action.

ArcTracker mode keeps the existing per-view sync controls.

---

## 4.4 Hideout Bench Levels

Quartermaster uses the user hideout state from the hideout API to determine actual bench craftability.

Bench level source:

- If cached hideout state exists and is valid:
  - use the user's actual bench levels
- If hideout state is unavailable, missing, or invalid:
  - fall back to assuming all benches are level 3

Meaning of `stationLevelRequired`:

- `stationLevelRequired` refers to the minimum required level of the item's `craftBench`

An item is bench-eligible only if:

- `craftBench` is defined
- the corresponding bench exists in the user's hideout state or is assumed available under fallback mode
- user bench level is `>= stationLevelRequired`

Clarifications:

- This bench-level check affects local craft planning.
- This bench-level check does not remove the item from stash view.
- This bench-level check does not remove the item from static datasets.
- Generated hideout upgrade lists continue to use actual cached hideout state only and do not use fallback mode.

If an item cannot be crafted due to blueprint restriction or insufficient hideout bench level:

- it remains a target but may become unreachable in planner results
- the UI must display a warning indicator

If fallback mode is active because hideout state is unavailable:

- planner may treat the item as craftable under assumed bench level 3

---

## 4.5 Hideout Progression Integration

Quartermaster integrates with the user hideout endpoint through the shared Raider Tools API layer.

### 4.5.1 Sync Operation

The Hideout view must provide a **Sync Hideouts** button.

This button must call the shared API method for:

```text
/api/v2/user/hideout
```

The returned hideout state must be cached locally, analogous to stash and loadout caching.

### 4.5.2 Cached Data Usage

Quartermaster reads cached hideout state from local cache.

Hideout cache must contain at least:

- module id
- currentLevel
- maxLevel
- syncedAt timestamp

Hideout state is considered usable for bench craftability if:

- cache exists
- it has module ids and current levels for relevant benches
- the data is not structurally invalid

If sync fails:

- previously cached hideout state remains available
- no cache clearing occurs

### 4.5.3 Generation Dependency

Generated hideout upgrade lists are derived from:

- imported hideout definitions from `/data/quartermaster/hideout.json`
- cached user hideout state

If no cached hideout state exists:

- no generated hideout upgrade lists are shown
- Hideout view must display a hint prompting the user to use **Sync Hideouts**

If cached hideout state is unavailable, missing, or invalid:

- generated hideout upgrade lists must not be synthesized from fallback bench level assumptions

Generated hideout upgrade lists must not be displayed in the Lists view.

Generated hideout upgrade lists are displayed only in the top-level Hideout view.

### 4.5.4 Generated Upgrade List Rules

For each hideout module:

```ts
targetLevels = levels where level > currentLevel
```

Generate one list per future unlock/tier.

Rules:

- Generate every future tier per bench, not only the next tier.
- `currentLevel = 0` means the bench is not yet unlocked.
- `targetLevel = 1` is the bench Unlock step.
- Unlock is treated as the first tier.
- Each generated list contains only the requirement items for that specific unlock/tier.
- Generated lists are non-cumulative.
- Generated list composition is read-only.
- Generated list quantities are read-only.
- Generated lists are not reorderable.
- Generated list items are not reorderable.
- Users may enable or disable each generated list.
- Users may enable or disable individual generated list items.
- Only generated list and generated item toggle state is persisted.
- If a generated list disappears due to hideout progression, obsolete toggle state must be removed.

Recommended generated list names:

```text
<Bench Name> Unlock
<Bench Name> Tier <N>
```

Generated list ids may remain:

```text
hideout_<moduleId>_<level>
```

### 4.5.5 Exclusions

The `stash` module must not generate upgrade lists.

Unknown hideout modules not present in the imported static dataset must be ignored.

---

## 4.6 Project Progression Integration

Quartermaster integrates with game project progress through either the ArcTracker or Embark API layer, depending on the user's selected game data source.

### 4.6.1 Data Sources

Static project definitions come from generated locale-specific JSON files:

```
/data/quartermaster/projects.<locale>.json
```

Each project contains:
- `id` — unique project identifier (e.g. `"trophy_display_project"`)
- `name` — localized project name
- `phases[]` — ordered steps with `name`, `index` (1-based), and `requirementItemIds[]`

Project progress comes from one of two sync sources:
- **ArcTracker**: `GET /api/v2/user/projects` — returns per-phase `requirements[]` (`itemId`, `required`, `submitted`) and `categoryRequirements[]` (`category`, `required`, `submitted`) alongside `phase.completed: boolean`
- **Embark**: `POST /v1/pioneer/projects/list` — returns per-goal progress (`amount` submitted vs required, `state` per goal)

The active source is determined by the global `gameDataSource` setting: `'arctracker'` or `'embark'`.

### 4.6.2 Sync Operation

The Projects view must provide a **Sync Projects** button.

**ArcTracker sync flow:**
- Calls `/me/arctracker/v2/user/projects` through the existing ArcTracker proxy
- Returns per-phase `requirements` and `categoryRequirements` alongside completion data
- Each requirement is mapped to a `CachedProjectGoal` with `itemId`, `required`, `submitted`, `remaining`, `completed`
- Each category requirement is mapped to a `CachedProjectCategoryGoal` with `category`, `required`, `submitted`, `remaining`, `completed`
- `remaining` is computed as `required - submitted` (clamped to ≥ 0)
- `completed` is `submitted >= required`
- Unknown `itemId`s (not in static definitions) are skipped
- Uses the API's `phase` field as the step index directly

**Embark sync flow:**
- Calls `POST /me/embark/projects/sync` (new dedicated Lambda)
- Lambda calls `POST /v1/pioneer/projects/list` upstream with `states: ["IN_PROGRESS","COMPLETED","ABANDONED","DEPARTED"]`
- Response is decoded through a bundled `project-mapping.json` artifact that maps `projectAssetId`/`goalAssetId` integers to project IDs, step names, and item IDs
- Returns per-goal progress: `required`, `submitted`, `remaining`, `completed`
- Cached in DynamoDB under `EMBARK#PROJECTS#LATEST` per user
- `GET /me/embark/projects` reads latest cached progress

The returned project progress must be cached locally in IndexedDB, analogous to stash and loadout caching.

### 4.6.3 Cached Data Usage

Quartermaster reads cached project progress from local cache.

Project progress cache must contain at least:
- `projectId` — matches project definition id
- `projectName` — display name
- `completed` — whether all steps are complete
- `steps[]` — per-step progress with `name`, `index`, `completed`, `goals[]`, `categoryRequirements[]`
- `syncedAt` timestamp

Project progress is considered usable if cache exists and contains valid step data.

If sync fails:
- previously cached project progress remains available
- no cache clearing occurs

### 4.6.4 Generation Dependency

Generated project required-item lists are derived from:
- imported project definitions from `/data/quartermaster/projects.json`
- cached project progress (from API sync)

If no cached project progress exists:
- no generated project lists are shown
- Projects view must display a hint prompting the user to **Sync Projects**

Generated project lists must not be displayed in the Lists view.
Generated project lists are displayed only in the top-level Projects view.

### 4.6.5 Generated List Rules

For each project, generate one list per step.

Rules:
- Generate a list for every step regardless of completion status
- A step is only considered completed when ALL its own goals are COMPLETED AND all previous steps in the project are also COMPLETED
- Completed steps default to disabled
- All other steps default to enabled
- List ID format: `project_<projectId>_<stepIndex>` (stepIndex is 1-based, matching the step's `index` field)
- List naming: `"Step <N> (<StepName>)"` (project name is shown on the project card header, not repeated in each step row)
- List type: `'project'`
- Requirements are non-cumulative (each step list contains only its own requirements)
- When cached goal progress is available (from either ArcTracker or Embark), each item uses the `remaining` quantity from the cached goal data; otherwise falls back to the full static quantity
- Each item displays a `submitted / required` progress indicator (e.g. `"5 / 10"`) below the item name when cached progress is available
- A green checkmark overlay on an item indicates the user CAN submit it (owns enough in inventory for the remaining quantity), NOT that it is already submitted. When `submitted >= required`, no green checkmark is shown
- If a step has `categoryRequirements` in cached progress, a category summary section renders below the item grid with per-category progress bars (`formatNumber(submitted) / formatNumber(required)`) and a visual percentage fill. Category requirements are non-interactive and are not tracked for in-raid planning
- **No-fallback**: Lists are only generated for projects that exist in both the static definitions AND the cached progress. Projects present in definitions but absent from cached progress are silently skipped and produce no planner targets

**Expired Project Filtering**:
- Each project definition includes `startDate` and `endDate` as Unix epoch seconds
- Projects whose `endDate` is earlier than the current time are filtered out — they produce no lists, are not shown in the Projects view, and contribute no planner targets
- This filtering applies regardless of whether cached progress exists for the expired project
- Projects with no `endDate` (e.g. permanent projects like Trophy Display) are never filtered
- **Completed projects**: Completed projects remain visible in the Projects view only while they are not expired. Non-expired completed projects show a green checkmark and do not contribute planner targets. Expired projects are hidden even if fully completed

Available-to-submit detection:
- A step is "available to submit" only if it is the first incomplete step in its project AND the user owns all required items
- Items where `submitted >= required` are excluded from this check (they are already submitted and require no further action)
- Future steps beyond the current incomplete step show required items but do NOT trigger available-to-submit

### 4.6.6 Planner Integration

Project lists merge into the planner priority chain after hideout and before user lists:

```
hideout → project → user
```

Rules:
- Enabled project lists contribute planner requirements
- Disabled project lists do not contribute planner targets
- Disabled project items do not contribute planner targets
- Planner prioritizes hideout targets first, then project targets, then user-authored list targets
- Duplicate item targets sum quantities while retaining list-type priority metadata
- In Raid suggestions reflect project priority between hideout and user-authored list priority
- Crafting plan reflects project priority between hideout and user-authored list priority
- Obsolete project toggle cleanup runs after project progress sync

### 4.6.7 Toggle Persistence

Project toggle state is stored in `quartermasterStore.projectToggles`:
- `listEnabled`: keyed by `"projectId:stepIndex"`
- `itemEnabled`: keyed by `"projectId:stepIndex:itemId"`

After project progress sync, `cleanupObsoleteProjectToggles()` removes toggle state for steps that are now completed.

---

## 4.7 Blueprint Integration

Quartermaster integrates with the user blueprints endpoint through the shared Raider Tools API layer.

### 4.7.1 Sync Operation

The Crafting view must provide a **Sync Unlocked Blueprints** button next to **Sync My Items**.

If cached blueprint state is available, the blueprint sync control must show learned blueprint progress as:

```text
{learned}/{total} unlocked
```

This button synchronizes the user's learned blueprint state.

Expected response shape:

```ts
interface ArcTrackerBlueprintResponse {
  data: {
    blueprints: ArcTrackerBlueprint[]
  }
}

interface ArcTrackerBlueprint {
  id: string
  name: string
  category: string
  rarity: string
  learned: boolean
  targetItemId: string
}
```

If `learned` is `true`, the item identified by `targetItemId` is considered blueprint-unlocked.

### 4.7.2 Cached Data Usage

Quartermaster reads cached blueprint state from local cache.

Blueprint cache must contain at least:

```ts
interface CachedBlueprints {
  unlockedItemIds: string[]
  blueprintsByTargetItemId: Record<string, CachedBlueprint>
  syncedAt: string
}
```

Rules:

- `unlockedItemIds` contains only blueprints with `learned === true`.
- `unlockedItemIds` is sorted ASCII ascending.
- `blueprintsByTargetItemId` is keyed by `targetItemId`.
- Failed sync must not clear previously cached blueprint state.
- Sign-out must wipe cached blueprint state with other ArcTracker user data.
- Unknown `targetItemId` values must be ignored by planner logic.

### 4.7.3 Craftability Dependency

The planner must receive the learned blueprint target item ids derived from cached blueprint state.

For example, this API entry makes `deadline` craftable if all other craftability checks pass:

```json
{
  "id": "deadline_blueprint",
  "name": "Deadline Blueprint",
  "category": "Explosives",
  "rarity": "Common",
  "learned": true,
  "targetItemId": "deadline"
}
```

---

# 5. HARD STRATEGY CONSTRAINTS


---

## 5.1 Recycling Restrictions

Non-recyclable categories:

- Weapon
- Ammunition
- Augment
- Modification
- Quick Use
- Shield

Define:

```
nonRecyclableCategories = [
  "Weapon",
  "Ammunition",
  "Augment",
  "Modification",
  "Quick Use",
  "Shield"
]
```

Rule:

```
if item.category in nonRecyclableCategories:
    item cannot be recycled
```

Additionally:

- Items in `nonRecyclableCategories` are excluded from loot suggestions only as recycle-based or salvage-based acquisition candidates.
- Items in `nonRecyclableCategories` are never recycled by the planner.
- If an item in `nonRecyclableCategories` is itself a missing final target, it may still appear in the In Raid view as a direct bring-home target.

---

## 5.2 Value Is Irrelevant

No economic optimization is performed.

Value is not used to maximize profit, minimize cost, or choose between economically equivalent strategies.

However, `value` MAY be used solely as a deterministic priority heuristic to decide which missing final targets are planned first.

Missing `value` is treated as `0` for ordering.

---

## 5.3 Strategy Priority (v1)

Planning order for missing final targets:

1. Generated hideout upgrade lists.
2. User-authored lists.

Within generated hideout upgrade lists:

1. Next upgrades first, where `targetLevel === currentLevel + 1`.
2. Remaining future tiers.
3. Bench/module name ascending.
4. Target level ascending.
5. Item order within the generated list.
6. `value` descending.
7. `itemId` ascending (ASCII).

Within user-authored lists:

1. List order (top to bottom in the Lists UI).
2. Item order within the list (top to bottom).
3. `value` descending.
4. `itemId` ascending (ASCII).

If the same `itemId` appears in generated hideout lists and user-authored lists:

- quantities sum
- generated hideout priority wins for the item's earliest priority metadata

If the same `itemId` appears in multiple generated hideout lists:

- quantities sum
- the earliest generated hideout priority position wins

Planning model is greedy and deterministic.

Buying excluded from v1.

---

# 6. CORE PLANNER LOGIC

This chapter defines all deterministic computation rules used to derive the canonical planner result.

The planner uses a simplified, practical, greedy algorithm aligned with typical in-game behavior.

Additional clarification:

If planner provenance for crafting dependencies is available, provenance chains SHOULD include:

```
Final Target -> Intermediate Ingredient -> Current Item
```

If no intermediate ingredient exists, the chain contains only:

```
Final Target -> Current Item
```

## 6.1 Required Target Aggregation

Planner targets are derived from two sources:

- generated hideout upgrade lists
- user-authored lists

Disabled lists and disabled list items are ignored.

Generated hideout upgrade lists have higher priority than user-authored lists for all planner outputs, including:

- In Raid suggestions
- Crafting plan
- material deficits
- target ordering
- protected-from-recycling reservations

Equivalent aggregation order:

```ts
allLists = [...orderedHideoutLists, ...userLists]
```

`orderedHideoutLists` must be deterministic:

1. next upgrades first
2. remaining future tiers
3. bench/module name ascending
4. target level ascending

Aggregation rule:

```ts
requiredFinal[itemId] =
  sum(quantity across all enabled lists and enabled list items)
```

Duplicate `itemId` values across any list sources must sum quantities.

Priority metadata must record the earliest position after applying hideout-first ordering. This earliest position controls deterministic target processing and must be stable for identical inputs.

Generated hideout lists are not stored as user-authored lists. They are generated from hideout definitions plus cached hideout state, then merged into planner input before user-authored lists.

## 6.2 Craftability Predicate

An item is locally craftable if:

- item has `recipe`
- `craftBench` is defined
- required bench exists in planner
- bench level is `>= stationLevelRequired`
- blueprint availability passes the runtime blueprint rule

Runtime blueprint rule:

```ts
if (!item.blueprintLocked) {
  return true
}

return unlockedBlueprintItemIds.has(item.id)
```

Meaning:

- Items not marked `blueprintLocked` in static data remain craftable without blueprint API state.
- Items marked `blueprintLocked` are craftable only when their `item.id` appears in the learned blueprint cache.
- If no blueprint cache exists yet, `blueprintLocked: true` items are treated as not locally craftable until blueprints are synced.
- Blueprint blocker diagnostics are preserved for statically blueprint-locked items absent from the learned blueprint set.

### Weapon Family Blueprint Propagation (Change-26)

For weapons linked by an upgrade chain (`weaponBaseId` + `weaponTier`):

- The tier 1 base weapon owns the `blueprintLocked` flag and the `craftBench` definition.
- `computeCraftability` propagates the base weapon's **blueprint lock status** and **bench condition** to every higher-tier family member (`weaponTier > 1` with matching `weaponBaseId`).
- When the base weapon's blueprint is locked, every family member receives `hasRecipe: true`, `canCraft: false`, and the inherited `blueprint` condition — causing the red lock icon to appear on all tiers.
- The base weapon's bench condition (`label`, `detail`, `satisfied`) is also propagated so the tooltip craft conditions section shows the bench requirement on tier 2+ weapons.
- `planWeaponUpgradeTarget` adds the target weapon's `itemId` (not just the root) to `blueprintBlockers`, so the StashView status column also shows "Blocked: blueprint not unlocked" for the higher-tier target.

## 6.3 Depth-Limited Crafting Output Availability

The planner must treat committed depth-2 craft outputs as available to their parent craft.

Example:

- Desired list contains `deadline` x1.
- Stash contains `comet_igniter` x1, `explosive_compound` x3, and `arc_alloy` x80.
- Learned blueprint set contains `deadline`.
- `deadline` requires `arc_circuitry` x2.
- `arc_circuitry` crafts from `arc_alloy` x8 each.

Planner result must include:

- Craft `arc_circuitry` x2.
- Craft `deadline` x1.

Depth-2 craft inputs must be checked before the parent target is marked satisfiable.

### 6.3.1 Pre-Planning: Repair Material Reservation (Change-22)

Before the greedy planner runs, a repair pre-pass evaluates owned items with `repairCost` that appear in any enabled list:

1. For each owned item with `repairCost` and `durabilityPercent < 30`, compute repair material requirements from `repairCost`.
2. Consume repair materials from the shared owned inventory (`avail`) before the greedy planner runs.
3. If materials are insufficient, record the deficit quantities in `repairPlan.deficits`.
4. Repair materials (items listed in any `repairCost` for a below-threshold item) are protected from recycling by the greedy planner.

The repair pre-pass modifies the `owned` record passed to `runGreedyPlanner`, reducing available quantities of repair materials.

## 6.4 Material Protection & Transactional Target Planning

Repair materials identified by the pre-pass (section 6.3.1) are added to `protectedFromRecycle` before the greedy planner executes. This prevents the planner from recycling materials needed for repair.

Planning for a single missing final target must be transactional.

The planner may simulate crafting and recycling while evaluating a target, but it must not commit any of the following to the canonical planner result until the target is proven fully satisfiable:

- recycle actions
- consumed owned quantities
- produced recycle yields
- depth-2 craft outputs
- final craft outputs
- craft steps

If a target remains blocked after simulation, such as by a missing raid-only ingredient, blueprint blocker, bench blocker, or unavailable sub-ingredient, all simulated recycle and craft effects for that target must be discarded.

Blocked targets must still contribute to remaining ingredient deficits and In Raid guidance, but they must not create Crafting view actions.

### Iterative Partial Satisfaction

When the full deficit quantity of a craftable target cannot be satisfied, the planner uses a **binary search** over decreasing quantities (from `need - 1` down to 0) to find the maximum satisfiable quantity using the full pipeline (recycling + L2 crafting). This prevents valid recycle and craft actions from being discarded just because the full quantity is unreachable.

**Algorithm**:

```
need = required - owned
if !trySatisfy(need, state):
  // binary search for max satisfiable quantity
  lo = 0, hi = need - 1
  while lo <= hi:
    mid = ceil((lo + hi) / 2)
    if trySatisfy(mid, testState):
      bestQty = mid; lo = mid + 1
    else:
      hi = mid - 1

if bestQty > 0:
  commit trySatisfy(bestQty, state)  // includes recycle + L2 craft actions

// Fallback: partial craft from directly available L1 materials for remaining need
remaining = need - bestQty
if remaining > 0:
  craftRemainingFromDirectAvail(remaining)
```

The transactional model is preserved — each `mid` attempt runs in a fresh clone of the current state. Only the successful maximum-quantity attempt is committed. If no quantity is satisfiable (even `quantity=1` fails), only the direct-avail partial craft fallback is used (no recycling).

This ensures that recycle actions for materials like Bastion Cells and Leaper Pulse units can be committed toward partial target satisfaction, rather than being discarded wholesale when the full target quantity fails.

Example:

- Desired list contains `heavy_shield` x1.
- `heavy_shield` requires `power_rod` x1 and `voltage_converter` x2.
- `power_rod` can be crafted from materials available through recycling.
- `voltage_converter` is still missing and cannot be locally produced.

Planner result must not include recycling or crafting steps solely for `heavy_shield`, because the final target is not locally satisfiable.

---

## 6.5 Loot Suggestion Provenance (Shared Architecture)

The planner uses a shared provenance utility to identify which user lists and target items depend on a given suggested item.

### Provenance Aggregation

1.  **Scope**: Provenance is calculated for:
    -   **Direct Targets**: Missing final items from user lists.
    -   **Crafting Materials**: Direct and nested ingredients required for target items.
    -   **Recycle/Salvage Sources**: Items that yield needed crafting materials or final target items.
2.  **Logic**:
    -   Recursive traversal of recipes and upgrade costs (ingredients from both are combined).
    -   Cycle protection (max depth 20).
    -   `craftQuantity` math: `numCrafts = ceil(need / craftQuantity)`.
3.  **Merge Rule**: If an item is both a direct target and a crafting support material, the list sources from both paths must be merged and deduplicated. Impacted target IDs from both paths must be combined.
4.  **Quantity Semantics**:
    -   For **direct targets**, the provenance quantity is the quantity of the item requested in that list.
    -   For **crafting support materials**, the provenance quantity is the **effective requirement**: how many of this material are needed to fulfill the requirements of the supported final target in that list, taking into account the `craftQuantity` of the target.
    -   For **recycle/salvage sources**, the provenance quantity represents the quantity of the **supported material** that is needed, not the quantity of the source item itself.
    -   **Mixed Provenance Protection**: If an item is both a direct target and a support material for the same list, the direct provenance takes precedence, and support material quantities are excluded from the total to avoid ambiguous unit mixing (source item count vs. yielded material count).
5.  **Impacted Targets**: Each list source entry tracks which final target items (`impactedTargetItemIds`) are supported by this item in that specific list.

### Dependency Tracking

Provenance for crafting support must track deep dependencies. An item is considered "impacted" by a final target if:

-   It is a direct ingredient in the target's recipe.
-   It is a nested ingredient (e.g., ingredient of an ingredient).
-   It recycles or salvages into a missing ingredient or target (direct or nested).

---

# 7. ASSUMPTIONS

(All previous assumptions remain unchanged.)

Additional assumptions:

- Owned quantity includes stash plus entire loadout.
- Unknown owned quantity renders as `"?"`.
- Planner computation treats unknown quantity as `0`.
- Crafting provenance may include intermediate ingredient chains when available.

---

# 8. OPEN QUESTIONS

None.

---

# 9. FUTURE FEATURES

(All previous future feature sections remain unchanged.)

---

# 10. EXPLICIT NON-GOALS

(All previous non-goals remain unchanged.)

---

# 11. TESTING & VALIDATION

(All previous testing and validation scenarios remain unchanged.)

Additional validation scenarios:

- Owned quantity correctly aggregates stash and loadout.
- Unknown stash/loadout state renders `"?"` quantity placeholder.
- Planner logic remains deterministic even when quantity placeholder is displayed.
- Craft provenance chains correctly display `Final -> Intermediate -> Current` when applicable.
- Sidebar includes Hideout between Lists and In Raid.
- Sidebar includes Projects between Hideout and In Raid.
- Sidebar includes Quests between Projects and In Raid.
- Lists view renders only user-authored lists.
- Lists view no longer renders generated hideout upgrade lists or Sync Hideouts.
- Hideout view renders Sync Hideouts at the top.
- Hideout view shows no generated lists when no hideout cache exists.
- Hideout view shows every bench from static definitions except excluded modules.
- Hideout view shows completed benches with `Tier <current>/<max>` and completed state.
- Hideout view generates one list for every future unlock/tier.
- Unlock is shown as the first tier for benches with `currentLevel = 0`.
- Generated hideout list and item toggles persist.
- Disabled generated hideout lists do not contribute planner targets.
- Disabled generated hideout items do not contribute planner targets.
- Planner prioritizes generated hideout targets before user-authored list targets.
- Duplicate item targets sum quantities while retaining generated hideout priority metadata.
- In Raid suggestions reflect generated hideout priority before user-authored list priority.
- Crafting plan reflects generated hideout priority before user-authored list priority.
- Obsolete generated hideout toggle cleanup still runs after hideout progression.
- Generated project required-item lists persist per-project-step toggles.
- Disabled project lists do not contribute planner targets.
- Disabled project items do not contribute planner targets.
- Generated quest required-item lists use linked quest completion data to filter incomplete quests.
- Quest required-item lists exclude pure quest tokens (`questItem: true`).
- Quest list priority: hideout → quest → project → user.
- Quest lists are always enabled; only per-item toggles exist (no per-quest enable/disable).
- Quest tracking modes ("Disable All" / "Enable All Pending") operate at the item level.
- Quests view layout uses flex-wrap grid blocks (not accordions) with Projects-style item cards.
- Quests view supports two sort modes persisted to localStorage: alphabetical (A-Z) and Next Quests (BFS hop distance from available quests).
- Quest provenance in item tooltips is grouped under a separate "Needed for Quests" headline.
- Quest view shows explainer when no linked quest snapshot exists.
- Planner prioritizes generated hideout targets first, then project targets, then user-authored list targets.
- Duplicate item targets sum quantities while retaining list-type priority metadata.
- In Raid suggestions reflect project priority between hideout and user-authored list priority.
- Crafting plan reflects project priority between hideout and user-authored list priority.
- Obsolete project toggle cleanup runs after project progress sync.

---

---

# ARC Raiders – Quartermaster UX Specification
## Complete Specification Document (User Experience & Presentation)

---

# 1. TYPOGRAPHY

## 1.1 Item Name Typography

All **in-game item names** must use the **Urbanist font** and must be rendered in **uppercase**.

This rule applies to:

- Item icon labels
- Tooltip titles
- Table item-name cells
- Grid labels

This rule does **not** apply to:

- UI navigation labels
- Section headers
- System labels
- Non-item descriptive text

Other UI text continues using the existing Raider Tools font system.

---

# 2. ITEM ICON SYSTEM

## 2.1 Quantity Overlay

All item icons must display the **owned quantity** overlay.

Definition:

- Quantity shown above the icon always represents **stash + entire loadout quantity**.

This rule applies consistently across all views.

**Exception — Unstacked items:** Items rendered as individual instances (unstacked rows with `instanceIndex !== undefined`, i.e., items carrying `repairCost` such as weapons) must **not** show the quantity overlay badge. Each unstacked row represents exactly one instance; the aggregate total is visible in the item tooltip instead (Change-26).

If owned quantity is unknown:

- display `"?"` as placeholder
- placeholder must be light gray
- placeholder must be visually unobtrusive

---

## 2.2 Additional Quantities

Additional contextual quantities must **never replace the overlay number**.

Instead they appear **below the icon** with a descriptive prefix.

Examples:

- `2/7 Missing`
- `Needed for List X`
- `Complete`

---

# 3. TOOLTIP SYSTEM

## 3.1 Tooltip Coverage

Tooltip must appear on:

- all top-level item icons
- icons rendered inside tables
- icons rendered inside crafting rows

Tooltip must NOT appear on:

- autocomplete results
- icons rendered inside tooltips themselves

---

## 3.2 Tooltip Layout

Tooltip layout follows the **loot-helper popup style**, with a two-column split when planning data is available.

### Header Area (always present)

1. Icon on the left (with rarity border and background)
2. Owned quantity pill (backpack icon + number) in top-right corner
3. Item name and Type/Rarity badges
4. Horizontal separator line

### Body Area

The body splits into two columns when the item has calculated planning information
(Needed for Lists or Needed for Crafting). Otherwise, a single-column layout is used.

**Column 1 — Static Information (always present, left column):**

1. Description in italic
2. Properties list (Stack Size, Weight, Value, Found In locations)
3. Crafting Recipe section (if applicable)
4. Recycles Into section (if applicable)
5. Salvages Into section (if applicable)

**Column 2 — Calculated Information (optional, right column):**

1. Needed for Lists section (if applicable)
2. Needed for Crafting section (if applicable)

If no column 2 content exists, column 1 spans the full width.

---

## 3.3 Tooltip Properties Section

Displayed properties:

- Stack Size
- Weight
- Value (Coins)
- Found In locations

Icons must be used for property representation.

Example icons:

- Residential
- Commercial

---

## 3.4 Tooltip Inventory Section

Additional Quartermaster property:

- Quantity owned (stash + loadout)

---

## 3.5 Tooltip Crafting Sections

Sections displayed if present:

- Crafting Recipe
- Recycles Into
- Salvages Into

Rules:

- smaller item icons
- item names displayed
- quantities aligned to the right

Recycle and salvage yield items are displayed as a flat, unhighlighted list. Crafting contribution highlighting may be added in a future iteration.

### Weapon Cumulative Recipe (Change-26)

For weapons with `weaponTier > 1` and a valid `weaponBaseId`, the "Crafting Recipe" section title changes to **"Crafting Recipe (including Upgrades)"**. The displayed materials are the **cumulative recipe**: tier 1 base `recipe` costs plus every `upgradeCost` along the chain from the base weapon to the displayed tier. This gives the player the honest total material investment from scratch.

Tier 1 base weapons and non-weapon items continue to show their direct `recipe` under the standard "Crafting Recipe" header.

---

## 3.6 Tooltip Status Information

Tooltip must display Quartermaster status context in the right column (Column 2).

### Needed for Lists

Each list entry shows:

- A list-type icon (`List` for user lists, `Home` for hideout lists) followed by the list name
- A quantity badge (styled like `crafting-view__material-qty`) showing the required amount
- On the right side: either a "COMPLETE" badge (green) or a "`<qty>` NEEDED" badge
  - The NEEDED badge is red with white text, styled like `in-raid-view__missing-circle`
  - The `<qty>` is the missing quantity for this item in this specific list

### Needed for Crafting

Each crafting entry shows:

- A list-type icon (`List` for user lists, `Home` for hideout lists) followed by the list name (no quantities)
- Below the list name: the target/goal item, prefixed with a small item icon (24px) with rarity border/color and background
- On the right side: either a "COMPLETE" badge (green) or a "NEEDED" badge (red)
- Crafting chain text is **not displayed** (reserved for future improvement)

The COMPLETE/NEEDED badge is aligned to the right of the combined list-name + goal-item block, not below it.

### Could be used for

When the planner recommends recycling an item for yields that contribute to a user's active planning targets, a **"Could be used for"** section appears below "Needed for Crafting" in the right column.

Each entry shows:

- A list-type icon (`List` for user lists, `Home` for hideout lists)
- The yield item icon + quantity preceded by an arrow (→)
- The target item icon + name
- On the right side: either a "COMPLETE" badge (green) or a "NEEDED" badge (red)

The phrasing **"Could be used for"** conveys an advisory tone — the recycle/salvage yield is an optional path toward a goal, not a mandate.

Data source: `ItemInsight.recycleSalvageUsages`, populated from the planner's committed recycle actions (`RecycleAction.reasons`).

### Needed for Repair (Change-22)

When an item is needed for repair (as a repair material or as the item itself needing repair), a **"Needed for Repair"** section appears in the right column.

Each entry shows:

- A list-type icon (`List` for user lists, `Home` for hideout lists)
- The target item icon + name that needs repair
- The quantity of this item needed for the repair (for materials) or the list quantity (for the repaired item itself)

Data source: `ItemInsight.repairNeeds`, populated from the repair planner's committed `RepairAction[]`.

---

---

## 3.7 Tooltip Viewport Safety

Tooltip must never overflow viewport.

Rules:

- If tooltip would extend below screen bottom → reposition upward.
- If tooltip would extend beyond right edge → reposition left.

Tooltip must remain fully visible.

---

# 4. VIEW-SPECIFIC DISPLAY RULES

---

## 4.1 My Items View

### Quantity Behavior

Icon overlay shows owned quantity.

The view shows the canonical owned inventory: stash items, current loadout items, stash attachments, and current loadout attachments.

Attached items must be displayed as separate owned items.

Rows are aggregated by `itemId` **except for items with `repairCost`**. Items with `repairCost` are unstacked: each instance (stash slot, loadout slot) gets its own row, preserving per-instance `durabilityPercent`. Items without `repairCost` are aggregated as before. If an item exists in multiple locations, the row must show summarized location subtext rather than duplicate rows.

**Unstacked quantity suppression (Change-26):** Unstacked rows (`instanceIndex !== undefined`) suppress the quantity overlay badge on the `ItemIcon`. Each row represents exactly one instance; the aggregate total remains visible in the item tooltip's have-pill.

### Durability Display (Change-22)

Items with `repairCost` display a durability percentage bar below the item name and location labels:

- A horizontal bar showing fill proportion based on `durabilityPercent` (0–100%)
- Color coding: `< 30%` = red (`#e74c3c`), `30–70%` = yellow (`#f0ad4e`), `> 70%` = green (`#27ae60`)
- Percentage label (e.g., `74.4%`) to the right of the bar
- Items with undefined `durabilityPercent` default to `100%` (no bar shown)

Sort order: items are sorted by name ascending, then by durability descending (better condition first) for items with the same name.

Required location labels:

- `In current loadout`
- `Attached to {weaponName} in stash`
- `Attached to {weaponName} in current loadout`

Top-level weapons with counted attachments must show an indicator that their attachments were counted separately.

If stash/inventory or loadout has not been synced, the view must warn that owned inventory is incomplete.

### Filtering

My Items supports the following filters (additive — all active filters combine):

- **Search** — text search against item names
- **Category** — dropdown filter by item category
- **Rarity** — dropdown filter by item rarity tier
- **Show Useless** — checkbox toggle that shows only items with **no planner relevance at all**

When "Show Useless" is active, the view shows only items that are:

- Not directly needed by any active list
- Not an ingredient in any crafting chain for active targets
- Not a recycle/salvage source
- Not a weapon upgrade base
- Not needed for repair (as a repair material or as the item repaired)

This corresponds to the item tooltip's right column (Column 2) being empty. Items matching all these criteria have no crafting or planning value and can be safely sold.

If all items are useful (none are useless), enabling this filter shows the "No items match" empty state.

Filter state (search query, category, rarity, and the "Show Useless" toggle) persists in `localStorage` so it is retained when switching between views or navigating away from and back to the Quartermaster app within the same browser session. Filters are device-local UI preferences and are not synced across devices.

---

### My Weapons View

The My Weapons view is a dedicated Quartermaster sidebar view for owned weapons and weapon modifications. It appears directly after My Items and is gated behind the same inventory/auth requirements as My Items.

The view contains a local segmented control with two modes:

- **Weapon View** — shows one card per owned weapon instance from cached stash and current loadout data.
- **Mods View** — shows all known weapon modifications grouped by slot type.

Weapon cards must be built from exact root weapon instances in `CachedStash.items` and `CachedLoadout.loadout.weapon1/weapon2`. `OwnedItemDisplayRow` must not be used as the weapon-card source because it aggregates attachment locations and cannot preserve exact per-weapon attachment lists. Each owned weapon instance preserves source (`stash` or `loadout`), durability, and its direct nested attachments.

Weapon cards use a fixed width and wrap into rows when horizontal space is available. Only loadout weapons show a source badge; stash weapons do not show an "In stash" badge. The weapon item icon uses the same size and tooltip behavior as My Items, including craftability badges, priority marking, and the shared item tooltip on hover.

Weapon slot data comes from `PlannerItem.modSlots`. Quartermaster must pass through non-empty `modSlots` from the generated item data. Raw slot keys are `muzzle`, `magazine`, `stock`, `grip`, and `special`. Display slot types split raw `magazine` slots into Light, Medium, or Shotgun based on compatible mod IDs and icons. Empty slots are determined by comparing a weapon instance's attached mod item IDs against the compatible mod IDs declared for each slot. Attached mods that cannot be matched to any declared slot are displayed in an unmatched-attachments row and do not fill a declared slot.

Mod slot cards are smaller than weapon cards and four mod slots must fit in a single row within one weapon card. Each slot card always shows the fixed slot-type icon at a consistent position, whether the slot is empty or has an attached mod. Attached mod item icons are smaller than weapon item icons. Empty slots show a placeholder box icon in the same content position as an attached mod icon. Compatible mod names are not shown inline; hovering a slot shows a formatted overlay with a small table of compatible mod names, attached owned count, and available owned count. Attached counts use a locked/red visual treatment; available counts use an unlocked/green visual treatment. When the weapon has a preferred build, the compatible-mod overlay highlights the preferred mod for each slot in yellow if that mod would complete an incomplete build on the current weapon instance, and in green if the preferred mod is already correctly attached.

Weapon View filters:

- text search against weapon name, attached mod names, weapon slot type labels, unattached mod names, and unattached mod slot type labels in the separate unattached-mod list
- weapon type dropdown from owned weapon `subCategory`
- "Show Incomplete Only" for weapons with at least one empty mod slot

Weapon sorting:

1. rarity from rarest to most common
2. localized weapon name
3. durability descending for same-name weapons
4. deterministic instance id

Mods View must show all items whose category is `Modification`, grouped by reverse compatibility slot type. Owned mod instances are flattened from `OwnedItemDisplayRow.locations`: direct stash/loadout locations are unattached, and attachment locations preserve their parent weapon name and source. The `fitsEmptySlots` count is computed from owned weapon instances and counts empty compatible slots, not weapons.

Preferred Weapon Builds are synced in Quartermaster user state as `weaponBuilds`. A build is keyed by exact `weaponItemId`, not weapon family, and contains one preferred mod item ID or `null` per slot. Builds may be saved with incomplete slots. When opening the build configuration from a specific weapon card and no saved build exists for that weapon item ID, the overlay defaults each slot to the mods currently attached to that clicked weapon instance. The build configuration overlay shows each compatible mod option as a button-like selectable control with clear selected and unselected states, not as visible radio inputs. It also shows a locked/unlocked craftability indicator next to each compatible mod option. Build matching checks only owned weapon instances with the same exact item ID and displays `matched / total preferred mods` when the build has at least one preferred mod.

Slot icons are served from `/images/weapon-mods/{filename}`. The normalized files are:

- `light-mag.webp`
- `medium-mag.webp`
- `muzzle.webp`
- `shotgun-mag.webp`
- `shotgun-muzzle.webp`
- `stock.webp`
- `tech-mod.webp`
- `underbarrel.webp`

---

### Status Indicators

The **Need** column is removed. The status column carries requirement and planner explanation.

Indicators must display contextual and quantified explanation:

- **Have** (green) – include owned and required quantities
- **Needed** (red) – include missing, required, owned, and list context
- **Recycle** – display target item + list name
- **Upgrade Base** – item is a weapon upgrade base (from weapon upgrade plan)
- **Blocked** – display uncraftable reason when applicable
- **Owned** (no planner relevance) – item has no active requirement or usefulness; shown only when "Show Useless" filter is inactive (useful items are hidden when filter is on)

Examples:

```text
Have 12 / 10 required for Loadout
Need 3 more for Loadout (10 required, 7 owned)
Need 5 more across 3 lists (18 required, 13 owned)
Owned 4
Recycle for Mechanical Components (Loadout)
Blocked: blueprint not unlocked
```

---

## 4.2 Loadout View

The dedicated Loadout view is removed. Current loadout data is represented inside My Items.

---

## 4.3 Lists View

The Lists view contains user-authored lists only.

Icon overlay displays owned quantity.

Editing controls must be visually larger:

- + button
- − button
- Hide button

Buttons must be placed on the **left side** of rows, except for the **Delete button**, which must be placed at the **far right** of the row (after the + button).

Numerical input fields for item quantities must not display browser-native "up/down" value widgets (spinners). They must be manually editable with immediate updates upon entry and support incremental changes via the + and − buttons. Any non-numeric characters must be ignored during manual entry.

### List Actions

The Lists view must support existing user-list behavior:

- create list
- rename list
- delete list
- reorder lists
- add items
- remove items
- reorder items
- change quantities
- enable or disable lists and items

### Safety and Confirmation

- **Delete List**: Deleting a list that contains one or more items must require user confirmation. Empty lists may be deleted without confirmation.
- **Delete Item**: Deleting an item from a list must require user confirmation.

### Title Editing

The title of a list must be displayed as a read-only headline by default.
- An **Edit** (pencil) button must be displayed next to the title with the tooltip "Edit title".
- Clicking the Edit button replaces the headline with an input field.
- A **Save** (check/disk) button must be displayed next to the input field to commit changes.
- Saving or cancelling the edit returns the title to the read-only headline state.

---

## 4.4 Hideout View

The Hideout view is a top-level Quartermaster view between Lists and In Raid.

The sidebar view order is:

1. My Items
2. My Weapons
3. Lists
4. Hideout
5. Projects
6. Quests
7. In Raid
8. Crafting

The Hideout view owns all generated hideout upgrade list presentation and controls.

### Sync Controls

The **Sync Hideouts** button appears at the top of the Hideout view.

Rules:

- If no hideout cache exists, show a prompt explaining that hideout data must be synced before upgrade lists can be generated.
- While syncing, disable the button and show loading state.
- The Lists view must not show Sync Hideouts.

### Bench Overview

The Hideout view must present all hideout benches/modules from static definitions except excluded modules.

Each bench must show:

- bench/module name
- current tier
- max tier
- completed state when fully upgraded
- generated upgrade lists for every future unlock/tier

Tier badge format:

```text
Tier <currentLevel>/<maxLevel>
```

Fully upgraded benches remain visible and show a completed state next to the tier badge. A green checkmark is the preferred visual treatment.

### Unlock and Tier Lists

The first upgrade level is the bench Unlock tier.

Rules:

- `currentLevel = 0` means the bench is not yet unlocked.
- The first generated upgrade list for such a bench is labeled as the unlock step.
- Unlock requirements participate in planning exactly like later tier requirements.
- Fully upgraded benches have no generated upgrade lists and do not contribute planner targets.

Recommended display labels:

```text
Unlock
Tier 2
Tier 3
Tier 4
```

### Generated List Controls

Generated hideout lists in the Hideout view:

- may be enabled or disabled
- may have individual items enabled or disabled
- may not be renamed
- may not have items added
- may not have items removed
- may not be reordered
- may not have quantities changed

### Empty and Completed States

The Hideout view must clearly handle:

- static data loading
- no cached hideout state
- sync in progress
- synced with pending upgrades
- synced with all benches completed
- unknown cached modules ignored

No fallback bench-level assumptions may be used to synthesize hideout upgrade lists.

---

## 4.5 Projects View

The Projects view is a top-level Quartermaster view between Hideout and In Raid.

The Projects view owns all generated project required-item list presentation and controls.

### Sync Controls

The **Sync Projects** button appears at the top of the Projects view.

Rules:
- If no project progress cache exists, show a prompt explaining that project data must be synced before required-item lists can be generated.
- While syncing, disable the button and show loading state.
- The Lists view must not show Sync Projects.

### Project Overview

The Projects view must present only non-expired projects that have synchronized cached progress.

- Projects whose `endDate` has passed are expired and must not be shown
- Projects with no synchronized progress produce no lists and are not shown
- Each visible project must show:
  - project name
  - completed state when all steps are complete (green checkmark)
  - tracking count badge (unique required items tracked)
  - "Submit Available" badge when the current step's items are all owned
  - generated required-item lists for every step

Completed non-expired projects remain visible and show a completed state with a green checkmark. Expired projects are hidden regardless of completion status.

### Step Lists

Project steps are displayed as full-width rows within the expanded project, one step per line.

Each step row shows:
- A header line: enable/disable toggle (eye icon), step name (`"Step <N> (<StepName>)"`), completed pill badge, submit-available pill badge
- An item row below the header: item icons with names and `submitted / required` progress indicators (e.g. `"5 / 10"`)
- Missing deficit badges and green checkmark overlays on individual items
- The `submitted / required` indicator always sits at the bottom of the item cell, regardless of how many lines the item name wraps

### Tracking Controls

A segmented control at the top of the view provides bulk tracking modes:

| Mode | Behavior |
|------|----------|
| **Disable All** | Disables tracking for every pending project step |
| **Next Steps Only** | Enables only the first incomplete step for each project |
| **All Pending** | Enables every incomplete step for all projects |

Individual steps can be toggled via eye icon buttons.
Individual items within steps can be toggled by clicking on them.

### Generated List Controls

Generated project lists in the Projects view:
- may be enabled or disabled
- may have individual items enabled or disabled
- may not be renamed
- may not have items added
- may not have items removed
- may not be reordered
- may not have quantities changed

### Empty and Completed States

The Projects view must clearly handle:
- static data loading
- no cached project progress
- sync in progress
- synced with pending steps
- synced with all projects completed

No fallback assumptions may be used to synthesize project required-item lists.

### Available-to-Submit Badge

The "Submit Available" badge appears on:
- A project card header when any of its steps is available to submit
- The specific step card that is available to submit

A step is available to submit when:
1. It is the first incomplete step in its project
2. The user owns all required items in sufficient quantity

The sidebar navigation badge for Projects shows the total count of available-to-submit steps across all projects.

---

## 4.6 In Raid View

### Grid Layout

Each item must appear inside a distinct grid cell.

Grid spacing must match loot-helper grid style.

Item names may wrap to 2–3 lines and grid height must accommodate this.

---

### Action Icons

Only **one action icon** appears per item.

Precedence rules:

1. Direct Target (bring home)
2. Salvage candidate
3. Recycle candidate

Icons appear aligned directly after the item icon.

---

### Quantities

Overlay number = owned quantity.

Below icon display:

```
x/y Missing
```

Example:

```
2/7 Missing
```

---

### Priority Targets Section

When prioritized items exist, a dedicated "Priority Targets" section appears above "Direct Targets – Bring Home". The section header uses a filled Star icon in golden color. Prioritized items are de-duplicated and do not appear in lower sections. Prioritized items that the planner did not generate as In-Raid suggestions (e.g., marked from My Items without active lists) appear as synthetic "bring home" targets in the Priority Targets section.

### Section Spacing

Add visual spacing between:

- PRIORITY TARGETS section
- DIRECT TARGETS section
- CRAFTING MATERIALS section
- CRAFTABLE MATERIALS section

### Craftable Materials Section

A fourth section **"Craftable Materials"** appears below "Crafting Materials" when the planner identifies items that can be crafted into needed materials but are not themselves in deficit.

These items have the `CRAFTING_INGREDIENT_FOR_DEFICIT` InRaidReason and `BRING_HOME` badge.

Selection logic:
- Item is in the provenance map (deep dependency of a target)
- Item's deficit is zero (not already suggested as a direct material)
- Item is not in a non-recyclable category
- Item has at least one impacted target with a deficit that is NOT fully satisfiable

Items in this section retain provenance (`impactedTargetItemIds` and `listSources` populated).

### Repair Material Deficits (Change-22)

Repair material deficits from the repair pre-pass are included in `remainingIngredientDeficits`, which feeds the In Raid suggestion pipeline. Items with repair material deficits appear as `BRING_HOME_DIRECT_MATERIAL` suggestions with appropriate list provenance.

## 4.7 Crafting View

### Repair Section (Change-22)

A **Repair** section appears before the Recycle section when the repair plan has actions. The section header uses the `Wrench` icon and the localized label "Repair".

Each row shows:
- Item icon + name
- Current durability percentage (color-coded)
- Materials needed for repair (icon + name + quantity ×N)
- "Why" column showing which lists contain the item

### Sync Controls

The Crafting view must include:

- **Sync My Items**
- **Sync Unlocked Blueprints**

The blueprint sync control must refresh cached learned blueprint state and recompute planner output.

If blueprint sync fails, previous cached blueprint state remains active.

### Table Alignment

Crafting tables must align columns across sections.

Recommended implementation:

- fixed width for first two columns (item icon + name)

---

### Crafting Reason Display

Each crafting step must include provenance information:

```
List Name → Target Item
```

Small icon of target item must be shown.

Tooltip for the icon must display the full item tooltip.

Step 1 Recycle reasons must be based on committed recycle action provenance, not broad dependency matching.

Recycle reasons must only describe targets that are locally satisfiable and whose plan was committed.

The Recycle "Why" column must not show:

- blocked final targets
- simulated-but-discarded final targets
- completed intermediate dependency paths
- `COMPLETE` status badges

Preferred recycle reason format:

```
List Name → Target Item
Target Item → Needed Material
```

---

### Inputs Needed Layout

Each input must be displayed on a separate line.

Format:

```
[small icon] Item Name — Quantity
```

Aligned vertically.

---

# 5. ICON BADGE SYSTEM

Badges must use icon + color.

Badge precedence:

1. Direct Target
2. KEEP
3. RECYCLE
4. DISCARD

Missing and Uncraftable indicators must always be visible when applicable.

---

# 6. COMPONENT CONSISTENCY

All item displays must use the shared **Item Icon Component**.

The quartermaster `ItemIcon` (`src/apps/quartermaster/components/ItemIcon.tsx`) delegates visual rendering (container, image, name, rarity border/background) to the shared `ItemIcon` from `src/shared/components/ItemIcon` (imported as `SharedItemIcon`). App-specific overlays (badges, prioritize star, lock icon, quantity—rendered by quartermaster, not shared) are passed as `children`.

Rarity colors are sourced from shared `_variables.scss` via `$rarity-*-border`. Sizing uses the CSS custom property `--item-icon-size` (mapped from the `size` prop: xs=30px, sm=80px, md=84px, lg=108px).

`ItemTooltip` icon classes (`qm-item-tooltip__icon`, `qm-item-tooltip__material-icon`, `qm-item-tooltip__needs-icon`) use `SharedItemIcon` directly, with per-class sizing via `--item-icon-size` in SCSS.

Consistency rules:

- identical icon container styling
- identical rarity border
- identical quantity overlay
- deterministic badge ordering

---

# 7. DESIGN PRINCIPLES

The Quartermaster UX prioritizes:

- high information density
- low cognitive load
- visual scanning over reading
- deterministic visual patterns

Users should be able to understand status and priority **without reading large text blocks**.

---

# 8. ASSUMPTIONS

- Urbanist font available in application bundle.
- Tooltip component reused from loot-helper where possible.
- Icon assets available for Found In categories.
- Item icon component supports overlay badges and quantity rendering.

---

# 9. OPEN QUESTIONS

None.

---

# 10. FUTURE UX FEATURES

Possible future improvements:

- advanced visual dependency graphs
- animated crafting steps
- color-blind accessibility themes
- optional compact mode

---

# 11. EXPLICIT NON-GOALS

- No redesign of Raider Tools global layout
- No theme engine
- No animation-heavy UI
- No responsive mobile redesign at this stage
