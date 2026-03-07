# ARC Raiders – Loot & Crafting Planner
## Complete Specification Document (Current State)

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

Quartermaster must follow the same global styling system as Raider Tools, including:

- Shared base color palette.
- Shared spacing and layout conventions.

Quartermaster uses custom font size definitions larger than shared defaults:

- Extra small: 11px
- Small: 12px
- Base: 13px
- Medium: 14px
- Large: 16px
- Extra large: 18px

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

The system must:

- Aggregate multiple lists.
- Compute global material requirements.
- Provide deterministic and meaningful crafting and recycling suggestions.
- Provide deterministic and meaningful loot suggestions for both crafting support materials and loot-only final targets.
- Generate deterministic hideout upgrade lists based on the user's current hideout module levels.
- Allow generated hideout upgrade lists to participate in normal planner aggregation.
- Support loot acquisition planning for hideout upgrade materials.
- Keep generated hideout list composition read-only while preserving per-list and per-item enable/disable control.
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

## 2.1.2 Final Item Schema (Post-Import, In-Memory Representation)

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

    stackSize: number
    value?: number
    weight?: number
    foundIn?: string[]
}
```

Items excluded during import do not exist in this dataset.

---

## 2.1.3 Default Assumptions

After import:

- `stackSize` is always defined.
- `stationLevelRequired` is always defined.
- `blueprintLocked` is always defined.
- `craftBench` is either a valid BenchId or undefined.
- Items with source `craftBench = "in_raid"` may exist in the planner dataset.
- No item retains `craftBench = "in_raid"` after normalization.
- `craftQuantity` is always defined.
- Default `craftQuantity` is `1` if missing in source.

---

## 2.1.4 Aggregated Dataset File (Production Output)

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

## 2.1.5 Hideout Upgrade Definitions Source

Raw source data for hideout upgrade requirements is provided by the arctracker.io data repository checked out locally at:

```
../arcraiders-data/hideout/
```

This path is relative to the Raider Tools repository root.

Each file represents a hideout module and its level requirements.

Quartermaster must import this data into a local static dataset for client-side use.

The generated local dataset file is:

```
public/data/quartermaster/hideout.json
```

This file must:

- Be generated locally before committing.
- Be committed to git.
- Be deterministic for identical input sources.

Only fields required by Quartermaster need to be included.

In-memory shape:

```ts
interface HideoutRequirementItem {
  itemId: string
  quantity: number
}

interface HideoutLevelDefinition {
  level: number
  requirementItemIds: HideoutRequirementItem[]
}

interface HideoutModuleDefinition {
  id: string
  name: string
  maxLevel: number
  levels: HideoutLevelDefinition[]
}
```

Import rules:

- Read all files from `../arcraiders-data/hideout/`.
- Sort filenames ASCII ascending.
- Exclude `stash.json`.
- Sort modules by `id` ASCII ascending.
- Sort `requirementItemIds` by `itemId` ASCII ascending.

The `stash` module must be excluded from generated hideout-upgrade lists because it upgrades via Coins and is not represented as item requirements for Quartermaster planning.

Application load behavior:

- At application startup, Quartermaster loads:
  - `/data/quartermaster/hideout.json`
- No runtime fetching from arctracker.io for hideout definitions.

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

## 3.5 CLI Import Tool (Node)

### 3.5.1 Purpose

Provide a Node.js CLI tool to import and normalize items from:

```
../arcraiders-data/items/
```

and hideout definitions from:

```
../arcraiders-data/hideout/
```

The CLI must generate the aggregated dataset files:

```
public/data/quartermaster/items.json
public/data/quartermaster/hideout.json
```

The CLI must be run locally before committing.

The generated files must be committed to git.

### 3.5.2 package.json Integration

The CLI must be integrated following existing Raider Tools conventions, similar to:

```
"generate:items-loot-helper": "./scripts/generate-item-data-loot-helper.sh",
```

Quartermaster must define analogous generation script support, for example:

```
"generate:items-quartermaster": "./scripts/generate-item-data-quartermaster.sh",
"generate:hideout-quartermaster": "./scripts/generate-hideout-data-quartermaster.sh",
```

The shell script may invoke a Node.js script responsible for the import and normalization logic.

Hideout generation may be implemented either:

- as part of the same Quartermaster generator command, or
- as a dedicated script

Both generated files must still be deterministic and committed to git.

### 3.5.3 Deterministic Behavior

The CLI must:

- Read all JSON files from `../arcraiders-data/items/`.
- Sort filenames ASCII ascending before processing.
- Parse each file.
- Apply filtering and normalization rules from sections 3.1–3.4.
- Aggregate into the final JSON structure defined in section 2.1.4.
- Sort items by itemId ASCII ascending.
- Sort nested maps (`recipe`, `recyclesInto`, `salvagesInto`) by key ASCII ascending.
- Write JSON with stable key ordering and stable formatting.

For hideout data, the CLI must:

- Read all JSON files from `../arcraiders-data/hideout/`.
- Sort filenames ASCII ascending before processing.
- Parse each file.
- Exclude `stash.json`.
- Copy or normalize only fields required by Quartermaster.
- Sort modules by `id` ASCII ascending.
- Sort `requirementItemIds` by `itemId` ASCII ascending.
- Write JSON with stable key ordering and stable formatting.

Failure behavior:

- Invalid JSON -> exit non-zero.
- Missing source directory -> exit non-zero.
- Write failure -> exit non-zero.

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
https://api.raider-tools.app/arctracker
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

## 4.2 Stash Integration

### 4.2.1 Sync Operation

Sync Inventory button must call:

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

Planner stash input rules:

- Aggregate by `itemId`.
- Ignore `slotIndex`.
- Use `CachedStash.items`.
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

Sync Loadout button must call:

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
- Loadout data is used only for the **Current Loadout View**.
- Planner logic must ignore `CachedLoadout` when computing `requiredFinal`.

Timestamp for header:

- Use `CachedLoadout.syncedAt`.

### 4.3.3 Error Handling

Same rules as section 4.2.3.

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

The Lists view must provide a **Sync Hideouts** button.

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
- Lists view must display a hint prompting the user to use **Sync Hideouts**

If cached hideout state is unavailable, missing, or invalid:

- generated hideout upgrade lists must not be synthesized from fallback bench level assumptions

### 4.5.4 Exclusions

The `stash` module must not generate upgrade lists.

Unknown hideout modules not present in the imported static dataset must be ignored.

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

1. List order (top to bottom in the Lists UI).
2. Item order within the list (top to bottom).
3. `value` descending.
4. `itemId` ascending (ASCII).

Planning model is greedy and deterministic.

Buying excluded from v1.

---

# 6. CORE PLANNER LOGIC

This chapter defines all deterministic computation rules used to derive the canonical planner result.

The planner uses a simplified, practical, greedy algorithm aligned with typical in-game behavior.

Constraints:

- Maximum crafting depth: 2 levels.
- Recycling: single transformation hop only.
- No recycle chaining.
- Salvage is in-raid only and does not affect local crafting reachability.
- Outputs of planned crafts and recycling become globally available for subsequent targets.

---

## 6.1 Aggregation of Lists

### 6.1.1 List Selection

Only lists marked as enabled are considered.

Within each list, only items marked as enabled are considered.

Lists are always aggregated globally.

All active lists are added together, and the stash must contain all required items from all active lists.

---

### 6.1.2 Required Aggregation

For each itemId:

```
requiredFinal[itemId] = sum(quantity across all active + enabled list items)
```

Duplicate itemIds across lists must sum quantities.

Ordering:

- Deterministic by list order (top → bottom).
- Within lists by item order (top → bottom).
- Final tie-breakers follow section 5.3.

If an item cannot be crafted due to blueprint restriction or insufficient hideout bench level:

- it remains a target but may become unreachable in planner results
- the UI must display a warning indicator

If fallback mode is active because hideout state is unavailable:

- planner may treat the item as craftable under assumed bench level 3

Each `requiredFinal[itemId]` entry retains provenance of all contributing lists.

For each required item, planner output must be able to derive:

- which list names contributed to that item,
- total required quantity across lists,
- per-list contribution quantity.

This provenance is used by the UI for explanatory detail, especially in the In Raid view.

---

### 6.1.3 Generated Hideout Upgrade Lists

Quartermaster supports two list sources:

- user-authored lists
- generated hideout upgrade lists

Generated hideout upgrade lists are derived on demand from cached hideout state and imported hideout definitions.

Generation rules:

For each imported hideout module:

- determine `currentLevel`
- for each target level where `targetLevel > currentLevel` and `targetLevel <= maxLevel`, generate one list
- list items are exactly the `requirementItemIds` for that target level only
- requirements are not cumulative across intermediate levels

Display naming:

- `<Bench Name> to Level <N> (Next)` for `targetLevel = currentLevel + 1`
- `<Bench Name> to Level <N>` for higher future levels

Behavior:

- generated lists participate in planner aggregation exactly like user-authored lists
- generated lists may be enabled or disabled individually
- generated list items may be enabled or disabled individually
- generated list names and item composition are read-only
- generated lists are not manually reorderable

Persistence:

- generated lists themselves are not stored as materialized lists
- only user toggle state is persisted
- persisted toggle state must be keyed deterministically by generated list identity and item identity

Lifecycle:

- if a generated list no longer exists after hideout sync, persisted toggle state for that list and its items must be removed
- if a future level becomes the new next level after hideout sync, its generated label updates accordingly

---

## 6.2 Stash Totals and Missing Final Items

Define:

```
have[itemId] = stashTotals[itemId] (0 if absent)
missingFinal[itemId] = max(0, requiredFinal[itemId] - have[itemId])
```

This defines stash usage.

---

## 6.3 Definitions for Planning

### 6.3.1 Crafting Levels

- Level 0: Item already exists in stash.
- Level 1: Craft final target item.
- Level 2: Craft a direct ingredient of a final target item.
- No planning beyond Level 2.

### 6.3.2 Recipe-Relevant Items

Define:

- `recipeIngredientSet`: all itemIds that appear as keys in any `recipe`.
- `recipeOutputSet`: all itemIds that have `recipe` defined.
- `recipeRelevantSet = recipeIngredientSet ∪ recipeOutputSet`.

### 6.3.3 Crafting-Relevant Items

An item is crafting-relevant if:

- `item.category` is not in `nonRecyclableCategories`, AND
- (`item.id` in `recipeRelevantSet` OR
  item.recyclesInto yields any material in `recipeRelevantSet`)

Salvage is not considered for crafting-relevance.

### 6.3.4 Loot-Only Final Targets

A final target item is a loot-only final target if all of the following are true:

- `missingFinal[itemId] > 0`
- the item is present in `requiredFinal`
- the item is not locally craftable into itself within planner rules
- the item must therefore be obtained directly from raid loot

Clarifications:

- An item may be a loot-only final target even if it has `recyclesInto` or `salvagesInto`.
- Recycling and salvage outputs do not make the item craftable.
- Loot-only final targets are primary acquisition targets and must be surfaced in the In Raid view.
- Loot-only final targets are independent from crafting-relevance and are not filtered out by section 6.3.3.

### 6.3.5 Craftability Predicate

An item is locally craftable only if all of the following are true:

- item has a defined `recipe`
- item is not blocked by `blueprintLocked`
- item has a defined `craftBench`
- the required bench is available to the planner
- the available bench level is greater than or equal to `stationLevelRequired`

Bench availability source:

- actual cached hideout state, if available and valid
- otherwise fallback assumption: all benches level 3

Items with normalized `craftBench = undefined` are not bench-craftable.

---

## 6.4 Local Planning Algorithm (Greedy, Depth ≤ 2)

### 6.4.1 Planner State

Maintain:

- `avail[itemId]` initialized to `have[itemId]`.
- `recycleEligible[itemId]` initialized to `have[itemId]`.
- Items produced by recycling are NOT eligible for recycling again in the same run.
- `plannedRecycleActions[]`
- `plannedCraftSteps[]`

Planner must also derive a bench-level map:

```ts
type BenchLevels = Record<BenchId, number>
```

Source of `BenchLevels`:

- from cached hideout modules when valid
- otherwise synthesized fallback:
  - `equipment_bench: 3`
  - `explosives_bench: 3`
  - `med_station: 3`
  - `refiner: 3`
  - `utility_bench: 3`
  - `weapon_bench: 3`
  - `workbench: 3`

---

### 6.4.2 Protected From Recycling

An item must never be recycled if:

1. It belongs to `nonRecyclableCategories`.
2. It appears in `requiredFinal`.
3. It is a Level-1 ingredient for any target with `missingFinal > 0`.
4. It is a Level-2 ingredient currently required to craft a Level-1 ingredient for the current target.
5. It has already been reserved or consumed in earlier planning steps.

---

### 6.4.3 CraftQuantity Handling

For any craftable item X:

```
craftQty = craftQuantity[X]
out = ceil(need / craftQty) * craftQty
```

Planner crafts in full craft actions only.

Surplus (`out - need`) is allowed and added to `avail[X]`.

Surplus may be used for later targets.

---

### 6.4.4 Planning Phases per Target

For each target T in planning order (section 5.3), if `missingFinal[T] > 0`:

Let `needT = missingFinal[T]`.

#### Phase A – Direct Craft (Level 1)

If T is locally craftable according to section 6.3.5:

- Compute `outT` via 6.4.3.
- If all direct inputs are available in `avail`, consume them and add `outT` to `avail[T]`.
- Record CraftStep for T.

If not all inputs available, proceed to Phase B.

---

#### Phase B – Recycle Once for Direct Inputs

If direct inputs missing:

- Select recyclable sources S satisfying:
  - `recycleEligible[S] > 0`
  - `S` not protected
  - `recyclesInto[S]` yields missing direct input

Selection comparator (deterministic):

1. Higher total yield towards missing direct inputs.
2. Higher number of distinct missing inputs covered.
3. Lower `S.itemId`.

Recycle minimal units needed to reduce shortages.

- Subtract from `avail[S]` and `recycleEligible[S]`.
- Add yields to `avail`.
- Record RecycleAction.

Return to Phase A.

---

#### Phase C – Indirect Craft (Level 2)

For each missing direct input I of T (sorted by itemId ascending):

If I is locally craftable according to section 6.3.5:

- Compute required output via 6.4.3.
- Attempt to craft I using its direct inputs only (no deeper than Level 2).
- Consume Level-2 inputs from `avail`.
- Add crafted output to `avail[I]`.
- Record CraftStep for I.

Return to Phase A.

---

#### Phase D – Recycle Once for Level-2 Inputs

If Level-2 inputs missing:

- Apply recycling (same rules as Phase B) to obtain required Level-2 inputs.
- Craft I.
- Then craft T.

If still impossible:

- T is not locally reachable.

---

### 6.4.5 Fully Satisfiable Targets

A target T is fully satisfiable if:

- Planner can increase `avail[T]` by at least `needT` under phases A–D.

Crafting UI includes only fully satisfiable targets.

---

### 6.4.6 Cycle Guardrail

If a recipe cycle is encountered within depth-2 traversal:

- Treat cyclic dependency as non-expandable.
- Target becomes not locally reachable via that path.
- Continue deterministically.

---

## 6.5 In-Raid Acquisition Suggestions

After local planning completes:

Determine in-raid acquisition candidates from two independent sources:

1. Direct loot targets:
  - Any item with `missingFinal[itemId] > 0` that remains required as a final target and is not satisfiable through local crafting under planner rules.
  - These items are suggested because the player must bring them home directly from raid.

2. Craft-support materials:
  - Missing direct inputs (Level-1)
  - Missing Level-2 inputs

Suggestion generation rules:

- Include direct loot targets regardless of whether they are crafting-relevant.
- Include craft-support materials only for crafting-relevant items.
- Exclude items in `nonRecyclableCategories` only as recycle-based or salvage-based acquisition candidates, not as direct final-target bring-home suggestions.
- Salvage is in-raid only and may be recommended to save backpack space.

### Suggestion Types

1. **BRING_HOME (final target)**
  - Item is a missing loot-only final target.
  - Quantity relevance is based on `missingFinal[itemId]`.

2. **BRING_HOME (direct material)**
  - ItemId directly in missing needed materials set.

3. **SALVAGE (in-raid)**
  - `salvagesInto` yields missing needed materials.

4. **BRING_HOME (recycle yields)**
  - `recyclesInto` yields missing needed materials.

Deterministic ordering:

1. Missing final targets first.
2. Then craft-support suggestions.
3. Within each group sorted by itemId ascending.

If an item matches multiple suggestion types:

- The item appears only once in the In Raid view.
- The hover detail must explain all applicable reasons.
- If the item is both a missing final target and a craft-support candidate, final-target reason takes precedence for top-level categorization.

---

# 7. USER INTERFACE

The module uses:

- Persistent left sidebar
- Main content area
- Global header row

All UI renders from canonical planner output structures.

---

## 7.1 Global Layout

### 7.1.1 Structure

Left Sidebar Navigation:

- Stash
- Current Loadout
- Lists
- In Raid
- Crafting

Main Content Area: context-dependent.

---

### 7.1.2 Global Header Row

Visible regardless of selected sidebar item.

Displays:

- Active Lists count
- Total Missing Items count
- Total Recycle Actions
- Total Craft Steps
- Last Sync Inventory timestamp
- Last Sync Loadout timestamp

No planner logic executed here; purely derived from PlannerResult and API timestamps.

---

## 7.1.3 Stored Lists Persistence (v1)

Stored user-authored lists are persisted client-side.

Persistence mechanism:

- localStorage

Required properties:

- Deterministic serialization order

Stored schema:

```ts
interface StoredList {
  id: string
  name: string
  isEnabled: boolean
  items: Array<{
    itemId: string
    quantity: number
    isEnabled: boolean
  }>
}
```

Ordering rules:

- Stored lists ordered by UI order (top → bottom).
- List items ordered by UI order (top → bottom).

Generated hideout upgrade lists are not fully persisted.

For generated hideout upgrade lists, only toggle state is persisted:

- list enabled/disabled state
- item enabled/disabled state

Persisted toggle state for generated lists may be discarded when the derived list identity no longer exists.

---

## 7.1.4 Pre-Alpha Persistence and Compatibility Policy

Quartermaster is currently in a pre-alpha state.

Until further notice:

- No data migration is required for persisted client-side structures.
- No backward compatibility is required for older localStorage schemas.
- No backward compatibility is required for intermediate pre-release planner result structures.
- No compatibility guarantees are required for pre-release internal data contracts.
- When structures change, existing local client data may be discarded, overwritten, or reinitialized.
- Simplicity and forward iteration are preferred over migration logic during pre-alpha.

Clarification:

- This policy applies only until a later production/stable phase explicitly changes this requirement in the specification.
- When the application approaches stable release, compatibility and migration requirements will be specified separately.

---

## 7.1.5 Generated Hideout List Toggle Persistence

Generated hideout upgrade lists are not stored as full materialized lists.

Only user toggle state is persisted:

- list enabled/disabled
- item enabled/disabled

Persistence key must uniquely identify:

```text
moduleId + targetLevel + itemId
```

Lifecycle rule:

- If a generated list disappears due to hideout progression, persisted toggle state for that list and its items must be removed.

---

## 7.2 Stash View

Read-only inventory view.

Displays only actual stash items (no synthetic rows).

### 7.2.1 Controls

- Sync Inventory button
- Filters:
  - Search (as-you-type)
  - Category
  - Rarity
  - Show Only Recyclable (based on RecyclePlan)

On rate limits:

- Back off and warn the user.

### 7.2.2 Table

Columns:

| Icon | Item | Quantity | Reserved | Available | Required | Missing | Indicators |

The "Icon" column uses the reusable Item Icon Component defined in section 7.7.

Indicators:

- 🎯 Direct Target
- 🔧 Required for Crafting
- 🔒 Reserved (Project/Hideout)
- 🔄 To Recycle
- ⚠ Missing
- 🚫 Uncraftable

Indicator meaning:

- 🎯 Direct Target means the item itself is a missing final target from at least one active list and should be brought home directly if encountered in raid.
- 🚫 Uncraftable means the item is not locally craftable because of blueprint restriction, missing craft bench, or insufficient bench level.

### 7.2.3 Expand Row

Shows:

- Reservation breakdown
- Recipe
- Recycling sources
- Salvage info
- Used in lists

### 7.2.4 Value Display

Total stash value displayed at top (informational only).

---

## 7.3 Current Loadout View

Displays dynamic API loadout.

### 7.3.1 Layout

Grid emulating in-game layout.

Each slot renders the Item Icon Component defined in section 7.7.

Row 1:
- Augment
- Shield

Row 2:
- Weapon1
- Weapon2

Backpack:
- 4 column grid

Quick Items

Augmented Slots

Safe Pocket

---

### 7.3.2 Advisory Badge

Per item:

- KEEP (Required or Reserved)
- RECYCLE (Only if in RecyclePlan and not required)
- DISCARD (Not required, not recyclable)

Precedence:

KEEP > RECYCLE > DISCARD

Clarification:

- If an item is required for any future craft (final or intermediate), it must be KEEP and must not be marked RECYCLE.

Badges are rendered via the Item Icon Component overlay system (section 7.7).

---

### 7.3.3 Hover Detail

Shows:

- Item info
- Required for
- Produces needed materials
- Reservation reason

---

## 7.4 Lists View

### 7.4.1 Sidebar

- User Lists group
- Hideout Upgrade Lists group
- Enable/Disable toggle
- Status indicator
- Create List button
- Drag-and-drop reorder lists
- Sync Hideouts button

Generated hideout upgrade lists must appear only when hideout cache exists.

Ordering rules for generated hideout upgrade lists:

1. All `(Next)` lists
2. Remaining future levels
3. Bench name ascending
4. Target level ascending

If no cached hideout state exists, the Hideout Upgrade Lists group shows no generated lists and displays a hint prompting the user to use **Sync Hideouts**.

---

### 7.4.2 Editor

Top:

```
Add Item [autocomplete as-you-type input]
```

Behavior for user-authored lists:

- Typing filters instantly.
- Enter adds item.
- Default quantity = 1.
- If already exists -> increase quantity.

Items are rendered strictly in manual order.

Each list item row renders the Item Icon Component defined in section 7.7.

Per item controls for user-authored lists:

- Quantity
- Enable/Disable
- Remove
- Drag-and-drop reorder

For generated hideout upgrade lists, allowed actions are:

- Enable/Disable list
- Enable/Disable individual item rows

For generated hideout upgrade lists, disallowed actions are:

- Rename list
- Add item
- Remove item
- Change quantity
- Drag-and-drop reorder
- Manual list reordering

---

## 7.5 In Raid View

### 7.5.1 Loot Grid

Alphabetical by itemId within each suggestion group.

The In Raid view must display both:

- missing loot-only final targets that should be brought home directly, and
- items relevant to missing crafting materials via direct use, salvage, or recycling.

Each grid cell renders the Item Icon Component defined in section 7.7.

Icon + rarity border.

Badge:

- CAN SALVAGE
- BRING HOME

Badge meaning:

- BRING HOME may mean either:
  - this item is itself a missing final target, or
  - this item contributes to missing crafting requirements.

Item name is always shown below the icon, even in this grid view.

Quantity is always displayed, even if it is "1".

Optional small count: number of impacted targets.

---

### 7.5.2 Hover Detail

Displays:

- Missing as final target for active list(s), including list name(s)
- Required quantity vs stash quantity vs missing quantity
- Required for (final list items)
- Produces needed materials for (final list items)
- Recycling vs salvage comparison

If an item is itself a missing final target, the hover detail must show the contributing list names from section 6.1.2 provenance, for example a list such as "Bench X progression".

If an item matches multiple reasons for inclusion in the In Raid view, the hover detail must explain all applicable reasons deterministically.

---

## 7.6 Crafting View

### 7.6.1 Controls

- Sync Inventory button

On rate limits:

- Back off and warn the user.

---

### 7.6.2 Section 1: Recycle First

List of RecyclePlan actions.

Columns:

| Item | Qty to Recycle | Yields |

The "Item" column uses the Item Icon Component defined in section 7.7.

---

### 7.6.3 Section 2: Craft Plan

Grouped by BenchId.

Bench order:

1. refiner
2. equipment_bench
3. explosives_bench
4. med_station
5. utility_bench
6. weapon_bench
7. workbench

Within each bench: sorted by itemId.

Columns:

| Item | Craft Times | Total Output | Inputs Needed | Inputs Missing |

The "Item" column uses the Item Icon Component defined in section 7.7.

Definitions:

- Total Output = `CraftStep.qty`
- Craft Times = `CraftStep.qty / craftQuantity[itemId]` (integer)

Craft plan must include only items that are:

- fully satisfiable
- locally craftable under current bench-level rules or fallback mode

---

### 7.6.4 Iterative Workflow

After performing recycle or craft in game:

User must press Sync Inventory to refresh state.

Craft view recalculates dynamically.

---

## 7.7 Item Icon Component (Reusable)

### 7.7.1 Purpose

A single canonical component for displaying items consistently across the module.

All views that display items must use this component.

---

### 7.7.2 Visual Structure

- Container: square box.
- `border-radius: 4px`.
- Border: 1px solid.
- Border color depends on rarity.
- Background image depends on rarity.
- Inside container: item image centered and contained.
- Below container: item name label (always visible).
- Quantity overlay is always visible, even if quantity is `1`.

Icon size variants:

- Small: 60px × 60px
- Medium (default): 84px × 84px
- Large: 108px × 108px

Overlay styling:

- Quantity overlay: positioned bottom-right, font-size 13px, padding 3px 6px.
- Badge overlays: positioned top-left, font-size 11px, padding 3px 6px.
- Image padding inside container: 6px.

---

### 7.7.3 Rarity Styling

Mapping from `PlannerItem.rarity` to CSS classes:

- `Common` -> `.rarity-common`
- `Uncommon` -> `.rarity-uncommon`
- `Rare` -> `.rarity-rare`
- `Epic` -> `.rarity-epic`
- `Legendary` -> `.rarity-legendary`

SCSS definition:

```scss
&.rarity-common {
  border-color: #9e9e9e;
  background-image: url('/images/rarities/common_bg.png');
}
&.rarity-uncommon {
  border-color: #4caf50;
  background-image: url('/images/rarities/uncommon_bg.png');
}
&.rarity-rare {
  border-color: #2196f3;
  background-image: url('/images/rarities/rare_bg.png');
}
&.rarity-epic {
  border-color: #9c27b0;
  background-image: url('/images/rarities/epic_bg.png');
}
&.rarity-legendary {
  border-color: #ff9800;
  background-image: url('/images/rarities/legendary_bg.png');
}
```

---

### 7.7.4 Overlays

The component supports:

- Quantity overlay (numeric label).
- Additional informational badges.

Quantity overlay:

- Always visible.
- Displays integer quantity.
- Position is fixed and consistent across all usages.

Badges:

- Rendered as small overlay elements within the icon container.
- Used for KEEP / RECYCLE / DISCARD / Missing / Uncraftable / Direct Target indicators.
- Badge precedence:
  - KEEP > RECYCLE > DISCARD
  - Missing and Uncraftable indicators are always shown in addition to advisory badge when applicable.
  - Direct Target indicator is always shown when applicable and must not be hidden by advisory badge.
- Badge rendering order must be deterministic.

---

### 7.7.5 Data Contract

```ts
interface ItemIconProps {
  itemId: string
  name: string
  icon: string
  rarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary"

  quantity: number

  badges?: Array<{
    key: string
    label?: string
    icon?: string
    priority: number
  }>
}
```

Rules:

- `quantity` is required and must be rendered even if `1`.
- `badges` must be sorted deterministically by `priority` ascending before rendering.

---

# 8. ASSUMPTIONS

- Import deterministic.
- Items with source `craftBench = "in_raid"` remain in the dataset after normalization.
- No imported item retains `craftBench = "in_raid"` after normalization.
- Salvage advisory only (in-raid).
- Buying excluded v1.
- Recycling single hop only.
- No recycle chaining.
- Craft depth limited to 2.
- API calls proxied via shared arctrackerApi service.
- Authentication handled by shared AuthContext.
- No cycles expected; guardrail exists.
- Missing final targets may be either craftable targets or loot-only final targets.
- Pre-alpha phase: backward compatibility and migration of persisted local data are intentionally out of scope until production/stable requirements are introduced.
- Actual hideout bench levels are used for craftability when hideout cache is available and valid.
- Planner falls back to assuming all benches level 3 if hideout state is unavailable or invalid.
- Generated hideout upgrade lists are derived dynamically from imported hideout definitions and cached hideout API state.
- Generated hideout upgrade lists include only direct requirements for the specific target level, not cumulative requirements.
- The `stash` hideout module is excluded from generated upgrade lists.
- Persisted toggle state for obsolete generated lists may be removed automatically after hideout sync.
- Generated hideout upgrade lists require valid hideout cache and are not synthesized from fallback bench assumptions.

---

# 9. OPEN QUESTIONS

None.

---

# 10. FUTURE FEATURES

## 10.1 Buying from Traders

Advisory-only.

## 10.2 Additional Reservation Layers

Future expansion possible.

## 10.3 Additional Enhancements

- Advanced visualization.
- Performance improvements.
- Optional stash optimization.

---

# 11. EXPLICIT NON-GOALS

- No automated execution.
- No server-side planner.
- No economic optimization.
- No deep crafting trees beyond depth 2.
- No recycle chaining.
- No backward compatibility guarantees for pre-alpha client-side data structures or persisted local state.
- No migration framework for pre-alpha schema changes.

---

# 12. TESTING & VALIDATION

Tests must verify:

- Deterministic greedy planning.
- Depth limit respected.
- No recycle chaining.
- CraftQuantity oversupply behavior.
- Loadout categories excluded from recycling and from recycle-based or salvage-based loot suggestions.
- Missing final targets that are not locally craftable appear in the In Raid view as direct bring-home targets.
- Items with source `craftBench = "in_raid"` are included in the imported dataset with normalized `craftBench = undefined`.
- Stash items present in API/cache and in the imported dataset are rendered correctly, including basic components such as Metal Parts and ARC Powercell.
- Salvage suggestions appear only as in-raid hint.
- Value-based ordering deterministic.
- Unknown API itemIds ignored.
- Blueprint/bench restrictions enforced at list level.
- List provenance for direct final targets is preserved and surfaced in hover detail.
- Hideout definitions are imported deterministically.
- `stash.json` is excluded from generated hideout lists.
- One generated hideout list exists for each not-yet-reached target level.
- Generated list naming marks the next target level correctly.
- Generated list items contain only the requirements for that exact level.
- Generated hideout lists participate in planner aggregation like manual lists.
- List-level and item-level toggles for generated lists persist correctly.
- Obsolete toggle state is removed when generated lists disappear after hideout sync.
- No generated hideout lists are shown when no cached hideout state exists.
- Lists view shows a hint to use Sync Hideouts when hideout cache is absent.
- Generated list ordering is deterministic.
- Item is craftable when bench level meets `stationLevelRequired`.
- Item is not craftable when bench level is below `stationLevelRequired`.
- Intermediate ingredient blocked by insufficient bench level prevents final target from being locally reachable.
- Fallback mode with missing hideout cache assumes all benches at level 3 for craftability checks.
- Malformed or invalid hideout cache also triggers fallback mode for craftability checks.
- Generated hideout lists still use actual hideout data and do not rely on fallback mode.

Canonical scenarios:

1. Direct craft only.
2. Direct craft + recycle.
3. Indirect craft (depth 2).
4. Indirect craft + recycle.
5. Depth limit prevents deeper craft.
6. CraftQuantity oversupply.
7. No recycle chaining.
8. Exclusion of nonRecyclableCategories from recycle-based and salvage-based loot suggestions.
9. Deterministic target ordering by list order, item order, value, then itemId.
10. Missing loot-only final target appears in In Raid with contributing list names.
11. Source item with `craftBench = "in_raid"` is preserved in dataset and appears in stash when present in API/cache.
12. Current hideout level 1 generates target level 2 as `(Next)` and higher levels as future generated lists.
13. After hideout sync from level 1 to level 2, old level-2 generated list disappears, level 3 becomes `(Next)`, and obsolete toggle state is removed.
14. Disabling one generated hideout item excludes it from `requiredFinal`.
15. Enabling multiple generated hideout levels accumulates their requirements normally.
16. Craft blocked by insufficient bench level while valid hideout cache exists.
17. Craft allowed under fallback mode when hideout cache is unavailable and assumed bench level 3 applies.