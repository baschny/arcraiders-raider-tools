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

# 7. USER INTERFACE

---

## 7.1 Tabs

1. Plan
2. In Raid
3. Back Home
4. Craft

---

## 7.2 Blocking Overview

- Missing non-craftables
- Missing base materials
- Bench blockers
- Blueprint blockers
- Craft cycle blockers

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

1. Craft cycle detection handling (Specified).
2. Buying from traders (Future feature).
3. Multiple craft benches per item (Specified via import normalization).
4. Worst-case performance of DAG expansion.

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
