# Change Request 20: Deep Dependency Suggestions & Recycling Provenance

**Status:** Implemented
**Date:** 2026-05-28

## Summary

Three coordinated improvements to surface deep crafting dependencies (Level-2+ ingredients) and recycling provenance throughout the Quartermaster app:

1. **Tooltip overlay**: Restored the recycle/salvage "why" context removed in Change-18, rephrased as *"Could be used for"* (optional/advisory tone) instead of *"Needed via"*.
2. **In-Raid view**: Added a third suggestion section ("Craftable Materials") for deep crafting ingredients (items that can be crafted into needed materials), giving them their own dedicated space.
3. **Greedy planner**: Enabled partial target satisfaction with recycling — instead of discarding all recycle/craft actions when a target isn't fully satisfiable, the planner commits whatever portion CAN be satisfied using all available strategies (recycling + L2 crafting).

## Motivation

### Gap 1 — Missing provenance in tooltips
Change-18 removed `addRecycleAndSalvageNeeds()` and the "Needed via Recycle/Salvage" tooltip column to simplify the view. This also removed the only explanation of WHY a recycle/salvage yield matters to the user's planning goals. Users see flat lists of yields without understanding which ones help toward their active targets.

### Gap 2 — Missing deep ingredients in In-Raid
The In-Raid pipeline (`inRaidSuggestions.ts`) only checks three conditions:
1. `deficit[itemId] > 0` — direct missing material
2. `salvagesInto` a needed material
3. `recyclesInto` a needed material

There is no check for *"this item is a crafting ingredient for something with a deficit"*. The planner's deficit map only contains Level-1 ingredients of unsatisfied targets. Level-2 ingredients (e.g., `arc_alloy` for `arc_circuitry` → `deadline`) are never surfaced.

### Gap 3 — Planner discards valid recycle actions
The greedy planner's transactional model (spec §6.4) requires ALL of a target's remaining quantity to be satisfiable before committing any actions. When the full quantity fails, the trial state is discarded — including recycle actions that COULD have satisfied a subset. The fallback partial craft only uses directly available L1 materials (no recycling, no L2 crafting).

## Design Decisions

### Fix A: "Could be used for" phrasing

The previous "Needed via Recycle/Salvage" implied the item was required. The new phrasing "Could be used for" conveys that the recycle/salvage yield is an optional path toward a goal — it's a suggestion, not a mandate.

**Data shape:**

```typescript
export interface ItemRecycleSalvageUsage {
  listId: string;
  listName: string;
  listType: 'user' | 'hideout';
  yieldItemId: string;
  yieldItemName: string;
  yieldQuantity: number;
  targetItemId: string;
  targetItemName: string;
  targetItemRarity: string;
  chainLabel: string;
  isComplete: boolean;
}
```

Added to `ItemInsight`:
```typescript
export interface ItemInsight {
  finalListNeeds: ItemFinalListNeed[];
  craftingNeeds: ItemCraftingNeed[];
  recycleSalvageUsages: ItemRecycleSalvageUsage[];  // NEW
}
```

### Fix B: Third In-Raid section ("Craftable Materials")

New `InRaidReason`: `CRAFTING_INGREDIENT_FOR_DEFICIT`

**Selection logic**: For each item in the provenance map:
- Item is in `provenanceMap` (deep dependency of a target)
- `deficit[itemId] <= 0` (not already suggested as a direct material)
- Item's `impactedTargetItemIds` includes at least one target with a deficit that is NOT satisfiable
- Item is NOT in non-recyclable categories

**Section ordering**:
1. Priority Targets
2. Direct Targets — Bring Home
3. Crafting Materials
4. **Craftable Materials** (NEW)

### Fix C: Iterative partial target satisfaction

Binary search over decreasing quantities to find the maximum satisfiable quantity using the full pipeline (recycling + L2 crafting):

```
need = required - owned
if !trySatisfyFull(need):
  // Binary search: lo=0, hi=need-1
  bestQty = binarySearchMaxSatisfiable(lo, hi, trySatisfyFull)
  if bestQty > 0:
    commit trySatisfyFull(bestQty)  // includes recycle + L2 craft actions
  // Fallback: partial craft from direct avail for remaining need
```

## Affected Files

| File | Change |
|------|--------|
| `src/apps/quartermaster/types/planner.ts` | Added `ItemRecycleSalvageUsage` type, `CRAFTING_INGREDIENT_FOR_DEFICIT` reason |
| `src/apps/quartermaster/utils/itemInsights.ts` | Added `recycleSalvageUsages` field + `addRecycleSalvageUsages()` |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | New "Could be used for" section in right column |
| `src/apps/quartermaster/utils/planner/greedyPlanner.ts` | Extracted `completeTargetSatisfaction()`, binary search loop in main loop |
| `src/apps/quartermaster/utils/planner/inRaidSuggestions.ts` | Pipeline 4: provenance-based deep ingredient suggestions |
| `src/apps/quartermaster/components/views/InRaidView.tsx` | New "Craftable Materials" section |
| `src/shared/i18n/locales/en.json` | New keys: `couldBeUsedFor`, `craftableMaterials` |
| `docs/specifications/quartermaster/specification-quartermaster.md` | Updated tooltip §3.6, In-Raid §4.5, Planner §6.4 |
