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
- Static loadout planning
- Loot suggestion guidance
- Craft execution planning

The system must:

- Aggregate multiple loadouts.
- Compute global material requirements.
- Provide deterministic and meaningful crafting and recycling suggestions.
- Limit crafting depth to practical real-world gameplay expectations.
- Avoid unnecessary or confusing steps.
- Reserve required materials before recycling.
- Suggest lootable crafting materials relevant to active loadouts.
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
- Practical, real-world planning model aligned with how players actually craft and recycle in-game.
- Crafting depth limited to at most two levels.
- Recycling limited to a single transformation hop (no chaining).

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
- No item has `craftBench = "in_raid"` inside the planner dataset.
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

the item must be excluded from import.

After import, no item represents in-raid-only crafting.

---

## 3.2 craftBench Normalization

Source data may contain:

- A single string
- An array

Normalization algorithm:

1. If string:
    - If `"in_raid"` -> exclude.
    - Otherwise keep.

2. If array:
    - Remove `"workbench"`.
    - Remove `"in_raid"`.
    - Preserve original order.
    - If one remains -> use it.
    - If multiple remain -> use first.
    - If none remain -> exclude.

After normalization, `craftBench` is always a single BenchId.

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

The CLI must generate the aggregated dataset file:

```
public/data/quartermaster/items.json
```

The CLI must be run locally before committing.

The generated file must be committed to git.

### 3.5.2 package.json Integration

The CLI must be integrated following existing Raider Tools conventions, similar to:

```
"generate:items-loot-helper": "./scripts/generate-item-data-loot-helper.sh",
```

Quartermaster must define an analogous script, for example:

```
"generate:items-quartermaster": "./scripts/generate-item-data-quartermaster.sh",
```

The shell script may invoke a Node.js script responsible for the import and normalization logic.

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

- Aggregate by `itemId`.
- Ignore durability.
- Ignore slotIndex for planning purposes.
- Use slot arrays inside `CachedLoadout.loadout`.
- Unknown `itemId` must be ignored.

Timestamp for header:

- Use `CachedLoadout.syncedAt`.

### 4.3.3 Error Handling

Same rules as section 4.2.3.

---

## 4.4 Hideout Bench Levels (v1)

The hideout endpoint is available through shared API but bench levels are not yet exposed.

For v1:

- Assume all benches are level 3.
- `stationLevelRequired` refers to hideout bench levels.
- Bench restriction logic remains in planner but assumes level 3.
- Loadout editor must prevent adding items that are not craftable due to blueprint or bench restrictions.
- If such an item exists in a loadout, it is excluded from planning calculations and marked with a warning in the UI.

Future API support may provide per-bench unlocked levels.

---

# 5. HARD STRATEGY CONSTRAINTS

---

## 5.1 Recycling Restrictions

Non-recyclable categories (loadout categories):

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

- Loadout category items are excluded from loot suggestions.
- Loadout category items are never recycled by the planner.

---

## 5.2 Value Is Irrelevant

No economic optimization is performed.

Value is not used to maximize profit, minimize cost, or choose between economically equivalent strategies.

However, `value` MAY be used solely as a deterministic priority heuristic to decide which missing final targets are planned first.

Missing `value` is treated as `0` for ordering.

---

## 5.3 Strategy Priority (v1)

Planning order for missing final targets:

1. Sort by `value` descending.
2. If equal, sort by `itemId` ascending (ASCII).

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

## 6.1 Aggregation of Loadouts

### 6.1.1 Loadout Selection

Only loadouts marked as enabled are considered.

Within each loadout, only items marked as enabled are considered.

Loadouts are always aggregated globally.

All active loadouts are added together, and the stash must contain all required items from all active loadouts.

---

### 6.1.2 Required Aggregation

For each itemId:

```
requiredFinal[itemId] = sum(quantity across all active + enabled loadout items)
```

Ordering:

- Deterministic by itemId ascending for aggregation.
- Planning order determined later by section 5.3.

If an item cannot be crafted due to blueprint or bench restriction:

- It must not be allowed in the loadout editor.
- If present due to inconsistent state, it is excluded from `requiredFinal` and marked with a warning.

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

- `item.category` is not in loadout categories, AND
- (`item.id` in `recipeRelevantSet` OR
  item.recyclesInto yields any material in `recipeRelevantSet`)

Salvage is not considered for crafting-relevance.

---

## 6.4 Local Planning Algorithm (Greedy, Depth ≤ 2)

### 6.4.1 Planner State

Maintain:

- `avail[itemId]` initialized to `have[itemId]`.
- `recycleEligible[itemId]` initialized to `have[itemId]`.
- Items produced by recycling are NOT eligible for recycling again in the same run.
- `plannedRecycleActions[]`
- `plannedCraftSteps[]`

---

### 6.4.2 Protected From Recycling

An item must never be recycled if:

1. It belongs to loadout categories.
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

If T is craftable:

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

If I is craftable:

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

## 6.5 Loot Suggestions (Crafting Materials Only)

After local planning completes:

Determine missing needed materials:

- Missing direct inputs (Level-1)
- Missing Level-2 inputs

Generate suggestions only for crafting-relevant items.

Exclude all loadout category items.

### Suggestion Types

1. **BRING_HOME (direct material)**
    - ItemId directly in missing needed materials set.

2. **SALVAGE (in-raid)**
    - `salvagesInto` yields missing needed materials.

3. **BRING_HOME (recycle yields)**
    - `recyclesInto` yields missing needed materials.

Salvage is in-raid only and may be recommended to save backpack space.

Deterministic ordering:

- Sorted by itemId ascending.

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
- Loadouts
- In Raid
- Crafting

Main Content Area: context-dependent.

---

### 7.1.2 Global Header Row

Displays:

- Active Loadouts count
- Total Missing Items count
- Total Recycle Actions
- Total Craft Steps
- Last Sync Inventory timestamp
- Last Sync Loadout timestamp

---

### 7.1.3 Stored Loadouts Persistence (v1)

Stored loadouts persisted in localStorage.

Schema:

```ts
interface StoredLoadout {
  schemaVersion: number
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

Ordering:

- Loadouts sorted by `name` ascending.
- Loadout items stored in insertion order.

---

## 7.2 Stash View

Read-only inventory view.

Sync Inventory button calls `syncStashAllPages()`.

Displays only actual stash items.

Columns:

| Icon | Item | Quantity | Required | Missing | Indicators |

Indicators:

- HAVE
- CAN_CRAFT
- MISSING

---

## 7.3 Current Loadout View

Displays dynamic API loadout.

Per item badges:

- HAVE (stash sufficient)
- CAN_CRAFT (locally reachable)
- MISSING (not locally reachable)

Precedence:

HAVE > CAN_CRAFT > MISSING

---

## 7.4 Loadouts View

Editor prevents adding items that are not craftable due to blueprint or bench restriction.

Items grouped by category.

Quantity rules:

- For craftable items: step size = craftQuantity.
- For non-craftable items: step size = 1.

---

## 7.5 In Raid View

Loot suggestions grid:

- Only crafting-relevant items.
- Excludes loadout category items.

Badges:

- SALVAGE
- BRING_HOME

Item name and quantity always visible.

---

## 7.6 Crafting View

Section 1: Recycle First

Displays aggregated RecyclePlan.

Section 2: Craft Plan

Grouped by BenchId in canonical order.

Displays only fully satisfiable targets.

---

## 7.7 Item Icon Component (Reusable)

Unchanged component definition.

---

# 8. ASSUMPTIONS

- Import deterministic.
- No in_raid craftBench remains.
- Salvage advisory only (in-raid).
- Buying excluded v1.
- Recycling single hop only.
- No recycle chaining.
- Craft depth limited to 2.
- API calls proxied via shared arctrackerApi service.
- Authentication handled by shared AuthContext.
- No cycles expected; guardrail exists.

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

---

# 12. TESTING & VALIDATION

Tests must verify:

- Deterministic greedy planning.
- Depth limit respected.
- No recycle chaining.
- CraftQuantity oversupply behavior.
- Loadout categories excluded from recycling and loot suggestions.
- Salvage suggestions appear only as in-raid hint.
- Value-based ordering deterministic.
- Unknown API itemIds ignored.
- Blueprint/bench restrictions enforced at loadout level.

Canonical scenarios:

1. Direct craft only.
2. Direct craft + recycle.
3. Indirect craft (depth 2).
4. Indirect craft + recycle.
5. Depth limit prevents deeper craft.
6. CraftQuantity oversupply.
7. No recycle chaining.
8. Exclusion of loadout categories from loot suggestions.
9. Deterministic target ordering by value then itemId.
