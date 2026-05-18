# CHANGE REQUEST
## Quartermaster Specification Update - Recycle Source Priority

Document Type: Structured Delta vs Previous Specification
Scope: Quartermaster planner, recycle source selection, Crafting view reason display, and tests
Impact Level: Planner behavior correction plus UX warning clarification
Version: CR-Recycle-Source-Priority-v1

---

# 1. SUMMARY

Quartermaster must prefer recycling items that are not direct crafting inputs for active list targets before recycling items that are direct crafting inputs for those targets.

Recycle source candidates must be grouped before the existing yield-based comparator is applied:

- Group A: items that are not direct recipe inputs for any currently planned active-list final target
- Group B: items that are direct recipe inputs for at least one currently planned active-list final target

The planner may recommend a Group B recycle source only when no usable Group A candidate can satisfy the same current recycle need. Group B recycle actions must be visibly marked as lower-priority sacrifice recommendations in the Crafting view "Why" column.

---

# 2. MOTIVATION

The current deterministic recycle comparator ranks candidates by immediate yield toward missing materials, coverage count, and `itemId`. It does not account for whether the item being recycled is itself a direct crafting material for an active list target.

This can produce poor guidance.

Example:

- The user needs `launcher_ammo` x60.
- `launcher_ammo` requires `arc_motion_core` x1 and `crude_explosives` x2 per craft.
- The user has only 16 of the required 20 `crude_explosives`.
- `crude_explosives` can be crafted from `chemicals` x6.
- `comet_igniter` recycles into `arc_alloy` x2 and `crude_explosives` x2.
- `comet_igniter` is also a direct crafting material for `deadline`, which is present in an active list.

The planner should prefer crafting `crude_explosives` from `chemicals` when possible. If recycling is still required, it should prefer sacrificing items that are not direct recipe inputs for active list targets.

If both `comet_igniter` and another recyclable item can cover the same need, and the other item is not a direct recipe input for an active list target, the other item should be selected first. If every usable recycle candidate is a direct input for an active list target, the planner may still recommend one, but the UI must make the sacrifice explicit.

---

# 3. MODIFICATIONS

## CR-009.1 - Active Direct Recipe Input Set

### Affected Section
6. Core Planner Logic

### Rule
Before recycling candidate selection, the planner must compute an `activeDirectRecipeInputSet`.

An item belongs to `activeDirectRecipeInputSet` when:

- it appears directly in the `recipe` of any active-list final target, and
- that final target participates in the current planner run.

The set is based on direct parent recipes only. It must not include transitive depth-2 ingredients unless those ingredients are also direct inputs of another active-list final target.

Example:

```text
deadline -> comet_igniter
launcher_ammo -> crude_explosives
crude_explosives -> chemicals
```

If active lists contain `deadline` and `launcher_ammo`:

- `comet_igniter` is in `activeDirectRecipeInputSet`
- `crude_explosives` is in `activeDirectRecipeInputSet`
- `chemicals` is not in `activeDirectRecipeInputSet` solely because it crafts `crude_explosives`

---

## CR-009.2 - Recycle Candidate Grouping

### Affected Section
6. Core Planner Logic

### Rule
Recycle candidates must be partitioned into priority groups before applying the existing deterministic comparator.

Group A:

- candidate source item is not in `activeDirectRecipeInputSet`

Group B:

- candidate source item is in `activeDirectRecipeInputSet`

Selection order:

1. Choose from Group A if Group A contains any candidate that yields toward the current missing materials.
2. Choose from Group B only if Group A contains no usable candidate for the current recycle need.

Within each group, keep deterministic ordering.

Recommended comparator order:

1. Recycle source group, Group A before Group B.
2. Higher yield toward missing materials.
3. Higher coverage count.
4. Lower source item `value`.
5. Lower `itemId`.

Missing `value` is treated as `0`.

This use of `value` is not economic optimization. It is a deterministic sacrifice heuristic within otherwise equivalent recycle sources.

---

## CR-009.3 - Craft Before Recycling Direct Inputs

### Affected Section
6. Core Planner Logic

### Rule
When a missing direct input is locally craftable and its own recipe inputs are available or can be made available within existing depth and recycle constraints, the planner should prefer crafting that direct input before recycling Group B items.

This rule does not require unbounded search or full economic optimization. It applies within the existing depth-limited planner model.

Expected behavior:

- Missing `crude_explosives` for `launcher_ammo` should be crafted from `chemicals` when enough `chemicals` are available.
- Recycling `comet_igniter` for `crude_explosives` should be avoided when `comet_igniter` is a direct input for active-list `deadline` and crafting `crude_explosives` is possible.

---

## CR-009.4 - Group B Warning Provenance

### Affected Section
7.6 Crafting View

### Rule
Recycle actions that use a Group B source must expose enough metadata for the UI to display a warning in the Step 1 Recycle "Why" column.

Recommended shape:

```ts
interface RecycleAction {
  srcItemId: ItemId;
  qtyToRecycle: Qty;
  yields: Record<ItemId, Qty>;
  reasons: RecycleActionReason[];
  sourcePriorityGroup?: "normal" | "direct_recipe_input";
  sourcePriorityWarnings?: Array<{
    targetItemId: ItemId;
    targetItemName: string;
    listId: string;
    listName: string;
  }>;
}
```

The warning should be concise and action-oriented.

Preferred warning copy:

```text
Warning: also needed directly for List Name -> Target Item
```

If the source item is directly needed by multiple active-list targets, show the highest-priority target and indicate that more targets exist where practical.

---

# 4. ACCEPTANCE CRITERIA

1. Recycle candidate selection is deterministic for identical inputs.
2. A recyclable item that is not a direct recipe input for active list targets is selected before a direct recipe input when both can cover the current recycle need.
3. A direct recipe input may still be recycled when no non-direct-input candidate can cover the current recycle need.
4. Direct recipe input recycle actions are visibly warned in the Crafting view "Why" column.
5. Missing craftable direct inputs are crafted from available base materials before sacrificing Group B recycle candidates.
6. In the `launcher_ammo` / `crude_explosives` / `comet_igniter` case, available `chemicals` are used to craft `crude_explosives` before recycling `comet_igniter`.
7. If `explosive_compound` and `comet_igniter` can both satisfy the same recycle need, and only `comet_igniter` is a direct input for an active-list target, `explosive_compound` is selected first.
8. If two candidates are in the same group and have equivalent yield and coverage, lower `value` is selected before higher `value`.

---

# 5. TESTING REQUIREMENTS

Add planner tests covering:

- Group A recycle source beats Group B source with equivalent useful yield.
- Group B source is used only when no Group A source can satisfy the current recycle need.
- Lower `value` wins within the same recycle source group after yield and coverage ties.
- Craftable direct input is crafted from available base materials before recycling a Group B source.
- Group B recycle action includes warning metadata for the Crafting view.

Add UI or component-level coverage where practical for:

- Crafting Step 1 "Why" column renders a warning for Group B recycle actions.
- Normal Group A recycle actions do not render the direct-input warning.
