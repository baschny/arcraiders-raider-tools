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
  categories?: string[]
}
```

---

## 2.1.3 Default Assumptions

- If `stackSize` is missing -> assume `1`.
- If `stationLevelRequired` is missing -> treat as level `1`.
- If `blueprintLocked` is missing -> treat as `false`.

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

### Future

Map benchId -> level (1..3).

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

Future integration required.

---

# 3. HARD STRATEGY CONSTRAINTS

---

## 3.1 Recycling Restrictions

### 3.1.1 Non-Recyclable Categories

Items belonging to loadout categories must never be recycled or salvaged automatically.

Non-recyclable categories:

- Weapons
- Augments
- Weapon Mods
- Shields
- Quick Use

### 3.1.2 Recyclable Categories

Allowed:

- Nature
- Recyclable
- Refined Material
- Topside Materials

### 3.1.3 Rule

```
if item.type in loadout_categories:
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
- Assume blueprint unlocked.
- Assume bench level 3.

### 4.2.2 Stop Conditions

Stop expansion at:

- Non-craftable items.
- Items without recipe.
- Items blocked by blueprint (future).
- Items blocked by bench level (future).

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
- salvagesInto yields missing material

---

## 4.7 Salvage vs Recycle Decision

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
- Salvage notes

---

## 6.2 Blocking Overview

Lists:

- Missing non-craftables
- Missing base materials
- Bench blockers (future)
- Blueprint blockers (future)

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
- Categories
- Description
- Properties
- Recycles Into
- Salvages Into
- Crafting Recipe
- Required For
- Material Impact Trace

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

---

## 9.3 Bench Sections

Columns:

- Item
- Craft Times
- Total Output
- Inputs Needed
- Inputs Missing

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
- All types mapped correctly.
- stackSize available or default 1.
- Bench level fallback = 3.
- Blueprint stub returns true.
- All items lootable topside unless specified otherwise.

---

# 12. OPEN QUESTIONS

1. Final authoritative mapping of type -> recyclable vs non-recyclable.
2. Craft cycle detection handling.
3. Buy suggestion ranking logic.
4. Multiple craft benches per item (if possible).
5. Whether to show reserved vs available stash quantities visually.
6. Worst-case performance for DAG expansion.
7. Handling unknown items returned by API.
8. Hideout sync trigger behavior.

---

# 13. EXPLICIT NON-GOALS

- No automated execution.
- No value-based optimization.
- No rarity protection logic.
- No drop probability modeling.
- No server-side planning engine.

---
