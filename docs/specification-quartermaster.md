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

Unknown `itemId` entries returned by the API are ignored and not displayed anywhere in the module.

On fetch errors, keep last known synced inventory state and timestamp.

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

Clarification (v1):

- The arctracker.io API for bench levels is not available yet.
- In v1, the planner assumes every bench is at level 3 (which includes also levels 1 and 2).
- `stationLevelRequired` refers to hideout bench levels.
- Future API integration may provide per-bench unlocked levels; this is not active in v1.

---

## 4.3 Backpack / Loadout Endpoint

```
GET /api/v2/user/loadout
```

Aggregate by itemId. Ignore slotIndex and durability.

Unknown `itemId` entries are ignored and not displayed anywhere in the module.

On fetch errors, keep last known synced loadout state and timestamp.

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

ItemIds are ASCII and all "ascending itemId" comparisons are ASCII lexicographic ascending.

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
    - Define `loadoutRef = "loadout:" + L.id` (or stable identifier).
2. For each enabled item entry E inside loadout L:
    - If E.itemId is known and included in `required`:
        - Create a reservation reason for that itemId with:
            - reasonType = "craft"
            - referenceId = loadoutRef + ":" + E.itemId
            - requestedQty = E.quantity (as configured in loadout)
3. Reservation reasons for intermediate crafting ingredients are not created explicitly; intermediate needs are represented through:
    - craft expansion totals
    - deficit computation
    - recyclePlan selection
4. Future tiers (project/hideout) remain empty in v1.

Note:
- This means reservation breakdown in v1 is primarily a traceable explanation of final loadout targets.
- Intermediate ingredient locking is enforced by recycling eligibility rules in section 6.5.1 (KEEP precedence), not by creating additional reservation reasons.

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

Definition: "Intermediate craft"

An itemId is considered required for intermediate craft if and only if:

- It appears as an ingredient key in the expanded recipe requirements graph for any required final loadout item (post cycle-cutting and within depth limit), where the required final loadout item is missing after stash usage, regardless of whether the intermediate itself is currently missing.

This definition is deterministic and computed from:

- `required` (final items from loadouts)
- stash usage (which determines which required final items are missing)
- recipe graph expansion (section 6.2), with cycle handling applied and depth limit applied

Implication:

- If an item can be an ingredient in the current plan for missing required final outputs, it is protected from recycling (KEEP precedence).
- RecyclePlan must only include items not protected by this rule.

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
3. Lower `srcItemId` (lexicographic ascending)

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

Apply recycling unit-by-unit up to `unitsNeeded`:

After each unit:

- Update deficits.
- If the candidate no longer reduces any deficit, stop early.

Record action:

- Subtract units from `availableForRecycle[srcItemId]`.
- Record `RecycleAction` with total units applied and resulting yields.

Repeat from candidate rebuild step until no candidates remain.

Determinism guarantees:

- Candidate scoring is pure given current state.
- Comparator is fully specified.
- All `srcItemId` iterations sorted ascending.
- Updates applied in strict loop order.

---

## 6.6 Deficit Calculation

After stash usage, craft expansion, reservation, recycling:

```
deficit[itemId] = max(0, required[itemId] - usableQuantity[itemId])
```

Definition: usableQuantity

For v1, usableQuantity must be computed deterministically as:

1. Start from stash quantities:

```
have[itemId] = stashTotals[itemId] (0 if absent)
```

2. Apply reservation allocation:

```
reservedTotal[itemId] = sum of allocatedQty across all reservation reasons for itemId
available[itemId] = have[itemId] - reservedTotal[itemId]
```

3. Determine usable quantity for satisfying required final loadout items:

```
usableQuantity[itemId] = have[itemId]
```

Rationale:

- v1 reservation reasons (section 6.4.5) represent the same final loadout requirements that `required` represents.
- Therefore, the reservation breakdown is explanatory (traceability) and must not reduce the ability to satisfy the same requirement set.
- The locking that matters for plan correctness is enforced by recycling eligibility rules (section 6.5.1) and availableForRecycle.

Constraints:

- `availableForRecycle` must always use `available[itemId]` (have minus reserved) to avoid recycling reserved quantities.
- `deficit` is computed against `have[itemId]` for v1, not against `available[itemId]`, to prevent double-counting the same requirement as both "required" and "reserved".

Future compatibility:

- When higher tiers (project/hideout) become active, usableQuantity must be updated to subtract higher-tier allocations only:

```
usableQuantity[itemId] = have[itemId] - allocatedQty(project + hideout tiers)
```

This change is future behavior and not active in v1.

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

Clarification: "Recipe produces missing material"

An item is included under "Recipe produces missing material" if and only if:

- The item itself is a craftable output (has `recipe` and `craftBench` defined), and
- Its own itemId has `deficit[itemId] > 0`

This avoids inverse or transitive interpretations that would explode the suggestion list.

---

### 6.7.1 Salvage vs Recycle Badge

For each suggested item `S`:

Define:

```
neededMaterials = { m | deficit[m] > 0 }

salvageUseful =
  { m in neededMaterials | salvagesInto[S][m] > 0 }

recycleUseful =
  { m in neededMaterials | recyclesInto[S][m] > 0 }
```

Badge assignment:

- If `(recycleUseful \ salvageUseful)` is non-empty:
    ```
    BRING_HOME
    ```
- Else if `salvageUseful` is non-empty:
    ```
    CAN_SALVAGE
    ```
- Else:
    ```
    BRING_HOME
    ```

Deterministic comparison.

---

## 6.8 Canonical Output Structures

All UI renders from these structures.

All structures must be deterministic and stable for identical inputs.

### 6.8.1 Core Types

```ts
type ItemId = string
type Qty = number
type ReasonType = "project" | "hideout" | "craft"

type UncraftableReason =
  | "blueprint_or_bench"
  | "cycle"

type LootReason =
  | "missing_direct"
  | "recycle_yields_missing"
  | "craft_output_missing"
  | "salvage_yields_missing"

type LootBadge =
  | "CAN_SALVAGE"
  | "BRING_HOME"
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

  isUncraftable: boolean
  uncraftableReason?: UncraftableReason
}
```

Ordering:

- `planRows` ordered by itemId ascending.

Notes:

- `reserved` and `available` are derived from reservation allocation (section 6.4.3).
- In v1, `reserved` is traceability-only and must not reduce `have` for deficit calculation (section 6.6).
- Unknown items are never emitted.

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

Ordering:

- `tiers` in fixed tier order (section 6.4.1).
- `reasons` ordered by referenceId ascending.

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
  uncraftableReason?: UncraftableReason
}

interface CraftPlan {
  steps: CraftStep[]
}
```

Definitions:

- `qty` is total output units planned.
- `qty` must always be a multiple of `craftQuantity[itemId]`.
- `craftTimes = qty / craftQuantity[itemId]` (integer, derived for UI).

Craft plan generation (v1):

- Craft plan generation is based on missing required final loadout items (after stash usage) and operates by crafting missing final outputs first.
- For each missing required final output that is craftable, plan crafts to cover the missing quantity in multiples of `craftQuantity`.
- Recursively plan intermediate crafts using depth-first expansion of `recipe` (section 6.2), within the maximum depth.
- This process uses the recipe graph exclusively and does not treat recycle/salvage outputs as craft dependencies.
- The craft plan must remain deterministic for identical inputs.

Ordering:

1. Group by benchId using canonical bench order (section 6.9).
2. Within each bench group: itemId ascending.

---

### 6.8.5 Recycling Plan

```ts
interface RecycleAction {
  srcItemId: ItemId
  qtyToRecycle: Qty
  yields: Record<ItemId, Qty>
}

interface RecyclePlan {
  actions: RecycleAction[]
}
```

Ordering:

- `actions` ordered exactly by selection sequence of the recycling loop (section 6.5.2).

---

### 6.8.6 Loot Suggestions

```ts
interface LootSuggestion {
  itemId: ItemId
  reasons: LootReason[]
  badge: LootBadge

  impactedTargetsCount?: number
}

interface LootSuggestionList {
  items: LootSuggestion[]
}
```

Ordering:

- `items` ordered by itemId ascending.
- `reasons` ordered by fixed enum order as listed in 6.8.1.

Definition: impactedTargetsCount (optional UI helper)

- impactedTargetsCount is the number of final missing itemIds whose deficit would be reduced by acquiring the suggested item, based on:
    - missing directly (if the suggestion itemId itself is missing), or
    - via `recyclesInto` yields covering deficits, or
    - via `salvagesInto` yields covering deficits, or
    - being itself a missing craft output.
- impactedTargetsCount must be computed deterministically from the current deficits and the suggestion's own mappings.
- impactedTargetsCount must not require transitive graph expansion.

---

### 6.8.7 Blockers and Diagnostics

```ts
interface CycleDiagnostic {
  itemId: ItemId
  path: ItemId[]
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

Ordering:

- All arrays ordered by itemId ascending.
- `cycleDiagnostics` ordered by itemId ascending.

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

  activeLoadoutsCount: number
  totalMissingItemsCount: number
  totalRecycleActionsCount: number
  totalCraftStepsCount: number
}
```

Notes:

- `totalMissingItemsCount` is the count of itemIds with `deficit[itemId] > 0`.
- `totalRecycleActionsCount` is `recyclePlan.actions.length`.
- `totalCraftStepsCount` is `craftPlan.steps.length`.
- These counts must be computed deterministically from the same planner result.

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

### 7.1.3 Stored Loadouts Persistence (v1)

Stored loadouts are persisted client-side.

Persistence mechanism:

- localStorage

Required properties:

- Deterministic serialization order
- Backwards-compatible migration strategy (future)

Minimum stored schema:

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

Ordering rules:

- Stored loadouts list ordered by `name` ascending for display.
- Loadout items are stored in insertion order but rendered grouped (section 7.4.2).

Migration strategy (v1):

- If `schemaVersion` is missing, treat as version 1 and set `schemaVersion = 1` on next save.
- If a stored loadout item references an unknown itemId, drop that entry deterministically during load.
- If loadout data is invalid or cannot be parsed, ignore it and keep other loadouts.

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

Clarification:

- If an item is required for any future craft (final or intermediate), it must be KEEP and must not be marked RECYCLE.

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
- If already exists -> increase quantity.

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

Quantity rules:

- For items with `recipe` and `craftBench` defined:
    - Quantity must always be a multiple of `craftQuantity`.
    - Step size in UI must equal `craftQuantity`.
- For non-craftable items:
    - Step size is 1.

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

On rate limits:

- Back off and warn the user.

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

Definitions:

- Total Output = `CraftStep.qty`
- Craft Times = `CraftStep.qty / craftQuantity[itemId]` (integer)

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
- Optional stash size optimization (considering `stackSize` for each item).

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
- Recycling comparator fully specified (section 6.5.2).
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
- `craftQuantity` missing
- `craftQuantity` present (e.g., heavy_ammo with craftQuantity = 10)

Expect:

- `stackSize` missing -> `1`
- `stationLevelRequired` missing -> `1`
- `blueprintLocked` missing -> `false`
- `craftQuantity` missing -> `1`
- `craftQuantity` present preserved
- `craftBench` arrays normalized per section 3.2
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
- recursion stops when depth limit reached

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

Expect:

- only `availableForRecycle` used
- never recycle non-recyclable categories
- only recycle items whose yields match currently missing materials
- deterministic selection based on effectiveYield, coverageCount, srcItemId
- protected intermediate crafting ingredients never appear in RecyclePlan

### 12.3.5 Loot Suggestions Membership

Goal: verify In-Raid suggestion inclusion rules.

Given deficits where:

- some items are missing directly
- some items are not missing but recycle into missing materials
- some craft outputs are missing
- some items salvage into missing materials

Expect:

- suggestion list includes items meeting any inclusion condition
- ordering deterministic (sorted by itemId)

### 12.3.6 Salvage Badge Decision

Goal: verify CAN SALVAGE vs BRING HOME badge behavior.

Given:

- a suggested item with both `salvagesInto` and `recyclesInto`
- current deficits where:
    - salvage yields all needed materials covered by recycle (CAN SALVAGE), and
    - recycle yields at least one needed material not yielded by salvage (BRING HOME)

Expect:

- badge assigned correctly per section 6.7.1
- badge decision deterministic

### 12.3.7 Unknown Item Handling (API)

Goal: verify unknown `itemId` from API is ignored.

Given API stash/loadout response containing an unknown `itemId`:

Expect:

- unknown item is not displayed in any UI view
- unknown item does not appear in any planner output structure

### 12.3.8 Reservation Priority Locking (Future Compatibility)

Goal: verify reservation system supports priority tiers and deterministic breakdown.

Given:

- multiple reservation reasons across tiers for the same `itemId`
- insufficient stash quantity to satisfy all requestedQty

Expect:

- higher tiers allocate first
- correct `allocatedQty` and `shortfall` per reason
- `reservedTotal = sum(allocatedQty)`
- `availableForRecycle = have - reservedTotal`
- `availableForCrafting = have - sum(allocatedQty of higher tiers)`
- deterministic ordering of tiers and reasons
