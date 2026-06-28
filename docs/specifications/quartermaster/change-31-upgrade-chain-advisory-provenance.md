# Change 31 - Upgrade Chain Advisory Provenance

## Status
Proposed

## Problem

Quartermaster currently treats higher-tier upgrade-chain targets as stepwise crafting plans for executable planning, but advisory provenance does not fully behave as if the target can be built from scratch.

Example:

- An active list requires `Hullcracker IV x2`.
- The user already owns `Hullcracker IV x2`.
- The target is complete, so no executable craft or upgrade steps are needed.
- `Magnetic Accelerator`, which is required to craft the Tier I base weapon, no longer appears as a crafting material for `Hullcracker IV`.
- `Magnetron`, which can recycle into `Magnetic Accelerator`, no longer shows why it may be useful.

This makes base-chain materials and their recycle/salvage sources look disposable even though they are part of the active desired item's crafting family.

## Required Behavior

### R1 - Advisory Recipe for Upgrade Chains

Quartermaster must define an advisory dependency recipe for item relevance, provenance, and tooltips.

For any item that is part of an upgrade chain:

- Walk backward through `upgradesFrom` links to the base item.
- Include the base item's direct `recipe`, if any.
- Walk forward from the base item to the target item through `upgradesTo`.
- Include each intermediate target item's `upgradeCost` through the requested target.
- Treat the resulting material map as a single virtual recipe for advisory dependency traversal.

For items that are not part of an upgrade chain, advisory dependency traversal continues to use the current recipe behavior.

This behavior is generic to upgrade chains. The current known use case is weapons, but the implementation must not rely only on weapon-specific fields such as `weaponTier` or `weaponBaseId` when `upgradesFrom` / `upgradesTo` metadata is sufficient.

### R2 - Advisory Only, Not Executable Planning

The virtual one-step recipe must not replace executable planner behavior.

- The Crafting view must continue to show real craft steps and weapon upgrade steps separately.
- The greedy planner must continue to consume owned exact-tier and lower-tier weapons according to existing stepwise upgrade rules.
- Planner deficits, `planRows`, and target completion must remain based on actual owned items and executable planning.
- Already-complete targets must remain complete and must not produce missing material deficits.

### R3 - Active Desired Targets Drive Advisory Provenance

Advisory upgrade-chain dependencies apply to active required targets even when the required target is already fully owned.

Example:

- List requires `Hullcracker IV x2`.
- User owns `Hullcracker IV x2`.
- Hovering `Magnetic Accelerator` must still show `Hullcracker IV` under `Needed for Crafting`.
- The row badge remains `Complete`, because the list target is already satisfied.

Owned lower-tier weapons do not reduce advisory dependency provenance. The advisory recipe is based on the active desired target count from scratch, while executable planning remains free to optimize from owned lower-tier weapons.

### R4 - Direct Ingredient Recycle Priority

Direct cumulative ingredients from the advisory recipe must participate in the same recycle-priority demotion as current direct recipe inputs.

Example:

- `Magnetic Accelerator` is part of the advisory recipe for active `Hullcracker IV`.
- `Magnetic Accelerator` is treated as a direct recipe input for recycle source priority.
- It is avoided while normal recycle candidates exist.
- It may still be recycled as a fallback when that matches existing direct-recipe-input behavior.

This is not hard protection. It extends the existing lower-priority direct input behavior.

### R5 - Deep Dependency Traversal

After an advisory recipe is computed for an upgrade-chain target, dependency traversal must continue recursively through craftable ingredients using existing depth limits and cycle guardrails.

Example:

- `Hullcracker IV` advisory recipe includes `Magnetic Accelerator`.
- If `Magnetic Accelerator` has its own recipe, its ingredients also receive advisory crafting provenance for `Hullcracker IV`.

### R6 - Recycle and Salvage Source Provenance

Items whose `recyclesInto` or `salvagesInto` yields can produce an advisory dependency material must receive optional-use provenance.

Example:

- `Magnetron` recycles into `Magnetic Accelerator`.
- `Magnetic Accelerator` is an advisory dependency of active `Hullcracker IV`.
- Hovering `Magnetron` shows `Could be used for` `Hullcracker IV`.
- `Magnetron` is considered relevant by the Stash useless filter.

Recycle/salvage source provenance is advisory only:

- It affects tooltip relevance and usefulness classification.
- It does not hard-protect the source item from recycling.
- It does not demote the source item in recycle priority merely because it can yield a useful material.
- Actual recycle instructions still come from committed planner recycle actions.

Recycle and salvage provenance should stay combined in the existing `Could be used for` user experience for simplicity and consistency across shared item tooltips.

### R7 - In Raid Suggestions

In Raid suggestions may use expanded advisory provenance only through existing suggestion rules.

- If an advisory dependency item is relevant to an active target and that target is unresolved, existing In Raid provenance-based suggestions may include it.
- Already complete or satisfiable targets must not create new In Raid suggestions solely because they have advisory upgrade-chain dependencies.

### R8 - Tooltip and UI Copy

This change must not add new visible copy unless implementation proves it necessary.

- `Needed for Crafting` remains the section for direct and deep crafting provenance.
- `Could be used for` remains the section for recycle/salvage source provenance.
- Complete targets keep the `Complete` badge.
- Missing or incomplete targets keep existing needed/missing status behavior.
- The tooltip does not need to show cumulative material quantities in this change.

## Design Notes

The implementation should make advisory behavior explicit, for example with a helper such as:

```ts
getAdvisoryDependencyRecipe(item, itemsMap)
```

Callers that build provenance, item insights, In Raid provenance, and direct-recipe-input recycle demotion can opt into this helper. Executable crafting and upgrade planning should continue to use the existing concrete recipe and upgrade-step logic.

## Implementation Plan

1. Update the main Quartermaster specification to describe advisory upgrade-chain dependency recipes and their boundaries.
2. Add an advisory dependency recipe helper in the planner/provenance utilities.
3. Use the helper from dependency walking and provenance calculation.
4. Extend direct recipe input recycle-priority detection to include direct advisory recipe ingredients for active targets.
5. Add advisory recycle/salvage source provenance for tooltip relevance without changing committed recycle actions.
6. Add regression tests covering:
   - Complete `Hullcracker IV x2` still marks Tier I materials as `Needed for Crafting`.
   - Complete `Hullcracker IV x2` keeps the target badge `Complete`.
   - A recycle source such as `Magnetron` gets `Could be used for` provenance.
   - Direct cumulative ingredients are demoted as direct recipe inputs.
   - Crafting view output remains stepwise and unchanged.
   - In Raid suggestions do not appear for already-complete targets solely due to advisory provenance.

## Non-Goals

- Do not show cumulative material quantities in `Needed for Crafting`.
- Do not replace weapon upgrade steps with synthetic craft steps.
- Do not make recycle/salvage source items hard-protected from recycling.
- Do not make owned lower-tier weapons subtract from advisory provenance.
- Do not add context-specific salvage behavior between Stash and In Raid in this change.
