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

---

## 1.2 Purpose

The purpose of this module is to support the full gameplay lifecycle of ARC Raiders through four distinct phases:

1. Planning Loadouts
2. In-Raid Loot Guidance
3. Post-Raid Evaluation (Back Home)
4. Crafting Execution

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

Curated JSON files derived from the arctracker GitHub source.

Approximately 500 items before import filtering.

Raw source data is not used directly by the application.  
It is first processed by the import pipeline defined in section 3.

All static data is loaded at application startup and stored in memory.

Pre-import fixture location (source-format files):

```
docs/sample/items/*.json
```

Each file contains a single item in source format, including multilingual fields and metadata.

The importer must cope with this schema and iterate over all files at this location.

---

## 2.1.2 Final Item Schema (Post-Import)

After import normalization, each item inside the application has the following schema:

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

    // Original source classification (preserved)
    type: string

    // Normalized planner fields
    category: string
    subCategory?: string

    craftBench?: BenchId
    stationLevelRequired: 1 | 2 | 3
    blueprintLocked: boolean

    recipe?: Record<string, number>
    recyclesInto?: Record<string, number>
    salvagesInto?: Record<string, number>

    stackSize: number
    value?: number
    weight?: number
    foundIn?: string[]
}
```

Items excluded during import (see section 3) do not exist in this dataset.

---

## 2.1.3 Default Assumptions

After import:

- `stackSize` is always defined.
- `stationLevelRequired` is always defined.
- `blueprintLocked` is always defined.
- `craftBench` is either:
    - a single valid BenchId, or
    - undefined (non-craftable item).
- No item has `craftBench = "in_raid"` inside the planner dataset.

---

# 3. ITEM IMPORT & NORMALIZATION PROCESS

The import process is an external preprocessing step that converts raw source JSON files into the final PlannerItem dataset.

The application assumes this process has already been executed.

This process must be deterministic.

---

## 3.1 Import Filtering Rules

### 3.1.1 Excluded by Type

Items with original `type`:

- Blueprint
- Outfit
- Backpack Charm

are excluded from import.

They do not exist inside the planner.

---

### 3.1.2 In-Raid Only Crafting

If an item has:

```
craftBench = "in_raid"
```

and no additional craftBench values,

the item must be excluded from import.

Rationale:
- These items can only be crafted inside a raid.
- The planner supports hideout crafting only.
- After import, no item in the planner dataset represents in-raid-only crafting.

---

## 3.2 craftBench Normalization

Source data may contain:

- A single string value
- An array of values

Examples:

```
"craftBench": "equipment_bench"
"craftBench": ["equipment_bench", "workbench"]
"craftBench": ["workbench", "med_station", "in_raid"]
```

### 3.2.1 Normalization Algorithm

1. If `craftBench` is a single string:
    - If value = `"in_raid"`:
        - Exclude item (see 3.1.2).
    - Otherwise:
        - Keep as-is.

2. If `craftBench` is an array:
    - Remove `"workbench"` from the array.
    - Remove `"in_raid"` from the array.
    - Preserve original array order.
    - After removal:
        - If exactly one bench remains:
            - Use that bench.
        - If multiple benches remain:
            - Use the first remaining bench (deterministic).
        - If no benches remain:
            - Exclude the item.

Result:
- Inside the planner dataset, `craftBench` is always a single BenchId.
- `"in_raid"` never appears in the planner dataset.

---

## 3.3 Category & SubCategory Mapping

The original `type` field is preserved unchanged.

During import, derive:

- `category`
- `subCategory`

### 3.3.1 Weapon Mapping

If:

```
isWeapon === true
```

Then:

```
category = "Weapon"
subCategory = original type
```

---

### 3.3.2 Quick Use Mapping

If:

```
type === "Quick Use"
```

Then:

```
category = "Quick Use"
```

SubCategory depends on normalized craftBench:

- explosives_bench  => "Explosive"
- med_station       => "Medicinal"
- utility_bench     => "Utility"

If no mapping applies, subCategory remains undefined.

---

### 3.3.3 Direct Mapping

For all other items:

```
category = type
subCategory = undefined
```

---

## 3.4 Default Field Completion

During import:

- If `stackSize` missing -> set to `1`
- If `stationLevelRequired` missing -> set to `1`
- If `blueprintLocked` missing -> set to `false`

After import, all fields are explicitly defined.

---

# 4. DYNAMIC API ENDPOINTS

---

## 4.1 Stash Endpoint

### Endpoint

```
GET /api/v2/user/stash
```

### Normalization Rules

- Aggregate by `itemId`.
- Ignore `slotIndex`.
- Store total quantities per item.
- Persist locally with timestamp.
- Fetch all pages until empty or fewer than `per_page` results.

If an `itemId` does not exist in the static dataset:

Display:

```
Unknown Item (itemId)
```

Exclude from:

- Craft logic
- Recycling logic
- Loot suggestion logic
- Reservation logic

Trigger:

**Sync Inventory**

---

## 4.2 Hideout Endpoint

### Endpoint

```
GET /api/v2/user/hideout
```

Fallback:

Assume all benches level 3.

If bench level insufficient:

- Mark item as Uncraftable.
- Do not expand recursively.

---

## 4.3 Backpack / Loadout Endpoint

### Endpoint

```
GET /api/v2/user/loadout
```

Normalization:

- Aggregate by itemId.
- Ignore slotIndex.
- Ignore durabilityPercent.

Unknown items:

Display as:

```
Unknown Item (itemId)
```

Excluded from planner logic.

Trigger:

**Sync Loadout**

---

# 5. HARD STRATEGY CONSTRAINTS

---

## 5.1 Recycling Restrictions

### 5.1.1 Non-Recyclable Categories

- Weapon
- Ammunition
- Augment
- Modification
- Quick Use
- Shield

Rule:

```
if item.category in loadoutCategories:
    item cannot be recycled
```

---

## 5.2 Value Is Irrelevant

- No value optimization.
- No ranking by sell price.

---

## 5.3 Strategy Priority (v1)

1. Use stash
2. Craft (recursive)
3. Recycle
4. Loot (fallback)

Buying from traders is intentionally excluded from v1 due to limited availability, daily purchase limits, and lack of API state.

---

# 6. CORE PLANNER LOGIC

---

## 6.1 Aggregation of Loadouts

```
required[itemId] = sum of quantities across all active loadout items
```

Deterministic ordering by itemId.

---

## 6.2 Craft Expansion

### 6.2.1 Recursive Expansion

- Expand recipe graph only.
- Dependencies sorted ascending by itemId.
- Deterministic traversal.

---

### 6.2.2 Cycle Detection

#### 6.2.2.1 Scope

- Applies only to `recipe` graph.
- `recyclesInto` and `salvagesInto` excluded.

#### 6.2.2.2 Algorithm

Maintain:

- `visiting` set
- `stack` list

If expanding `X` and encountering `Y` in `visiting`:

Cycle detected.

#### 6.2.2.3 Handling

- Always cut the edge that closes the cycle.
- Do not expand that dependency.
- Mark item as:

```
Uncraftable (Cycle)
```

- Continue other branches.

#### 6.2.2.4 Diagnostics

Store:

```
A -> B -> C -> A
```

Deterministic path based on traversal order.

---

## 6.3 Uncraftable State

Triggers:

- Blueprint locked
- Bench level insufficient
- Craft cycle detected

Behavior:

- Still selectable
- Included in deficit
- Not expanded
- Warning icon
- Tooltip variant:
    - "Uncraftable (Blueprint or Bench restriction)"
    - "Uncraftable (Cycle)"

---

## 6.4 Reservation System

### 6.4.1 Reservation Reason Types and Priority

Reservation reasons are grouped into priority tiers:

1. Project / Expedition / Tasks (future) — highest priority
2. Hideout upgrades (future)
3. Crafting for active loadouts (current feature) — lowest priority

Reservation allocation is processed in strict priority order.

Within each tier, reasons are sorted deterministically by:

1. reasonType (fixed tier order)
2. referenceId (ascending string)
3. itemId (ascending, if needed)

---

### 6.4.2 Reservation Data Structure

For each `itemId`:

```
reservation[itemId] = {
  total: number,
  reasons: Array<{
    reasonType: "project" | "hideout" | "craft",
    referenceId: string,
    requestedQty: number,
    allocatedQty: number,
    shortfall: number
  }>
}
```

---

### 6.4.3 Allocation Algorithm

For each `itemId`:

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
availableForCrafting = have - sum(allocatedQty of project + hideout tiers)
```

Properties:

- Project and hideout reservations lock inventory before crafting.
- Crafting reservations apply only to remaining inventory.
- All calculations deterministic.

---

### 6.4.4 Reservation Visualization

Plan table columns:

| Item | Have | Reserved | Available | Required | Missing |

Definitions:

- Have = total stash quantity
- Reserved = sum of allocatedQty across all tiers
- Available = have - reserved
- Required = total required for crafting
- Missing = deficit after stash usage and reservation

Clicking a row expands:

- Reserved total
- Grouped by priority tier
- For each reason:
    - referenceId
    - requestedQty
    - allocatedQty
    - shortfall (if > 0)

Example:

Locked (Projects/Hideout):
- Project Phase 3 — requested 20, allocated 20

Reserved (Crafting):
- Craft: Renegade I x1 — requested 28, allocated 10 (shortfall 18)

---

## 6.5 Recycling Phase

- Allowed categories only
- Only from availableForRecycle
- Only if yields missing material
- Never recycle loadout categories

Salvage not used in craft computation.

### 6.5.1 Recycling Selection Algorithm (Deterministic)

Goal: reduce current material deficits by recycling eligible items, using only quantities that remain after reservation locking.

Precomputation:

- Build a set `usedAsIngredient[itemId] = true` if the item appears as a key in any `recipe` field of any item in the dataset.
- Define recycling preference:
    - If `usedAsIngredient[itemId] === false` → `prefer_recycle`
    - If `usedAsIngredient[itemId] === true` → `avoid_recycle`

Inputs:

- `deficit[itemId]` (post stash usage and craft expansion)
- `availableForRecycle[srcItemId]` from section 6.4.3
- each item's `recyclesInto` map

Output:

- `recyclePlan: Array<{ srcItemId, qtyToRecycle, yields: Record<string, number> }>`
- updated `deficit` map (never below zero)

Algorithm:

1. Loop until no more applicable recycling actions exist.

2. Build candidate list:
    - For each `srcItemId` with `availableForRecycle > 0` and `recyclesInto` defined:
        - usefulMaterials = { m | deficit[m] > 0 AND recyclesInto[m] > 0 }
        - if usefulMaterials is empty: exclude candidate

3. For each candidate, compute per-1-unit impact:
    - coverageCount = |usefulMaterials|
    - effectiveYield = sum over m in usefulMaterials of min(deficit[m], recyclesInto[m])

4. Select best candidate using deterministic comparator:
    1) Prefer `prefer_recycle` over `avoid_recycle`
    2) Higher effectiveYield
    3) Higher coverageCount
    4) Lower srcItemId (ascending lexicographic)

5. Recycle units greedily:
    - maxUnits = availableForRecycle[srcItemId]
    - For each m in usefulMaterials:
      neededUnitsForM = ceil(deficit[m] / recyclesInto[m])
      unitsTarget = min(maxUnits, max over m in usefulMaterials of neededUnitsForM)
    - Apply recycling unit-by-unit from 1..unitsTarget:
        - if the current unit would not reduce any deficit (all usefulMaterials now have deficit <= 0): stop early
        - for each m in recyclesInto:
          deficit[m] = max(0, deficit[m] - recyclesInto[m])
    - Record action in recyclePlan with total units applied and computed yields.
    - availableForRecycle[srcItemId] -= unitsApplied

6. Continue loop.

Properties:

- Never recycles non-recyclable categories (section 5.1.1).
- Never uses reserved quantities (section 6.4.3).
- Only recycles when it reduces at least one positive deficit.
- Items usable as crafting ingredients are deprioritized but not forbidden.
- Deterministic for identical inputs (no reliance on object key order or iteration order).

---

## 6.6 Material Deficit

```
deficit[itemId] > 0
```

Drives loot suggestions.

Buying excluded from v1.

---

## 6.7 Salvage vs Recycle

Salvage:

- UI advisory only
- Never part of calculation
- Always yields less than recycle

Badges:

- CAN SALVAGE
- BRING HOME

---

## 6.8 Planner Output Data Model (Canonical)

This section defines the canonical data structures produced by the planner computation layer.  
The UI must render strictly from these structures.  
All structures must be deterministic and stable for identical inputs.

### 6.8.1 Core Types

```ts
type ItemId = string
type Qty = number
type ReasonType = "project" | "hideout" | "craft"
```

---

### 6.8.2 Plan Table

```ts
interface PlanRow {
  itemId: ItemId
  have: Qty
  reserved: Qty
  available: Qty
  required: Qty
  missing: Qty

  isUnknownItem: boolean
  isUncraftable: boolean
  uncraftableReason?: "blueprint_or_bench" | "cycle"
}
```

Plan rows must be ordered deterministically by `itemId` ascending.

---

### 6.8.3 Reservation Breakdown

```ts
interface ReservationBreakdown {
  itemId: ItemId
  totalReserved: Qty
  tiers: Array<{
    reasonType: ReasonType
    reasons: Array<{
      referenceId: string
      requestedQty: Qty
      allocatedQty: Qty
      shortfall: Qty
    }>
  }>
}
```

Tier ordering must follow section 6.4.1.  
Reasons inside each tier must follow deterministic ordering rules defined in section 6.4.1.

---

### 6.8.4 Craft Plan

```ts
interface CraftStep {
  benchId: BenchId
  itemId: ItemId
  qty: Qty
  stationLevelRequired: 1 | 2 | 3
  blueprintLocked: boolean
  isUncraftable: boolean
  uncraftableReason?: "blueprint_or_bench" | "cycle"
}

interface CraftPlan {
  steps: CraftStep[]
}
```

Ordering rules:

1. Bench grouping in fixed bench order:
    - equipment_bench
    - explosives_bench
    - med_station
    - refiner
    - utility_bench
    - weapon_bench
    - workbench
2. Within each bench group: `itemId` ascending.

---

### 6.8.5 Recycling Plan

```ts
interface RecycleAction {
  srcItemId: ItemId
  qtyToRecycle: Qty
  yields: Record<string, Qty>
}

interface RecyclePlan {
  actions: RecycleAction[]
}
```

`actions` must be ordered exactly in the sequence they were selected by the recycling algorithm loop (section 6.5.1).

---

### 6.8.6 Loot Suggestions

```ts
type LootReason =
  | "missing_direct"
  | "recycle_yields_missing"
  | "craft_output_missing"
  | "salvage_yields_missing"

type LootBadge = "CAN_SALVAGE" | "BRING_HOME"

interface LootSuggestion {
  itemId: ItemId
  reasons: LootReason[]
  badge: LootBadge
}

interface LootSuggestionList {
  items: LootSuggestion[]
}
```

`items` must be ordered deterministically by `itemId` ascending.  
`reasons` must be ordered deterministically by fixed enum order.

---

### 6.8.7 Blockers and Diagnostics

```ts
interface CycleDiagnostic {
  itemId: ItemId
  path: string[]
}

interface BlockerSummary {
  missingNonCraftables: ItemId[]
  missingBaseMaterials: ItemId[]
  benchBlockers: ItemId[]
  blueprintBlockers: ItemId[]
  craftCycleBlockers: ItemId[]
  cycleDiagnostics: CycleDiagnostic[]
}
```

All arrays must be ordered deterministically by `itemId` ascending.

---

### 6.8.8 Top-Level Planner Result

```ts
interface PlannerResult {
  required: Record<ItemId, Qty>
  deficit: Record<ItemId, Qty>

  planRows: PlanRow[]
  reservations: ReservationBreakdown[]

  craftPlan: CraftPlan
  recyclePlan: RecyclePlan
  lootSuggestions: LootSuggestionList

  blockers: BlockerSummary
}
```

This structure is the single canonical output of the planner computation engine.

---

# 7. USER INTERFACE

This section defines all UI structure and behavior for the Quartermaster – Loadout, Loot & Craft Planner module.

All UI components must render strictly from the canonical planner result structures defined in section 6.8.

The UI must not implement hidden logic that diverges from planner computation.

---

## 7.1 Global Structure

### 7.1.1 Module Entry

Sidebar label:

```
Quartermaster
```

Page header:

```
Quartermaster – Loadout, Loot & Craft Planner
```

URL slug:

```
/quartermaster
```

---

### 7.1.2 Primary Tabs

The module contains four primary tabs:

1. Plan
2. In Raid
3. Back Home
4. Craft

Tabs are always visible at top level.

---

### 7.1.3 Workflow Indicator

A visible non-blocking lifecycle indicator must be displayed:

```
Plan → In Raid → Back Home → Craft → Sync Inventory
```

Current tab highlighted.

---

### 7.1.4 Loadout Sidebar

Persistent left sidebar (visible in all tabs except mobile collapse):

- List of loadouts
- Toggle (enabled/disabled)
- Quick status indicator:
    - Complete
    - Missing
    - Uncraftable

Loadouts serve only as requirement aggregators.

---

## 7.2 Plan Tab

### 7.2.1 Summary Table (Primary View)

Columns:

| Item | Required | Have | Reserved | Available | Missing | Status |

Status derives from:

- Owned
- Craftable
- Uncraftable (Blueprint/Bench)
- Uncraftable (Cycle)
- Missing Materials

Rows sorted by `itemId` ascending.

---

### 7.2.2 Row Expansion

Clicking a row expands:

- Reservation breakdown (section 6.4.4)
- Recipe (if craftable)
- Recycling sources
- Salvage information
- Deficit reasoning trace

---

### 7.2.3 Unknown Items

Displayed as:

```
Unknown Item (itemId)
```

Marked visually and excluded from logic.

---

## 7.3 In Raid Tab

### 7.3.1 Loot Suggestions Grid

- Alphabetical by itemId
- Compact icon grid
- Rarity border
- Badge:

    - CAN SALVAGE
    - BRING HOME

---

### 7.3.2 Hover / Click Detail

Display:

- Icon
- Name
- Categories
- Description
- Weight
- Stack Size
- Found In
- Recycles Into
- Salvages Into
- Crafting Recipe
- Reason Trace:
    - Required for (final items)
    - Produces needed materials

Badge logic strictly follows section 6.7.

---

## 7.4 Back Home Tab

### 7.4.1 Sync Button

Button:

```
Sync Loadout
```

Displays backpack + safePocket content.

---

### 7.4.2 Layout

Backpack grid:
- 4 columns
- Icon + rarity border
- Quantity badge

Safe Pocket grid:
- Separate section

No durability display.
No action buttons.
No in-app interaction.

---

### 7.4.3 Hover Detail

Same as In Raid.

Classification badge:

- Required
- Useful Material
- Not Needed

---

## 7.5 Craft Tab

### 7.5.1 Ambiguity Notice

There is a contradiction between:

- Section 6.8.4 bench ordering (equipment_bench first)
- Earlier design discussions specifying Refiner must appear first

Current canonical ordering remains defined in section 6.8.4.

Resolution required before altering behavior.

---

### 7.5.2 Craft Plan Display

Grouped by BenchId.

Bench grouping follows canonical ordering in section 6.8.4.

Within each bench:

Columns:

| Item | Craft Times | Total Output | Inputs Needed | Inputs Missing |

---

### 7.5.3 Aggregation Rule

Intermediate materials aggregated across all loadouts.

Example:

If two final items require same intermediate:

Display single aggregated craft step.

---

### 7.5.4 Reminder

Display persistent reminder:

```
After crafting in-game, press Sync Inventory to refresh stash state.
```

---

# 8. ASSUMPTIONS

- Import process deterministic.
- No item with craftBench = "in_raid" exists post-import.
- Cycle detection applies to recipe graph only.
- Salvage never affects totals.
- Buying excluded from v1.
- Reservation tiers processed in strict priority order.

---

# 9. OPEN QUESTIONS

- None

---

# 10. FUTURE FEATURES

## 10.1 Buying from Traders

- Informational suggestion only.
- No price optimization.
- No daily limit tracking.
- Advisory-only feature.

## 10.2 Additional Reservation Layers

- Expanded project tracking.
- Expedition resource locking.
- Multi-phase hideout upgrades.

## 10.3 Additional Enhancements

- Advanced deficit impact visualization.
- Performance optimization for large DAGs.
- Optional economic overlays (if policy changes).

---

# 11. EXPLICIT NON-GOALS

- No automated execution.
- No server-side planner.
- No economic optimization.
- No drop probability modeling.

---

# 12. TESTING & VALIDATION

This section defines required test coverage and canonical scenario definitions for deterministic verification of planner behavior.

## 12.1 Fixture Source and Test Input Stage

Canonical fixture source (pre-import source-format files):

```
docs/sample/items/*.json
```

Tests must derive the post-import `PlannerItem` dataset by executing the import pipeline specified in section 3.

Test suite layers:

1. Importer tests:
- Input: pre-import source files from `docs/sample/items/*.json`
- Output: post-import normalized dataset
- Validate: filtering, normalization, mapping determinism

2. Planner tests:
- Input: post-import normalized dataset produced by importer
- Validate: planner logic determinism and correctness against scenarios below

Tests must not rely on JSON key ordering, file system iteration ordering, or runtime object iteration ordering.

---

## 12.2 Determinism Requirements

All tests must assume:

- Dependency traversal sorted by itemId.
- Reservation ordering deterministic (section 6.4.1).
- Recycling comparator fully specified (section 6.5.1).
- Output structures follow canonical shapes (section 6.8).
- No reliance on JSON key order.
- Identical inputs produce identical outputs for:
    - craft plan
    - recycling decisions
    - reservation breakdown
    - loot suggestion list and ordering

---

## 12.3 Canonical Test Scenarios

### 12.3.1 Import Normalization

Goal: verify deterministic import behavior.

Given fixture items covering:

- `stackSize` missing
- `stackSize` present
- `craftBench` string
- `craftBench` array including `"workbench"`
- `craftBench` array including `"in_raid"`
- `craftBench` string `"in_raid"` only
- `type` values that trigger mapping rules (Weapon via `isWeapon`, Quick Use, direct mapping)

Expect:

- `stackSize` missing -> `1`
- `stationLevelRequired` missing -> `1`
- `blueprintLocked` missing -> `false`
- `craftBench` arrays normalized per section 3.2.1
- in-raid-only crafting items excluded per section 3.1.2
- category/subCategory mapping per section 3.3

### 12.3.2 Craft Expansion (Baseline)

Goal: verify recursive requirements expansion and stop conditions.

Given:

- a loadout with at least one craftable item that expands into:
    - multiple inputs
    - multiple levels of depth
- items with:
    - missing recipe (non-craftable)
    - recipe = {} (non-craftable)
    - craftBench undefined (non-craftable item)

Expect:

- required totals aggregated deterministically
- recursion stops at non-craftables
- consistent derived intermediate totals

### 12.3.3 Cycle Detection

Goal: verify cycle edge-cut behavior and diagnostics.

Given a minimal recipe cycle fixture (e.g., `A -> B -> C -> A`):

Expect:

- cycle detected when encountering item already in `visiting`
- always cut the edge that closes the cycle
- mark item as `Uncraftable (Cycle)` per section 6.2.2.3
- record deterministic cycle path diagnostic per section 6.2.2.4
- continue expansion for non-cyclic branches

### 12.3.4 Recycling to Cover Deficits

Goal: verify recycling only applies when it reduces deficits, respects reservation, and preserves crafting ingredients.

Given:

- stash contains recyclable items with `recyclesInto` yielding needed materials
- stash also contains items in non-recyclable categories
- reservation allocations produce both reserved and available quantities
- at least two recyclable items can reduce the same deficit
- one candidate is used as a crafting ingredient elsewhere and the other is not

Expect:

- only `availableForRecycle` used
- never recycle non-recyclable categories
- only recycle items whose yields match currently missing materials
- items not used as crafting ingredients are preferred over items that are
- deterministic selection when multiple sources yield the same missing material

### 12.3.5 Loot Suggestions Membership

Goal: verify In-Raid suggestion inclusion rules.

Given deficits where:

- some items are missing directly
- some items are not missing but recycle into missing materials
- some items are craft outputs that are missing
- some items salvage into missing materials

Expect:

- suggestion list includes items meeting any inclusion condition
- ordering deterministic (sorted by itemId)

### 12.3.6 Salvage Badge Decision

Goal: verify CAN SALVAGE vs BRING HOME badge behavior.

Given:

- a suggested item with both `salvagesInto` and `recyclesInto`
- current deficits where:
    - salvage yields cover all relevant deficits contributed by the item (CAN SALVAGE), and
    - salvage misses deficits that recycle would cover (BRING HOME)

Expect:

- badge assigned correctly
- badge decision deterministic

### 12.3.7 Unknown Item Handling (API)

Goal: verify unknown `itemId` from API is displayed but excluded from planner logic.

Given API stash/loadout response containing an unknown `itemId`:

Expect:

- UI label `Unknown Item (itemId)`
- excluded from craft, recycle, loot suggestion, reservation logic per section 4.1 / 4.3

### 12.3.8 Reservation Priority Locking (Future Compatibility)

Goal: verify reservation system supports priority tiers and deterministic breakdown (even if future tiers are not yet populated by UI).

Given:

- multiple reservation reasons across tiers for the same `itemId`
- insufficient stash quantity to satisfy all requestedQty

Expect:

- higher tiers allocate first
- correct `allocatedQty` and `shortfall` per reason
- consistent `reservedTotal`, `availableForRecycle`, and `availableForCrafting`
