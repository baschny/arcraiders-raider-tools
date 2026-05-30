# Change-22: Durability & Repair Planning

## Status
Implemented

## Summary
Add item durability tracking and repair material planning to Quartermaster. Items with `repairCost` are displayed with per-instance durability bars. A repair pre-pass runs before the greedy planner to reserve materials for repairing items below 30% durability.

## Motivation
Weapons and shields degrade with use. Quartermaster should:
1. Show durability on owned items
2. Plan repair material consumption before recycling/crafting
3. Report repair material deficits in In Raid view

## Requirements

### Data Import (R1)
- Import `repairCost` and `repairDurability` from upstream item data
- Include both fields in generated `items.*.json` files

### Unstacked Display (R2)
- Items with `repairCost` are displayed as separate rows per instance
- Each instance preserves its own `durabilityPercent`
- Durability bar rendered with color coding (red < 30%, yellow 30-70%, green > 70%)

### Repair Planning (R3)
- Pre-pass before greedy planner: consume repair materials from owned inventory for items below 30% durability
- Only items appearing in enabled lists are repaired
- Insufficient materials result in deficits reported to the user
- Repair material items are protected from recycling

### UI Integration (R4)
- StashView: Durability bars, unstacked rows, repair-aware useless filter
- CraftingView: New "Repair" section before Recycle section
- ItemTooltip: "Needed for Repair" section in right column
- InRaidView: Repair material deficits flow through `remainingIngredientDeficits`

### Item Insights (R5)
- `ItemInsight.repairNeeds` added for both repaired items and repair materials
- Useless detection respects `repairNeeds`

## Design Decisions

### Unstacking vs Aggregation
Items with `repairCost` are unstacked (one row per instance) because each instance has different durability. Items without `repairCost` continue to aggregate as before.

### Repair Threshold
Fixed at 30% durability — items below this threshold trigger repair actions.

### Material Protection
Repair materials are added to `protectedFromRecycle` to prevent the greedy planner from recycling them.

### Repair Pre-Pass Order
Repair runs before the greedy planner and consumes materials from the shared `avail` pool, reducing availability for crafting. This prevents the planner from using repair materials for crafting.

## Files Changed

| File | Change |
|------|--------|
| `scripts/quartermaster-import.ts` | Import `repairCost`/`repairDurability` |
| `src/apps/quartermaster/types/item.ts` | Add fields to `PlannerItem` |
| `src/apps/quartermaster/types/planner.ts` | Add `RepairPlan`, `RepairAction`, durability fields |
| `src/apps/quartermaster/utils/api.ts` | Unstack durable items in aggregation |
| `src/apps/quartermaster/utils/planner/repairPlanner.ts` | **NEW** Repair pre-pass algorithm |
| `src/apps/quartermaster/utils/planner/index.ts` | Integrate repair into `computePlan` |
| `src/apps/quartermaster/utils/planner/greedyPlanner.ts` | Accept and protect repair material IDs |
| `src/apps/quartermaster/utils/itemInsights.ts` | Add `repairNeeds` field |
| `src/apps/quartermaster/components/views/StashView.tsx` | Durability bars, unstacked display |
| `src/apps/quartermaster/components/views/CraftingView.tsx` | Repair section |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | "Needed for Repair" section |
| `src/apps/quartermaster/styles/_stash-view.scss` | Durability bar styles |
| `src/apps/quartermaster/styles/_crafting-view.scss` | Durability text styles |
| `src/shared/i18n/locales/en.json` | New translation keys |
| `docs/sample/items/bobcat_i.json` | Added `repairCost`/`repairDurability` |
| `src/apps/quartermaster/utils/planner/__tests__/repairPlanner.test.ts` | **NEW** 11 test cases |

## Test Coverage
- 11 unit tests for repair planner covering: threshold, list membership, deficits, material consumption, determinism, sort order, material protection, missing durability default
