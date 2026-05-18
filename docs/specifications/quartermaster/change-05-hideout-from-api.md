# CHANGE REQUEST
## Quartermaster Specification Update — Hideout Progression Lists and Bench-Level Craftability

Supersession note:

`change-11-hideout-top-level-view.md` promotes generated hideout upgrade lists into a dedicated top-level **Hideout** view. Any requirements in this file that place generated hideout lists, hideout hints, or **Sync Hideouts** inside the Lists view are superseded by the canonical specification.

---

# CR-001 — Extend System Purpose for Hideout Progression Planning

## Type
Modification

## Affected Section
1.2 Purpose

## Change

Add hideout progression planning as an explicit supported capability.

New functional responsibilities:

- Generate deterministic hideout upgrade lists based on the user's current hideout module levels.
- Allow generated hideout upgrade lists to participate in planner aggregation.
- Support loot acquisition planning for hideout upgrade materials.

## Technical Impact

Planner must support two list sources:

- User-authored lists
- Generated hideout upgrade lists

Aggregation logic must process generated hideout upgrade lists before user-authored lists while preserving the same enable/disable and quantity summing semantics for both sources.

---

# CR-002 — Introduce Hideout Definitions Static Dataset

## Type
Addition

## Affected Section
2. DATA SOURCES

## New Section
2.1.5 Hideout Upgrade Definitions Source

## Change

Quartermaster must import hideout module definitions from:

```
../arcraiders-data/hideout/
```

Each file represents a hideout module and its level upgrade requirements.

A deterministic generated dataset must be produced at:

```
public/data/quartermaster/hideout.json
```

Dataset structure:

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

- Read all files from `../arcraiders-data/hideout/`
- Sort filenames ASCII ascending
- Exclude `stash.json`
- Sort modules by `id` ASCII ascending
- Sort `requirementItemIds` by `itemId` ASCII ascending

Generated dataset must be deterministic.

## Technical Impact

New import pipeline step required.

New generated dataset:

```
public/data/quartermaster/hideout.json
```

Used by client for hideout upgrade list generation.

---

# CR-003 — Extend Import Tooling for Hideout Dataset

## Type
Addition

## Affected Section
3.5 CLI Import Tool (Node)

## Change

Add generation of hideout dataset.

CLI responsibilities extended:

- Read hideout definitions from `../arcraiders-data/hideout/`
- Exclude `stash.json`
- Normalize fields required by Quartermaster
- Produce deterministic dataset
- Write output file:

```
public/data/quartermaster/hideout.json
```

The generation step may be:

- integrated into the existing Quartermaster item generator, or
- implemented as a dedicated script:

```
generate:hideout-quartermaster
```

Generated file must be committed to git.

## Technical Impact

Import tooling must support a second dataset type.

---

# CR-004 — Introduce Hideout API Synchronization

## Type
Addition

## Affected Section
4. DYNAMIC API INTEGRATION

## New Section
4.5 Hideout Progression Integration

## Change

Quartermaster must integrate with the hideout endpoint:

```
/api/v2/user/hideout
```

Hideout view must provide a **Sync Hideouts** button.

Returned hideout state must be cached locally, analogous to stash caching.

Cache must store:

- module id
- currentLevel
- maxLevel
- syncedAt timestamp

Behavior:

- Generated upgrade lists depend on cached hideout state
- If no cached hideout state exists:
    - no generated hideout lists appear
    - Hideout view displays hint prompting Sync Hideouts

Unknown modules must be ignored.

Module `stash` must be excluded from upgrade list generation.

## Technical Impact

New cached dataset required.

New UI control required in Hideout view.

---

# CR-005 — Replace Bench Level Assumption With Actual Hideout Levels

## Type
Modification

## Affected Section
4.4 Hideout Bench Levels

## Change

Replace assumption "all benches are level 3".

New behavior:

Bench level source:

- If cached hideout state exists and is valid → use actual bench levels.
- If hideout state unavailable or invalid → fallback assumption: all benches level 3.

Meaning of `stationLevelRequired`:

- Minimum required level of item's `craftBench`.

Craft eligibility condition:

```
benchLevel >= stationLevelRequired
```

Items failing this condition are considered not locally craftable.

## Technical Impact

Planner must maintain a bench-level map derived from:

- hideout cache when available
- fallback values otherwise.

---

# CR-006 — Define Formal Craftability Predicate

## Type
Addition

## Affected Section
6.3 Definitions for Planning

## New Section
6.3.5 Craftability Predicate

## Change

Define formal rule for craftability.

An item is locally craftable if:

- item has `recipe`
- `blueprintLocked` is false
- `craftBench` is defined
- required bench exists in planner
- bench level ≥ `stationLevelRequired`

Bench level source:

- hideout cache when valid
- fallback assumption otherwise

Items with normalized `craftBench = undefined` are not bench-craftable.

## Technical Impact

All planner craft checks must use this predicate.

---

# CR-007 — Introduce Generated Hideout Upgrade Lists

## Type
Addition

## Affected Section
6.1 Aggregation of Lists

## New Section
6.1.3 Generated Hideout Upgrade Lists

## Change

Quartermaster supports two list sources:

- user-authored lists
- generated hideout upgrade lists

Generation rules:

For each hideout module:

```
targetLevels = levels where level > currentLevel
```

Generate one list per target level.

List items equal:

```
requirementItemIds for that target level
```

Lists are non-cumulative.

Naming:

```
<Bench Name> to Level <N> (Next)
```

for `currentLevel + 1`.

Higher levels:

```
<Bench Name> to Level <N>
```

Generated lists:

- participate in planner aggregation
- have higher planner priority than user-authored lists
- may be enabled or disabled
- item rows may be enabled or disabled
- names and composition are read-only

Generated lists are not reorderable.

## Technical Impact

Planner must merge generated lists with user lists during requirement aggregation.

---

# CR-008 — Persist Toggle State for Generated Lists

## Type
Addition

## Affected Section
7.1 Global Layout

## New Section
7.1.5 Generated Hideout List Toggle Persistence

## Change

Generated lists are not stored as full lists.

Only user toggle state is persisted:

- list enabled/disabled
- item enabled/disabled

Persistence key must uniquely identify:

```
moduleId + targetLevel + itemId
```

Lifecycle rule:

If a generated list disappears due to hideout progression:

- persisted toggle state must be removed.

## Technical Impact

Local persistence layer must support toggle state for generated lists.

---

# CR-009 — Dedicated Hideout View UI

## Type
Modification

## Affected Section
7.4 Lists View
7.5 Hideout View

## Change

Generated hideout upgrade lists must be removed from the Lists view and displayed in a dedicated top-level **Hideout** view.

Lists view must display only:

- User Lists

Hideout view must display:

- Sync Hideouts button
- all hideout benches/modules
- current and max tier for every bench
- completed state for fully upgraded benches
- generated hideout upgrade lists for every future unlock/tier

Generated lists must appear only when hideout cache exists.

Ordering rules:

1. Next upgrade lists first
2. Remaining future levels
3. Bench name ascending
4. Target level ascending

The first upgrade for an unstarted bench is the Unlock tier.

Allowed actions for generated lists:

- enable/disable list
- enable/disable items

Disallowed:

- rename
- add items
- remove items
- reorder
- change quantities

## Technical Impact

Lists UI must no longer support hideout list rendering.

Hideout UI must support generated hideout list rendering and toggle controls.

---

# CR-010 — Update Planner Warnings for Bench Restrictions

## Type
Modification

## Affected Section
6.1.2 Required Aggregation

## Change

Items may be unreachable due to:

- blueprint restriction
- insufficient hideout bench level

Fallback rule:

If hideout data unavailable, planner may treat items as craftable under fallback bench level assumption.

## Technical Impact

Planner must surface bench-level restriction in warning indicators.

---

# CR-011 — Extend Stash View Indicators

## Type
Modification

## Affected Section
7.2 Stash View

## Change

`🚫 Uncraftable` indicator must represent:

- blueprint locked
- missing craft bench
- insufficient bench level

## Technical Impact

Indicator logic must evaluate craftability predicate.

---

# CR-012 — Extend Crafting View Eligibility Rules

## Type
Modification

## Affected Section
7.6 Crafting View

## Change

Craft plan must include only items that are:

- fully satisfiable
- locally craftable under current bench-level rules or fallback mode

## Technical Impact

Planner must filter craft steps by craftability predicate.

---

# CR-013 — Update Assumptions

## Type
Modification

## Affected Section
8. ASSUMPTIONS

## Change

Add:

- Actual hideout bench levels are used for craftability when hideout cache is available.
- Planner falls back to assuming all benches level 3 if hideout state unavailable.
- Generated hideout upgrade lists require valid hideout cache.
- Hideout module `stash` is excluded from upgrade list generation.

## Technical Impact

Clarifies planner behavior under missing API state.

---

# CR-014 — Expand Test Coverage

## Type
Modification

## Affected Section
12. TESTING & VALIDATION

## Change

Add validation scenarios:

- hideout definitions imported deterministically
- `stash.json` excluded
- generated list per not-yet-reached level
- correct `(Next)` labeling
- generated lists participate in planner aggregation
- toggle persistence for generated lists
- obsolete toggle cleanup after hideout progression
- fallback craftability with missing hideout cache
- craft blocked when bench level insufficient
- craft allowed when bench level meets requirement

## Technical Impact

Test suite must include hideout-driven planner scenarios.
