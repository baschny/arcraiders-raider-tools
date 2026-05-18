# CHANGE REQUEST
## Quartermaster – Replace Loadouts with Priority-Based Item Lists

Supersession note:

`change-11-hideout-top-level-view.md` adds generated hideout upgrade lists as a higher-priority planner source. Priority rules in this file continue to define ordering within user-authored lists, but generated hideout lists are processed before user-authored lists in the canonical specification.

---

# CR-001 — Replace Loadout Concept with Lists

## Type
Modification

## Affected Sections
1.2 Purpose  
6.1 Aggregation of Loadouts  
7.1.2 Global Header Row  
7.1.3 Stored Loadouts Persistence  
7.4 Loadouts View

## Change

All references to **Loadouts** as the primary target definition must be replaced with **Lists**.

Lists represent prioritized item goal sets.  
Each list contains item entries that represent items the player wants to obtain.

Planner targets must now be derived exclusively from **enabled lists and enabled list items**.

User-authored lists maintain a **priority order defined by UI order (top → bottom)**.

Items inside a user-authored list also maintain **priority order defined by UI order (top → bottom)**.

Disabled lists and disabled list items are ignored during planner computation.

## New Rule

Planner targets originate from lists only.

```
requiredFinal[itemId] =
    sum(quantity across all enabled lists and enabled list items)
```

Duplicate itemIds across lists must **sum quantities**.

## Technical Impact

Planner target aggregation source changes:

Old:
```
loadouts -> requiredFinal
```

New:
```
lists -> requiredFinal
```

Planner ordering metadata must include:

```
listIndex
itemIndex
```

These values are used for priority ordering (see CR-004).

Data structures referencing loadouts must be renamed accordingly.

---

# CR-002 — Rename Persistence Schema: StoredLoadout → StoredList

## Type
Modification

## Affected Sections
7.1.3 Stored Loadouts Persistence

## Change

Rename persistence schema and storage concept from **Loadouts** to **Lists**.

Old interface:

```
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

New interface:

```
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

Remove migration rules.

Persistence remains:

```
localStorage
```

Deterministic serialization requirement remains.

## Technical Impact

Rename storage key and data structures:

```
storedLoadouts -> storedLists
```

Update all references in UI and planner input pipeline.

---

# CR-003 — Current Loadout View Decoupled from Planner Targets

## Type
Modification

## Affected Sections
4.3 Loadout Integration  
7.3 Current Loadout View

## Change

The **Current Loadout View** remains unchanged visually and functionally.

However:

Dynamic API loadout data **must not contribute to planner targets**.

Planner targets must be derived **only from lists**.

Loadout information is purely informational and advisory.

## Technical Impact

Planner input sources:

Old:

```
requiredFinal derived from:
- loadouts
```

New:

```
requiredFinal derived from:
- lists only
```

`CachedLoadout` continues to be used only by the **Current Loadout View UI**.

No planner logic may reference `CachedLoadout`.

---

# CR-004 — New Planner Target Priority Model

## Type
Modification

## Affected Sections
5.3 Strategy Priority  
6.4 Planning Phases per Target

## Change

Replace the existing target ordering rule.

Old ordering:

1. value descending
2. itemId ascending

New deterministic ordering within user-authored lists:

1. **List order** (top → bottom)
2. **Item order inside list** (top → bottom)
3. **value descending**
4. **itemId ascending (ASCII)**

Canonical source-priority ordering:

1. generated hideout upgrade lists
2. user-authored lists

## Implementation Rule

Planner must determine the processing order by constructing an ordered target list derived from lists.

Example algorithm:

```
for each list in lists ordered by UI position:
    if list.isEnabled:
        for each item in list.items ordered by UI position:
            if item.isEnabled:
                accumulate quantity into requiredFinal[itemId]
                record earliest (listIndex, itemIndex)
```

Target iteration order must use:

```
sort by:
  listIndex ASC
  itemIndex ASC
  value DESC
  itemId ASC
```

## Technical Impact

Planner must store priority metadata:

```
targetPriority[itemId] = {
  listIndex,
  itemIndex
}
```

When duplicate itemIds occur across lists:

- quantities must **sum**
- earliest `(listIndex, itemIndex)` defines priority position.

---

# CR-005 — Recycling Restriction Terminology Update

## Type
Modification

## Affected Sections
5.1 Recycling Restrictions  
6.4.2 Protected From Recycling  
6.5 Loot Suggestions

## Change

Rename references from **loadout categories** to **nonRecyclableCategories**.

The following categories remain non-recyclable:

```
[
  "Weapon",
  "Ammunition",
  "Augment",
  "Modification",
  "Quick Use",
  "Shield"
]
```

Rules remain identical:

- Items in these categories **cannot be recycled**.
- These categories **are excluded from loot suggestions**.
- Planner must never mark these items for recycling.

## Technical Impact

Only terminology and documentation changes.

No change to planner logic.

---

# CR-006 — Lists View Replaces Loadouts View

## Type
Modification

## Affected Sections
7.4 Loadouts View

## Change

Rename **Loadouts View** to **Lists View**.

Lists define prioritized item goals.

UI structure:

Sidebar:

```
Lists
```

Capabilities:

- Create list
- Enable/disable list
- Drag-and-drop reorder lists

List Editor:

- Add item via autocomplete
- Modify quantity
- Enable/disable item
- Remove item
- Drag-and-drop reorder items

List ordering defines planner priority.

Item ordering inside a list defines planner priority.

## Technical Impact

UI must implement two reorderable layers:

```
1. Lists reorder
2. Items inside list reorder
```

Reordering must persist deterministically to localStorage.

Planner must read lists in stored order.

---

# CR-007 — Remove Automatic Category Grouping in Editor

## Type
Modification

## Affected Sections
7.4.2 Editor

## Change

Remove automatic grouping of items by category.

Old behavior:

Items automatically grouped into:

```
Augment
Shield
Weapon(s)
Weapon Modifications
Ammunition
Quick Use
```

New behavior:

Items are displayed strictly in **manual user-defined order**.

This order determines planner priority.

## Technical Impact

Remove category grouping logic in list editor UI.

Rendering order becomes:

```
items array order
```

Drag-and-drop operations update this order.

---

# CR-008 — Global Header Row Update

## Type
Modification

## Affected Sections
7.1.2 Global Header Row

## Change

Replace header metric:

Old:

```
Active Loadouts count
```

New:

```
Active Lists count
```

All other metrics remain unchanged.

## Technical Impact

UI label update.

Metric calculation now counts enabled lists.

---

# CR-009 — Planner Protection Rules Updated

## Type
Modification

## Affected Sections
6.4.2 Protected From Recycling

## Change

Replace references to "loadout items" with "list target items".

New protection rule:

Items appearing in `requiredFinal` must never be recycled.

Disabled lists and disabled items must not contribute to protection rules.

## Technical Impact

Protection evaluation must reference:

```
requiredFinal
```

derived from lists.

---

# CR-010 — Terminology Updates Across Specification

## Type
Modification

## Affected Sections
Global

## Change

Replace all terminology:

```
Loadout -> List
Loadouts -> Lists
Loadout editor -> List editor
Active loadouts -> Active lists
Loadout aggregation -> List aggregation
```

Exceptions:

```
Current Loadout View
```

remains unchanged and continues referencing dynamic API loadout data.

## Technical Impact

Documentation and UI label updates only.

Planner logic remains unaffected except where explicitly defined in other CRs.

---

# End of Change Request
