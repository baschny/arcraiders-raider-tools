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
- Expand crafting dependencies recursively.
- Detect and handle craft cycles deterministically.
- Maintain a prioritized reservation system with traceable reasons.
- Reserve required materials before recycling.
- Suggest lootable items.
- Provide workbench-grouped crafting instructions.
- Operate deterministically.

---

## 1.3 System Philosophy

- No server-side optimization.
- No economic value optimization.
- No rarity protection rules.
- No destructive automation.
- No in-app execution of actions.
- Advisory-only behavior.
- Deterministic results for identical inputs.

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

Future API support may provide per-bench unlocked levels.

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

---

## 5.2 Value Is Irrelevant

No value optimization.

Value only informational (Stash view only).

---

## 5.3 Strategy Priority (v1)

1. Use stash
2. Craft
3. Recycle
4. Loot

Buying excluded from v1.

---

# 6. CORE PLANNER LOGIC

This chapter defines all deterministic computation rules used to derive the canonical planner result.

All algorithms must be deterministic and independent of object iteration order.

ItemIds are ASCII and all ascending comparisons are ASCII lexicographic ascending.

Maximum recipe expansion depth is 6.

---

## 6.1 Aggregation of Loadouts

### 6.1.1 Loadout Selection

Only loadouts marked as enabled are considered.

Within each loadout, only items marked as enabled are considered.

---

### 6.1.2 Required Aggregation

For each itemId:

```
required[itemId] = sum(quantity across all active + enabled loadout items)
```

Ordering:

- Deterministic by itemId ascending.

Clarification (v1 batching constraint):

- Loadouts must only request quantities that are valid multiples of `craftQuantity` for the relevant items.
- Therefore, the planner does not need to ceil or normalize fractional requested quantities.
- This batching constraint currently applies only to Ammunition items that have `craftQuantity > 1` and these are end products in loadouts (not used as further crafting ingredients).

---

## 6.2 Craft Expansion

Craft expansion operates exclusively on the `recipe` graph.

`recyclesInto` and `salvagesInto` are not part of recursive expansion.

For any craftable item `X`, `craftQuantity[X]` defines the output units per craft action.

Planner must never plan fractional craft actions.

Maximum recipe expansion depth is 6.

---

### 6.2.1 Recursive Expansion Rules

- Traverse dependencies depth-first.
- Sort dependencies by itemId ascending before expansion.
- Deterministic traversal.

Stop expansion when:

- `recipe` undefined
- `recipe` empty
- `craftBench` undefined
- Item marked uncraftable
- Cycle detected
- Depth limit reached

---

### 6.2.2 Cycle Detection

#### 6.2.2.1 Scope

Applies only to `recipe` graph.

#### 6.2.2.2 State

Maintain:

- `visiting` set
- `stack` array

If expanding item X and encountering Y already in `visiting`:

Cycle detected.

---

#### 6.2.2.3 Handling

- Cut the edge that closes the cycle.
- Do not expand that dependency.
- Mark affected item as:

```
Uncraftable (Cycle)
```

Continue other branches.

---

#### 6.2.2.4 Diagnostics

Store deterministic path:

```
A -> B -> C -> A
```

Traversal order determines path.

---

## 6.3 Uncraftable State

Triggers:

- Blueprint locked
- Bench level insufficient
- Craft cycle detected

Behavior:

- Included in required aggregation
- Included in deficit
- Not expanded
- Marked in output structure
- Tooltip reason:
    - "Uncraftable (Blueprint or Bench restriction)"
    - "Uncraftable (Cycle)"

---

## 6.4 Reservation System

Reservation ensures correct locking of materials before recycling.

---

### 6.4.1 Reservation Priority Tiers

Tier order (highest first):

1. Project / Expedition / Tasks (future)
2. Hideout Upgrades (future)
3. Crafting for active loadouts

Within each tier, deterministic ordering:

1. reasonType
2. referenceId ascending
3. itemId ascending

---

### 6.4.2 Reservation Structure

For each itemId:

```
reservation[itemId] = {
  total: number,
  reasons: [
    {
      reasonType,
      referenceId,
      requestedQty,
      allocatedQty,
      shortfall
    }
  ]
}
```

---

### 6.4.3 Allocation Algorithm

For each itemId:

```
have = stash[itemId]
remaining = have

for reason in reasonsSortedByPriority:
  allocated = min(reason.requestedQty, remaining)
  reason.allocatedQty = allocated
  reason.shortfall = reason.requestedQty - allocated
  remaining -= allocated

reservedTotal = sum(reason.allocatedQty)
availableForRecycle = have - reservedTotal
availableForCrafting = have - sum(allocatedQty of higher tiers)
```

Properties:

- Higher tiers lock inventory first.
- Craft tier only uses remaining inventory.
- Deterministic allocation.

---

### 6.4.4 Reservation Visualization Fields

Per item:

- have
- reserved
- available
- required
- missing

---

### 6.4.5 Current (v1) Reservation Reason Generation

In v1, only the "craft" tier is actively populated.

For v1:

- reasonType is always: `craft`
- referenceId must be derived deterministically from the loadout and target item.

Generation rules:

1. For each enabled loadout L:
    - Define `loadoutRef = "loadout:" + L.id`
2. For each enabled item entry E inside loadout L:
    - If E.itemId is known and included in `required`:
        - Create a reservation reason for that itemId with:
            - reasonType = "craft"
            - referenceId = loadoutRef + ":" + E.itemId
            - requestedQty = E.quantity
3. Reservation reasons for intermediate crafting ingredients are not created explicitly.
4. Future tiers remain empty in v1.

---

## 6.5 Recycling Phase

Recycling reduces deficits after stash usage and craft expansion.

Salvage never affects planner totals.

Surplus materials created by recycling are ignored in v1 beyond deficit reduction and are not optimized further.

---

### 6.5.1 Recycling Eligibility

An item may be recycled only if:

- Category not in nonRecyclableCategories.
- availableForRecycle > 0.
- recyclesInto defined.
- Recycling reduces at least one positive deficit.
- Item is NOT required for:
    - Final loadout
    - Intermediate craft
    - Higher reservation tiers

KEEP precedence over RECYCLE.

Definition: "Intermediate craft"

An itemId is considered required for intermediate craft if and only if:

- It appears as an ingredient key in the expanded recipe requirements graph for any required final loadout item (post cycle-cutting and within depth limit), where the required final loadout item is missing after stash usage, regardless of whether the intermediate itself is currently missing.

---

### 6.5.2 Recycling Algorithm (Deterministic)

Step-by-step:

Build candidate list:

For each `srcItemId` in lexicographic ascending order:

- If `availableForRecycle[srcItemId] <= 0` -> skip
- If `recyclesInto` undefined -> skip

Compute:

```
usefulMaterials = {
  m | deficit[m] > 0 AND recyclesInto[srcItemId][m] > 0
}
```

If `usefulMaterials` is empty -> exclude candidate.

Score each candidate based on current deficits (per 1 recycled unit):

```
coverageCount = |usefulMaterials|

effectiveYield =
  sum over m in usefulMaterials of
    min(deficit[m], recyclesInto[srcItemId][m])
```

Choose the best candidate deterministically using this comparator:

1. Higher `effectiveYield`
2. Higher `coverageCount`
3. Lower `srcItemId`

Recycle greedily:

Let:

```
maxUnits = availableForRecycle[srcItemId]
```

Determine:

```
unitsNeeded =
  min(
    maxUnits,
    max over m in usefulMaterials of
      ceil(deficit[m] / recyclesInto[srcItemId][m])
  )
```

Apply recycling unit-by-unit up to `unitsNeeded`.

Record action and repeat until no candidates remain.

---

## 6.6 Deficit Calculation

After stash usage, craft expansion, reservation, recycling:

```
deficit[itemId] = max(0, required[itemId] - usableQuantity[itemId])
```

usableQuantity (v1):

```
usableQuantity[itemId] = have[itemId]
```

Reservation affects recycling eligibility but not deficit computation in v1.

Future compatibility rules remain unchanged.

---

## 6.7 Loot Suggestions

Include item if:

- Missing directly
- RecyclesInto yields missing material
- Recipe produces missing material
- SalvagesInto yields missing material

Sorted by itemId ascending.

Clarification remains unchanged.

---

## 6.8 Canonical Output Structures

(UNCHANGED — all interfaces preserved exactly as previously defined.)

All structures remain identical to previous specification, including:

- PlanRow
- ReservationBreakdown
- CraftPlan
- RecyclePlan
- LootSuggestion
- BlockerSummary
- PlannerResult

Definitions, ordering rules, and determinism constraints remain unchanged.

---

## 6.9 Craft Bench Ordering

Canonical bench order:

1. refiner
2. equipment_bench
3. explosives_bench
4. med_station
5. utility_bench
6. weapon_bench
7. workbench

---

# 7. USER INTERFACE

All UI renders from canonical planner output structures.

Authentication gating applies to all views requiring stash or loadout data.

If not authenticated:

- Display login prompt linking to `/settings/profile`.

If authenticated but no cached data:

- Display empty state with Sync button.

Global header timestamps:

- Inventory timestamp from `CachedStash.syncedAt`
- Loadout timestamp from `CachedLoadout.syncedAt`

---

## 7.1 Global Layout

(Unchanged layout rules.)

---

## 7.1.3 Stored Loadouts Persistence (v1)

Stored loadouts are persisted client-side.

Persistence mechanism:

- localStorage

Authentication token storage is managed by shared AuthContext and not by Quartermaster.

Loadout storage rules remain unchanged.

---

## 7.2 Stash View

Sync Inventory button:

- Calls `syncStashAllPages()`.

Error handling:

- Handle `ApiError` per section 4.2.3.

All other rules unchanged.

---

## 7.3 Current Loadout View

Sync Loadout button:

- Calls `syncLoadout()`.

All other rules unchanged.

---

## 7.4 Loadouts View

(Unchanged.)

---

## 7.5 In Raid View

(Unchanged.)

---

## 7.6 Crafting View

Sync Inventory button:

- Calls `syncStashAllPages()`.

All error handling per section 4.2.3.

All planning logic unchanged.

---

## 7.7 Item Icon Component (Reusable)

(Unchanged.)

---

# 8. ASSUMPTIONS

- Import deterministic.
- No in_raid craftBench remains.
- Salvage advisory only.
- Buying excluded v1.
- Reservation tiers strict priority.
- KEEP precedence over RECYCLE.
- API calls proxied via shared arctrackerApi service.
- Authentication handled by shared AuthContext.

---

# 9. OPEN QUESTIONS

None.

---

# 10. FUTURE FEATURES

(Unchanged.)

---

# 11. EXPLICIT NON-GOALS

(Unchanged.)

---

# 12. TESTING & VALIDATION

All previous testing rules remain unchanged.

Additional API-related requirements:

- Mock arctrackerApi service in tests.
- Do not call real network.
- Ensure planner determinism independent of sync timing.
- Verify unknown API itemIds are ignored.
- Verify 401 triggers auth reset behavior.

All other canonical test scenarios remain unchanged.
```
