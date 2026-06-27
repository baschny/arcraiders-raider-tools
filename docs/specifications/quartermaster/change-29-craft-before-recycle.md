# Change-29: Prefer Crafting from Lower-Tier Materials Over Recycling Higher-Tier Items

## Status
Approved

## Summary
The greedy planner currently runs Phase B (recycle for missing L1 ingredients) before Phase C (craft missing L1 ingredients from base materials). This causes the planner to recycle higher-tier items (e.g., Magnetic Accelerator) to obtain materials that could instead be crafted from lower-tier base materials (e.g., ARC Motion Core from ARC Alloy). The fix: in Phase B, only recycle for L1 ingredients that are NOT craftable. Craftable L1 ingredients are left for Phase C.

## Motivation
- A user needing ARC Motion Core who owns Magnetic Accelerator (recycles into AMC) and ARC Alloy (crafts into AMC) sees "Step 1: Recycle Magnetic Accelerator" instead of "Craft ARC Motion Core from ARC Alloy".
- Recycling a higher-tier Epic item (MA, value 5500) to obtain a Rare item (AMC, value 1000) that can be crafted from 8 Uncommon ARC Alloy (value 200 each) is wasteful.
- Users expect the planner to prefer using raw/base materials over sacrificing complex crafted items.

---

## Requirements

### R1 — Filter Phase B Recycling to Uncraftable Ingredients Only

**File(s)**: `src/apps/quartermaster/utils/planner/greedyPlanner.ts`

**Change type**: modification

**Detail**: In `completeTargetSatisfaction`, before calling `recycleForNeeded` in Phase B (line 982-986), filter `missingL1` to only include items that are NOT craftable. An item is "not craftable" if: (a) it has no recipe, (b) it has no craftBench, (c) it is blueprint-locked, or (d) the bench level is insufficient. Use the existing `canCraft()` predicate.

For each itemId in `missingL1`:
- If the item exists, has a recipe, and `canCraft()` returns `{ ok: true }` → exclude from Phase B (let Phase C handle it).
- Otherwise → include in Phase B for recycling.

After the initial recycle, the existing Phase C logic (line 999-1006) handles the remaining craftable deficits.

### R2 — Same Filter in satisfyMaterialNeeds

**File(s)**: `src/apps/quartermaster/utils/planner/greedyPlanner.ts`

**Change type**: modification

**Detail**: Apply the same filter to the initial `recycleForNeeded` call in `satisfyMaterialNeeds` (line 755-759), which handles ingredient deficits for weapon upgrade paths. Only recycle for needed items that are not craftable.

### R3 — Update Tests

**File(s)**: `src/apps/quartermaster/utils/planner/__tests__/blueprintCraftability.test.ts`

**Change type**: modification

**Detail**: 
- Test "prefers non-direct recycle sources over direct recipe inputs for active targets" (line ~587): With the fix, `crude_explosives` is craftable from `chemicals`, so the planner no longer recycles `spare_recycler` for it. The expected result changes from 1 recycle action to 0 recycle actions, with the deficit handled by crafting instead.
- Test "uses direct recipe input recycle sources as a warned fallback" (line ~619): Same reason — `crude_explosives` is craftable, so `comet_igniter` is no longer recycled. Expected recycle actions changes to 0.

Verify all other tests still pass without modification.

---

## Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/apps/quartermaster/utils/planner/greedyPlanner.ts` | Phase B in `completeTargetSatisfaction` and initial recycle in `satisfyMaterialNeeds`: filter to uncraftable items only |
| `src/apps/quartermaster/utils/planner/__tests__/blueprintCraftability.test.ts` | Update 2 test expectations from "recycles" to "prefers craft" |

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|------------------|
| L1 ingredient has no recipe (base material, e.g., `metal_parts`) | Remains eligible for Phase B recycling — no change from current |
| L1 ingredient has recipe but bench is locked/insufficient | Not craftable → eligible for Phase B recycling |
| L1 ingredient has recipe and bench, but base materials insufficient | Phase B excludes it (it's craftable). Phase C tries to craft, fails (not enough materials). Falls through to `missingWithoutPendingCrafts` → then recycled. Correct fallback. |
| L1 ingredient is craftable AND there are surplus recycle candidates that also yield it | Crafting is preferred. Recycle candidates not used for this ingredient. |
| Upgrade path ingredient deficits (satisfyMaterialNeeds) | Same logic applied — craft before recycle. |
| Direct recipe inputs of other targets (Group B, `activeDirectRecipeInputSet`) | No change — they were already deprioritized by source priority grouping. The additional craftability filter applies in addition to the existing Group A/Group B distinction. |

---

## Rollout Strategy

1. **Phase 1**: Apply R1 filter in `completeTargetSatisfaction` Phase B.
2. **Phase 2**: Apply R2 filter in `satisfyMaterialNeeds` initial recycle.
3. **Phase 3**: Update tests per R3.
4. **Phase 4**: Run full test suite (`npm test`), verify no regressions.
