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

    type: string

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

Items excluded during import do not exist in this dataset.

---

## 2.1.3 Default Assumptions

After import:

- `stackSize` is always defined.
- `stationLevelRequired` is always defined.
- `blueprintLocked` is always defined.
- `craftBench` is either a valid BenchId or undefined.
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
    - If `"in_raid"` → exclude.
    - Otherwise keep.

2. If array:
    - Remove `"workbench"`.
    - Remove `"in_raid"`.
    - Preserve original order.
    - If one remains → use it.
    - If multiple remain → use first.
    - If none remain → exclude.

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

- explosives_bench → "Explosive"
- med_station → "Medicinal"
- utility_bench → "Utility"

### 3.3.3 Direct Mapping

All other items:

```
category = type
subCategory = undefined
```

---

## 3.4 Default Field Completion

During import:

- Missing `stackSize` → 1
- Missing `stationLevelRequired` → 1
- Missing `blueprintLocked` → false

---

# 4. DYNAMIC API ENDPOINTS

---

## 4.1 Stash Endpoint

```
GET /api/v2/user/stash
```

Rules:

- Aggregate by `itemId`.
- Ignore `slotIndex`.
- Persist timestamp.
- Fetch all pages.

Unknown item:

```
Unknown Item (itemId)
```

Excluded from planner logic.

Trigger: Sync Inventory

---

## 4.2 Hideout Endpoint

```
GET /api/v2/user/hideout
```

Fallback: assume level 3.

If insufficient level:

- Mark Uncraftable
- Do not expand

---

## 4.3 Backpack / Loadout Endpoint

```
GET /api/v2/user/loadout
```

Aggregate by itemId. Ignore slotIndex and durability.

Unknown items displayed but excluded from logic.

Trigger: Sync Loadout

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

Rule:

```
if item.category in loadoutCategories:
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

---

## 6.2 Craft Expansion

Craft expansion operates exclusively on the `recipe` graph.

`recyclesInto` and `salvagesInto` are not part of recursive expansion.

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

## 6.5 Recycling Phase

Recycling reduces deficits after stash usage and craft expansion.

Salvage never affects planner totals.

---

### 6.5.1 Recycling Eligibility

An item may be recycled only if:

- Category not in non-recyclable list.
- availableForRecycle > 0.
- recyclesInto defined.
- Recycling reduces at least one positive deficit.
- Item is NOT required for:
    - Final loadout
    - Intermediate craft
    - Higher reservation tiers

KEEP precedence over RECYCLE.

---

### 6.5.2 Recycling Algorithm (Deterministic)

Inputs:

- deficit map
- availableForRecycle map
- recyclesInto data

Steps:

1. Build candidate list:
    - availableForRecycle > 0
    - recyclesInto defined
    - yields at least one material with deficit > 0

2. Compute impact metrics per 1 unit:
    - coverageCount
    - effectiveYield

3. Select candidate using comparator:

    1) Prefer items not used as crafting ingredients
    2) Higher effectiveYield
    3) Higher coverageCount
    4) Lower itemId

4. Apply recycling unit-by-unit until:
    - No deficits reduced
    - availableForRecycle exhausted

5. Record recyclePlan action.

Loop until no applicable candidates remain.

Properties:

- Deterministic
- No recycling of reserved quantities
- No recycling of loadout categories

---

## 6.6 Deficit Calculation

After stash usage, craft expansion, reservation, recycling:

```
deficit[itemId] = max(0, required[itemId] - usableQuantity[itemId])
```

Drives:

- Loot suggestions
- Craft plan
- Status indicators

---

## 6.7 Loot Suggestions

Include item if:

- Missing directly
- RecyclesInto yields missing material
- Recipe produces missing material
- SalvagesInto yields missing material

Sorted by itemId ascending.

---

### 6.7.1 Salvage vs Recycle Badge

For each suggestion:

If salvage yields cover all relevant missing outputs:

```
CAN SALVAGE
```

Else:

```
BRING HOME
```

Deterministic comparison.

---

## 6.8 Canonical Output Structures

All UI renders from these structures.

(Structures remain unchanged from previous canonical definitions: PlanRow, ReservationBreakdown, CraftPlan, RecyclePlan, LootSuggestionList, BlockerSummary, PlannerResult.)

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

All craftPlan grouping must follow this order.

---

# 7. USER INTERFACE

This section fully replaces the previous UI definition.

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

Visible regardless of selected sidebar item.

Displays:

- Active Loadouts count
- Total Missing Items count
- Total Recycle Actions
- Total Craft Steps
- Last Sync Inventory timestamp
- Last Sync Loadout timestamp

No planner logic executed here; purely derived from PlannerResult and API timestamps.

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

### 7.2.2 Table

Columns:

| Icon | Item | Quantity | Reserved | Available | Required | Missing | Indicators |

Indicators:

- 🔧 Required for Crafting
- 🔒 Reserved (Project/Hideout)
- 🔄 To Recycle
- ⚠ Missing
- 🚫 Uncraftable

### 7.2.3 Expand Row

Shows:

- Reservation breakdown
- Recipe
- Recycling sources
- Salvage info
- Used in loadout items

### 7.2.4 Value Display

Total stash value displayed at top (informational only).

---

## 7.3 Current Loadout View

Displays dynamic API loadout.

### 7.3.1 Layout

Grid emulating in-game layout:

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

---

### 7.3.3 Hover Detail

Shows:

- Item info
- Required for
- Produces needed materials
- Reservation reason

---

## 7.4 Loadouts View

### 7.4.1 Sidebar

- List of loadouts
- Enable/Disable toggle
- Status indicator
- Create Loadout button

---

### 7.4.2 Editor

Top:

```
Add Item [autocomplete as-you-type input]
```

Behavior:

- Typing filters instantly.
- Enter adds item.
- Default quantity = 1.
- If already exists → increase quantity.

Loadout item list grouped automatically:

- Augment
- Shield
- Weapon(s)
- Weapon Modifications
- Ammunition
- Quick Use

Mapping derived from PlannerItem.category.

User cannot change grouping.

Per item controls:

- Quantity
- Enable/Disable
- Remove

---

## 7.5 In Raid View

### 7.5.1 Loot Grid

Alphabetical by itemId.

Icon + rarity border.

Badge:

- CAN SALVAGE
- BRING HOME

Optional small count: number of impacted targets.

---

### 7.5.2 Hover Detail

Displays:

- Required for (final loadout items)
- Produces needed materials for (final loadout items)
- Recycling vs salvage comparison

---

## 7.6 Crafting View

### 7.6.1 Controls

- Sync Inventory button

---

### 7.6.2 Section 1: Recycle First

List of RecyclePlan actions.

Columns:

| Item | Qty to Recycle | Yields |

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

---

### 7.6.4 Iterative Workflow

After performing recycle or craft in game:

User must press Sync Inventory to refresh state.

Craft view recalculates dynamically.

---

# 8. ASSUMPTIONS

- Import deterministic.
- No in_raid craftBench remains.
- Salvage advisory only.
- Buying excluded v1.
- Reservation tiers strict priority.
- KEEP precedence over RECYCLE.

---

# 9. OPEN QUESTIONS

None.

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
