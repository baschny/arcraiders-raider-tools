# CHANGE REQUEST
## Quartermaster Specification Update - Simplify Recycle/Salvage Yield Highlighting

Document Type: Structured Delta vs Previous Specification
Scope: Item tooltip rendering, item insights computation, CSS styling
Impact Level: Removal of unused visual feature and associated computation
Version: CR-Simplify-Recycle-Salvage-v1

---

# 1. SUMMARY

Remove the "needed" highlighting (cyan border + Target icon) from recycle/salvage yield items in the item tooltip. Remove the associated "Needed via Recycle/Salvage" status section from the tooltip. Remove the `addRecycleAndSalvageNeeds()` computation and related insight fields (`neededRecycleYieldIds`, `neededSalvageYieldIds`, `recycleSalvageNeeds`).

The recycle/salvage yield lists in the tooltip will continue to render as flat, unhighlighted item lists. Recycling/salvage goal guidance will be revisited in a future change.

---

# 2. MOTIVATION

The current highlighting of recycle/salvage yields adds visual noise without providing actionable guidance. The cyan border and Target icon are not explained anywhere in the UI, making them confusing rather than helpful. This feature will be revisited later with clearer UX.

---

# 3. MODIFICATIONS

## CR-018.1 - Recycle/Salvage Yield Highlighting Removal

### Affected Section
UX Spec Section 3.5 (Tooltip Crafting Sections)

### Rule
Remove the requirement:
> If an output contributes to crafting needs:
> - highlight using color
> - include indicator icon

Replace with:
> Recycle and salvage yield items are displayed as a flat, unhighlighted list. Crafting contribution highlighting may be added in a future iteration.

---

## CR-018.2 - Recycle/Salvage Needs Section Removal

### Affected Section
UX Spec Section 3.6 (Tooltip Status Information)

### Rule
Remove the "Needed via Recycle/Salvage" status information section. This section derived its data from the same `addRecycleAndSalvageNeeds()` computation that is being removed.

---

## CR-018.3 - ItemInsights Fields Removal

### Affected Section
6. Core Planner Logic

### Rule
Remove the `addRecycleAndSalvageNeeds()` function and its invocation from `buildItemInsights()`. Remove the following fields from `ItemInsight`:
- `neededRecycleYieldIds`
- `neededSalvageYieldIds`
- `recycleSalvageNeeds`

This computation is only used by the tooltip rendering being removed. No other code depends on these fields.

---

# 4. ACCEPTANCE CRITERIA

1. Item tooltip Recycles Into and Salvages Into sections render as flat lists without cyan borders or Target icons.
2. The "Needed via Recycle/Salvage" status section no longer appears in the tooltip.
3. `addRecycleAndSalvageNeeds()` is removed from the codebase.
4. `buildItemInsights()` no longer calls the removed function.
5. Build passes with no compilation errors.
6. No test regressions.
7. Specification is updated to reflect the new behavior.

---

# 5. TESTING REQUIREMENTS

No new tests required. Existing tests for `buildItemInsights` may need minor updates if they assert on field presence. Verify the build succeeds after removal.