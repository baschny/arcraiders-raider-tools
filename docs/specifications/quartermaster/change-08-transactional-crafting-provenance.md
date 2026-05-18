# CHANGE REQUEST
## Quartermaster Specification Update - Transactional Crafting and Recycle Provenance

Document Type: Structured Delta vs Previous Specification
Scope: Quartermaster planner, recycle plan output, Crafting view reason display, and tests
Impact Level: Planner behavior correction plus UX clarification
Version: CR-Transactional-Crafting-Provenance-v1

---

# 1. SUMMARY

Quartermaster must only show Crafting view actions that belong to locally satisfiable targets.

The planner may simulate recycle and craft work while evaluating a target, but it must commit that work only after the final target is proven fully satisfiable. If the target is blocked by a missing raid-only ingredient, blueprint lock, bench level, missing bench, cycle guardrail, or unavailable sub-ingredient, simulated recycle and craft effects for that target must be discarded.

Recycle actions must also carry explicit action provenance. The Crafting view must explain why a recycle action is needed using committed planner provenance, not broad dependency lookup.

---

# 2. MOTIVATION

The current Crafting view can show confusing recycle reasons. A recycle action may be committed while evaluating an ultimately blocked target, and the "Why" column can then display dependency paths for that blocked target.

Example:

- The user needs `deadline` x3 and `heavy_shield` x1.
- `deadline` requires `arc_circuitry`.
- `heavy_shield` requires `power_rod` and `voltage_converter`.
- `power_rod` can use materials produced by recycling `vaporizer_regulator`.
- `voltage_converter` is missing and must be brought from raid.

The planner must not tell the user to recycle items for `heavy_shield`, because `heavy_shield` cannot be completed locally. The recycle recommendation should only explain actionable committed work, such as covering `arc_circuitry` for `deadline`.

---

# 3. MODIFICATIONS

## CR-008.1 - Transactional Per-Target Planning

### Affected Section
6. Core Planner Logic

### Rule
Planning for each final target must be transactional.

The planner may run phases A-D against a cloned or otherwise isolated planning state:

- Phase A - Direct Craft
- Phase B - Recycle Once for Direct Inputs
- Phase C - Indirect Craft
- Phase D - Recycle Once for Level-2 Inputs

The planner must commit the simulated state only when the final target is fully satisfiable.

### Must Not Commit Before Success

- recycle actions
- consumed quantities
- recycle yields added to availability
- depth-2 craft outputs
- final craft outputs
- craft steps

### Blocked Target Behavior

If a target is not fully satisfiable:

- discard simulated recycle and craft effects for that target
- do not show target-specific actions in the Crafting view
- still report remaining deficits for In Raid guidance and blocker summaries

Partial craft steps may only be emitted when they are independently actionable and not dependent on speculative recycling for a blocked final target.

---

## CR-008.2 - Recycle Action Provenance

### Affected Section
6.8.5 Recycling Plan

### Rule
Each committed recycle action should expose planner provenance sufficient for the UI to explain the action without recomputing broad dependency chains.

Recommended shape:

```ts
interface RecycleActionReason {
  listId: string;
  listName: string;
  targetItemId: ItemId;
  targetItemName: string;
  producedItemId: ItemId;
  producedItemName: string;
  chainItemIds: ItemId[];
  chainLabel: string;
  quantityCovered: Qty;
}

interface RecycleAction {
  srcItemId: ItemId;
  qtyToRecycle: Qty;
  yields: Record<ItemId, Qty>;
  reasons: RecycleActionReason[];
}
```

`reasons` must describe the committed target work that the recycle action supports.

The reason chain should be short and actionable:

```text
Final Target -> Needed Material
Final Target -> Intermediate Craft -> Needed Material
```

The reason must not include targets that were simulated but not committed.

---

## CR-008.3 - Crafting View "Why" Column

### Affected Section
7.6 Crafting View

### Rule
The Step 1 Recycle "Why" column must render committed `RecycleAction.reasons`.

It must not use broad item insight dependency matching as the primary source for recycle action explanations.

The Recycle "Why" column must not show:

- blocked targets
- simulated-but-discarded targets
- dependency paths whose final target is not locally satisfiable
- `COMPLETE` status badges for completed intermediate paths

The preferred label is:

```text
List Name -> Target Item
Target Item -> Needed Material
```

If a recycle action supports multiple committed targets, show one concise row per committed target/material pair, deduplicated by:

```text
listId + targetItemId + producedItemId + chainItemIds
```

---

# 4. ACCEPTANCE CRITERIA

1. A target blocked by a missing raid-only ingredient does not emit recycle actions solely for that target.
2. A recycle action created for `deadline` must not list `heavy_shield` as a reason when `heavy_shield` is blocked by missing `voltage_converter`.
3. The Crafting Step 1 "Why" column no longer displays `COMPLETE` badges.
4. Recycle reasons are derived from committed planner provenance, not from broad dependency insight lookup.
5. Existing In Raid guidance still reports missing raid-only materials for blocked targets.
6. Planner output remains deterministic for identical inputs.

---

# 5. TESTING REQUIREMENTS

Add planner tests covering:

- blocked target simulation does not commit recycle actions
- successful target still commits necessary recycle actions
- mixed case where one target is satisfiable and another target is blocked
- recycle action reasons mention only committed satisfiable targets

Add UI or component-level coverage where practical for:

- Recycle "Why" rows render action reasons
- `COMPLETE` badges are absent from Step 1 recycle reasons
