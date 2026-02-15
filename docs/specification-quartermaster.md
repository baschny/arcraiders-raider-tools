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

# 2.1 Static Dataset (Client-Side)

## 2.1.1 Source

Curated JSON files derived from the arctracker GitHub source.

Approximately 500 items.

All static data is loaded at application startup and stored in memory.

Items with the following original `type` values are excluded from import and do not exist in the planner dataset:

- Blueprint
- Outfit
- Backpack Charm

---

## 2.1.2 Item Schema

Each item JSON file contains:

```ts
{
  id: string,
  name: string,
  description: string,
  icon: string,
  rarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary",
  type: string,

  craftBench?: BenchId,
  stationLevelRequired?: 1 | 2 | 3,
  blueprintLocked?: boolean,

  recipe?: Record<string, number>,
  recyclesInto?: Record<string, number>,
  salvagesInto?: Record<string, number>,

  stackSize?: 1 | 3 | 5 | 15 | 50,
  value?: number,
  weight?: number,
  foundIn?: string[],
  categories?: string[],
  isWeapon?: boolean
}
```

### 2.1.2.1 Normalized Planner Fields

During static dataset import, the planner derives:

- `category: string`
- `subCategory?: string`

The original `type` field is preserved unchanged.

### 2.1.2.2 Category Mapping Rules

1. Weapon Mapping

If:

```
isWeapon === true
```

Then:

```
category = "Weapon"
subCategory = original type
```

2. Quick Use Mapping

If:

```
type === "Quick Use"
```

Then:

```
category = "Quick Use"
subCategory depends on craftBench:
    explosives_bench  => "Explosive"
    med_station       => "Medicinal"
    utility_bench     => "Utility"
```

If no craftBench matches, subCategory remains undefined.

3. Direct Mapping

For all other items:

```
category = type
subCategory = undefined
```

---

## 2.1.3 Default Assumptions

- If `stackSize` is missing -> assume `1`.
- If `stationLevelRequired` is missing -> treat as level `1`.
- If `blueprintLocked` is missing -> treat as `false`.
- All items lootable topside unless specified otherwise.

---

# 2.2 Bench Identifiers

Allowed values:

```
equipment_bench
explosives_bench
med_station
refiner
utility_bench
weapon_bench
workbench
in_raid
```

Items with `craftBench = "in_raid"` are excluded from crafting logic.

---

# 2.3 Dynamic API Endpoints

---

## 2.3.1 Stash Endpoint

### Endpoint

```
GET /api/v2/user/stash
```

### Parameters

- `page`
- `per_page` (max 100)

### Response Structure

```json
{
  "data": {
    "items": [
      {
        "itemId": "string",
        "name": "string",
        "quantity": number,
        "slotIndex": number
      }
    ]
  }
}
```

### Normalization Rules

- Aggregate by `itemId`.
- Ignore `slotIndex`.
- Store only total quantities per item.
- Persist locally with timestamp.
- Fetch all pages until empty or fewer than `per_page` results.

If an `itemId` does not exist in the static dataset:

- Display as:
  ```
  Unknown Item (itemId)
  ```
- Show quantity.
- Exclude from:
  - Craft logic
  - Recycling logic
  - Loot suggestion logic
  - Reservation logic

### Trigger

Manual button:

**Sync Inventory**

---

## 2.3.2 Hideout Endpoint

### Endpoint

```
GET /api/v2/user/hideout
```

### Current State

Not working.

### Fallback Rule

Assume all benches level 3.

### Future Behavior

When functional:

- Map benchId -> level (1..3).
- If an item requires a higher level than available, mark it as Uncraftable.

---

## 2.3.3 Backpack / Loadout Endpoint

### Endpoint

```
GET /api/v2/user/loadout
```

### Relevant Fields

```json
{
  "data": {
    "loadout": {
      "backpack": [...],
      "safePocket": [...]
    }
  }
}
```

Each item:

```
itemId
quantity
slotIndex
durabilityPercent
```

### Normalization

- Aggregate by itemId.
- Ignore slotIndex.
- Ignore durabilityPercent.

If an `itemId` does not exist in the static dataset:

- Display as:
  ```
  Unknown Item (itemId)
  ```
- Exclude from planner logic.

### Trigger

Manual button:

**Sync Loadout**

---

## 2.3.4 Blueprint API

Not available.

Stub implementation:

```
isBlueprintUnlocked(itemId) => true
```

If future API indicates blueprint locked:

- Mark item as Uncraftable.
- Do not expand recursively.
- Display warning indicator.

---

# 3. HARD STRATEGY CONSTRAINTS

---

## 3.1 Recycling Restrictions

### 3.1.1 Non-Recyclable Categories

Items belonging to loadout categories must never be recycled automatically.

Loadout categories (based on normalized `category`):

- Weapon
- Ammunition
- Augment
- Modification
- Quick Use
- Shield

### 3.1.2 Recyclable Categories

Allowed for recycling:

- Nature
- Recyclable
- Refined Material
- Topside Material
- Basic Material
- Misc
- Trinket
- Special

### 3.1.3 Rule

```
if item.category in loadoutCategories:
    item cannot be recycled
```

---

## 3.2 Value Is Irrelevant

- No optimization based on sell value.
- No value-based ranking.
- No opportunity-cost analysis.

---

## 3.3 Strategy Priority

For missing requirements:

1. Use stash
2. Craft (recursive)
3. Recycle (allowed categories only)
4. Buy (informational only)
5. Loot (fallback)

---

## 3.4 Rarity

Rarity does not influence recycling or crafting decisions.

---

# 4. CORE PLANNER LOGIC

---

## 4.1 Aggregation of Loadouts

### 4.1.1 Loadout Behavior

- Each loadout has enable toggle.
- Each item inside loadout has enable toggle.

### 4.1.2 Aggregation Rule

```
required[itemId] = sum of quantities across all active + enabled loadout items
```

Each item appears once globally.

---

## 4.2 Craft Expansion

### 4.2.1 Recursive DAG Expansion

- Expand recipe graph recursively.
- Exclude craftBench = in_raid.
- Assume blueprint unlocked (unless explicitly locked).
- Assume bench level 3 (unless hideout data overrides).
- Aggregate identical intermediate requirements.
- Traverse dependencies in sorted ascending `itemId` order.
- Deterministic ordering guaranteed for identical inputs.

### 4.2.2 Stop Conditions

Stop expansion at:

- Non-craftable items.
- Items without recipe.
- Items marked Uncraftable.
- Items with craftBench = in_raid.

#### 4.2.2.1 Cycle Definition

- Cycle detection applies to the **recipe dependency graph only**.
- `recyclesInto` and `salvagesInto` are not part of craft expansion edges.
- A cycle exists if a dependency chain re-visits an item already present in the current recursion stack.

#### 4.2.2.2 Detection Algorithm (Deterministic)

During recursive expansion:

- Maintain:
  - `visiting`: set of itemIds in the current recursion stack
  - `stack`: ordered list of itemIds representing the current expansion path
- When expanding item `X`, for each dependency `Y`:
  - If `Y` is not in `visiting`, expand recursively.
  - If `Y` is already in `visiting`, a cycle is detected.

Traversal of dependencies must occur in sorted ascending `itemId` order to guarantee deterministic cycle detection and diagnostics.

#### 4.2.2.3 Handling Rule (Cut Closing Edge)

On detecting a cycle via dependency `X -> Y` where `Y` is already in the recursion stack:

- Always cut the edge that closes the cycle.
- Do not expand `Y` from `X`.
- Mark `Y` as:
  ```
  Uncraftable (Cycle)
  ```
- Continue expanding other dependencies of `X` (if any).
- Continue traversal deterministically.

#### 4.2.2.4 Diagnostics

When a cycle is detected:

- Store a deterministic diagnostic path:
  - The current `stack` plus the repeated `Y` at the end.
- Example diagnostic format:
  ```
  A -> B -> C -> A
  ```
- Diagnostics are stored for display in debugging or developer tooling.
- Diagnostics do not alter computation beyond the defined edge cut.

---

## 4.2.3 Uncraftable State

An item is marked:

```
Uncraftable
```

If:

- Blueprint locked.
- Bench level insufficient.
- Craft cycle detected (recipe graph), as defined in 4.2.2.

Behavior:

- Still selectable in loadouts.
- Still included in aggregation.
- Still included in deficit calculation.
- Does NOT expand recursively.
- Display warning icon overlay.
- Tooltip:
  - “Uncraftable (Blueprint or Bench restriction)”
  - or “Uncraftable (Cycle)”
- Listed in Blocking Overview.

---

## 4.3 Reservation Phase

### 4.3.1 Reservation Order

1. Final loadout items.
2. Intermediate craft outputs.
3. Base materials.

Within each tier: sort by itemId (deterministic).

### 4.3.2 Computation

```
reserved[itemId]
availableForRecycle[itemId] = have[itemId] - reserved[itemId]
```

Only `availableForRecycle` eligible for recycling.

---

## 4.4 Recycling Phase

Rules:

- Only allowed categories.
- Only from availableForRecycle.
- Only if yields a currently missing material.
- Never recycle loadout categories.

Salvage is not used in crafting computation.

---

## 4.5 Material Deficit

After stash usage + reservation + recycling:

```
deficit[itemId] > 0
```

Drives:

- Loot suggestions
- Buy suggestions

---

## 4.6 Loot Suggestions

### 4.6.1 Unified List

Flat alphabetical grid.

Include items where:

- itemId itself is missing
- recyclesInto yields missing material
- recipe produces missing material
- salvagesInto yields missing material (UI advisory only)

---

## 4.7 Salvage vs Recycle Decision

Salvage:

- Is NEVER used in crafting computation.
- Is NEVER used in reservation.
- Is NEVER used in deficit resolution.
- Is UI advisory only in "In Raid".

Salvaging always produces less material than Recycling.

For each loot suggestion:

If salvage yields cover all required outputs:

Badge:
- CAN SALVAGE

If salvage omits required outputs available in recycle:

Badge:
- BRING HOME

---

# 5. USER INTERFACE STRUCTURE

---

## 5.1 Primary Tabs

1. Plan
2. In Raid
3. Back Home
4. Craft

Persistent left sidebar:
Loadouts list (enable/disable).

---

## 5.2 Workflow Indicator

Displayed:

```
Plan -> In Raid -> Back Home -> Craft -> Sync Inventory
```

---

# 6. PLAN TAB

---

## 6.1 Aggregated Summary Table

Columns:

- Item
- Required
- Have
- Missing
- Notes

Expandable rows show:

- Recipe
- Bench + level
- Recycling sources
- Uncraftable warning (if applicable)
- Salvage notes (informational only)

---

## 6.2 Blocking Overview

Lists:

- Missing non-craftables
- Missing base materials
- Bench blockers
- Blueprint blockers
- Craft cycle blockers
- Uncraftable items

---

# 7. IN RAID TAB

---

## 7.1 Loot Suggestions Grid

Alphabetical.

Icon grid.

Tile shows:

- Icon
- Rarity border
- Badge: CAN SALVAGE or BRING HOME

---

## 7.2 Hover Detail

Displays:

- Icon
- Name
- Category
- SubCategory (if present)
- Description
- Properties
- Recycles Into
- Salvages Into
- Crafting Recipe
- Required For
- Material Impact Trace
- Uncraftable warning if applicable

---

# 8. BACK HOME TAB

---

## 8.1 Trigger

**Sync Loadout**

---

## 8.2 Layout

- Backpack grid (4 columns)
- Safe Pocket grid

No durability badge.

No action buttons.

Unknown items displayed as:

```
Unknown Item (itemId)
```

Excluded from planner logic.

---

## 8.3 Hover Detail

Same as In Raid.

Shows:

- Item info
- Why needed
- Classification badge:

  - Required
  - Useful Material
  - Not Needed
  - Uncraftable (if applicable)

---

# 9. CRAFT TAB

---

## 9.1 Bench Order

1. Refiner
2. Weapon Bench
3. Explosives Bench
4. Med Station
5. Utility Bench
6. Equipment Bench
7. Workbench

---

## 9.2 Craft Aggregation

- Expand full DAG.
- Aggregate identical intermediates.
- Compute total quantities.
- Respect Uncraftable state.
- Deterministic ordering.

---

## 9.3 Bench Sections

Columns:

- Item
- Craft Times
- Total Output
- Inputs Needed
- Inputs Missing

Uncraftable items:

- Display warning icon.
- Still shown in table.
- Not expanded further.

Refiner appears first.

---

## 9.4 Reminder

After crafting:

User must press:

**Sync Inventory**

---

# 10. USER WORKFLOW LOOP

Plan  
-> In Raid  
-> Back Home  
-> Craft  
-> Sync Inventory  
-> Plan

---

# 11. ASSUMPTIONS

- Static dataset accurate.
- All type mappings correctly normalized to category/subCategory.
- stackSize available or default 1.
- Bench level fallback = 3.
- Blueprint stub returns true unless overridden.
- Salvage always yields less material than recycle.
- Cycle detection applied only to recipe graph.
- All items lootable topside unless specified otherwise.

---

# 12. OPEN QUESTIONS

1. Craft cycle detection handling (Specified: detect recipe cycles via DFS recursion stack; traverse dependencies in sorted itemId order; cut closing edge; mark Uncraftable (Cycle); store deterministic cycle path).
2. Buy suggestion ranking logic.
3. Multiple craft benches per item (if possible).
4. Whether to show reserved vs available stash quantities visually.
5. Worst-case performance for DAG expansion.

---

# 13. EXPLICIT NON-GOALS

- No automated execution.
- No value-based optimization.
- No rarity protection logic.
- No drop probability modeling.
- No server-side planning engine.
