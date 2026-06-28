# Change 32 - Crafting View Usability

## Status
Proposed

## Problem

The Crafting view currently exposes the correct planner data, but several table and tooltip presentation details make the workflow harder to scan:

- Small table icons become crowded by owned-quantity and priority-star overlays.
- "Inputs Needed" shows required quantities but does not explicitly show how many the user owns once the icon quantity overlay is removed.
- Item priority can only be toggled from the icon star, which is cramped in small table contexts.
- Tooltips can remain open after the user moves away or clicks elsewhere.
- Crafting output is split across "Craft Times" and "Total Output", which adds width without adding much clarity.
- The "Why" column repeats verbose chain text instead of showing compact list/target context.
- Recycle rows show yielded materials, but the material being targeted by the committed recycle action is not visually emphasized.

## Required Behavior

### R1 - Cleaner, Larger Crafting Table Icons

In the Crafting view, item icons shown inside these columns must render larger than the current extra-small size:

- "Why"
- "Inputs Needed"
- "Yields"

For these table-context icons:

- Do not show the owned-quantity overlay.
- Do not show the priority-star overlay.
- Keep the item tooltip available unless the icon is rendered inside an existing tooltip.
- Preserve rarity border/background styling.

This is a Crafting view table presentation exception only. General Quartermaster icon rules remain unchanged elsewhere.

### R2 - Explicit Required vs Owned Input Quantities

Every "Inputs Needed" material row must show the required and owned quantities explicitly.

Required format:

```text
Use 6 / Have 2
```

Rules:

- `Use` is the total input quantity consumed by that row.
- `Have` is the canonical owned quantity returned by the existing owned-quantity source.
- If owned quantity is unknown, display `Have ?`.
- This text replaces reliance on the icon owned-quantity overlay in Crafting table input rows.

### R3 - Priority Toggle in Item Tooltip

The item tooltip header must include an icon-only priority star below the existing type and rarity badges.

Rules:

- The action uses the same priority state and toggle behavior as the item icon star.
- The action exposes "Mark as Priority Target" / "Remove from Priority Targets" through the star button tooltip and accessible label.
- The action should be usable from any tooltip opened with Quartermaster planning context.
- The existing icon star may remain in normal icon contexts, but Crafting table presentation may suppress it per R1.

### R4 - Tooltip Outside-Click Close

When an item tooltip is open, clicking any surface outside the tooltip must close it.

Rules:

- Clicking the source item icon counts as outside the tooltip and closes the tooltip.
- Clicking elsewhere in the page also closes the tooltip.
- Clicking inside the tooltip must not close it.
- Tooltip hover behavior may still keep the tooltip open while the pointer is over the tooltip.

### R5 - Combined Craft Output Column

Normal craft-step tables must replace the separate "Craft Times" and "Total Output" columns with one output column.

Display rules:

- Always show the total output quantity as the primary value.
- If craft count equals total output, show only the primary value.
- If total output is a multiple of craft count and the values differ, show a secondary muted line below the primary value:

```text
40
2x crafts
```

The secondary craft-count line exists only when it adds explanatory value.

### R6 - Compact "Why" Column

The Crafting view "Why" column must use compact rows modeled after the item tooltip right-column planning rows.

For direct final-list needs, each row shows:

- list-type icon
- list name
- required quantity badge, for example `3x`
- missing/needed badge, using the existing red "needed" style when missing

For crafting dependencies that support another target item, the target item appears as a compact header outside the list card layout. The rows below that header use the same card format as direct final-list needs:

- target item small icon
- target item name
- then the same list-type icon, list name, required quantity badge, and missing/needed badge

The verbose chain text is not shown in the Crafting view "Why" column.

### R7 - Visual Recycle Yield Highlighting

In Recycle rows, every yielded item referenced by the action's committed recycle reasons must be visually highlighted in the "Yields" column.

Rules:

- Use a subtle blue/accent border and background treatment.
- Highlight every yielded item whose item ID appears as a committed reason `producedItemId`.
- This visual highlighting replaces the need to display full chain granularity in the "Why" column.
- Do not highlight advisory-only recycle/salvage provenance that was not committed as part of the recycle action.

## Design Notes

- The existing planner data appears sufficient for this change:
  - `ItemInsight.finalListNeeds` has list type, list name, required quantity, missing quantity, and completion state.
  - `ItemInsight.craftingNeeds` has list type, list name, target item, target rarity, chain metadata, and completion state.
  - `RecycleAction.reasons` includes committed `producedItemId` values for yield highlighting.
- The implementation should prefer shared rendering helpers inside `CraftingView` rather than changing planner output.
- New user-facing strings must be added only to `src/shared/i18n/locales/en.json`. Non-English locale files are Crowdin-managed and must not be edited manually.

## Implementation Plan

1. Update the main Quartermaster specification to describe the Crafting view table-icon exception, explicit input quantity wording, combined output column, compact "Why" rows, recycle yield highlighting, and tooltip priority/outside-click behavior.
2. Extend `ItemIcon` with presentation controls needed by table contexts, such as suppressing the priority action independently from the tooltip and suppressing quantity overlays.
3. Extend `ItemTooltip` to show the priority toggle action and wire it to the existing `usePrioritizedItems` state.
4. Add robust outside-click handling so open tooltips close when the user clicks outside the tooltip, including on the source icon.
5. Refactor `CraftingView` rendering helpers:
   - render Crafting table icons at the new table size without quantity/star overlays
   - render input material rows with `Use N / Have M`
   - render compact Why rows from item insights and action reasons
   - render committed recycle yield highlights
   - replace Craft Times + Total Output with one output column
6. Update SCSS for the new icon sizing, input quantity text, output column, compact why rows, tooltip priority action, and yield highlight state.
7. Run `npm run build` to verify TypeScript and translation JSON validity.

## Non-Goals

- Do not change planner calculations, recycle commitment logic, target priority ordering, or owned quantity semantics.
- Do not edit Crowdin-managed locale files.
- Do not remove priority-star behavior from non-Crafting contexts.
- Do not add browser/dev-server testing as part of this change; the project workflow asks agents not to start local webservers for Quartermaster work.
