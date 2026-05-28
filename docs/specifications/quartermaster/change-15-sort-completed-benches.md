# Change Request 15: Move Completed Benches to Bottom

## Status
- **Date**: 2026-05-22
- **Status**: Implemented
- **Area**: Quartermaster Hideout View

## Context & Problem
Currently, hideout benches are sorted according to a fixed predefined order (`HIDEOUT_MODULE_ORDER`) or alphabetically. When a user completes all tiers of a bench, it remains in its original position, which can push pending benches further down the list and increase scrolling.

## Proposed Changes
Update the bench sorting logic in `HideoutView.tsx` to:
1. Identify benches that are "complete" (current level >= max level).
2. Move completed benches to the end of the list.
3. Within the "incomplete" and "complete" groups, maintain the existing sorting order (`HIDEOUT_MODULE_ORDER` first, then alphabetical).

## Technical Implementation

### Components
- **HideoutView.tsx**:
    - Modify the `sortedDefinitions` sorting logic.
    - The sort function will now first compare the "completed" status of each bench.
    - Incomplete benches (where `currentLevel < maxLevel`) will have a higher priority (appear first).
    - If both benches have the same completion status, fall back to the existing `HIDEOUT_MODULE_ORDER` and alphabetical comparison.

## Verification Plan
1. **Functional Check**: Verify that benches with all tiers completed are moved to the bottom.
2. **Order Check**: Ensure that among incomplete benches, the original order (Scrappy -> Workbench -> etc.) is preserved.
3. **Dynamic Update**: Verify that when a bench becomes completed (simulated by state change if possible), it moves to the bottom upon re-render.
