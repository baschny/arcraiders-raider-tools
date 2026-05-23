# Change Request 14: Hideout Usability Improvements

## Status
- **Date**: 2026-05-23
- **Status**: Implemented
- **Area**: Quartermaster Hideout View

## Context & Problem
The current "Hideout" view in the Quartermaster app has several usability issues:
1. **Vertical Bloat**: Expanding multiple benches creates a very long, overwhelming list.
2. **Rigid Layout**: The current 4-5 column layout for tiers results in unequal column sizes and wasted space.
3. **Messy Headers**: Tier headers are cluttered with badges (Completed, Next, Eye button) that often overlap.
4. **Item Card Scale**: Item cards are too large (150px height), making the overview difficult.

## Proposed Changes

### 1. Flowing Tier Blocks
- Replace the rigid column layout with a "Flowing Blocks" model.
- Each Tier (Header + Items) is a self-contained card-like unit.
- These units will wrap naturally using flexbox (`flex-flow: row wrap`) to fill the available width of the bench section.
- Tiers will no longer be forced into fixed columns.
- **Single-Item Optimization**: Tiers requiring only one item will use a reduced minimum width to maximize horizontal density.

### 2. Compact Vertical Item Cards
- Redesign item cards within the Hideout view to be significantly smaller.
- **Layout**: Vertical stack (Icon on top, Name below).
- **Icon**: Use `sm` size (approx 48px).
- **Name**: Small font size, max 2 lines.
- **Missing Badge**: Integrate the red "missing" circle (from In Raid view) as an overlay on the item icon, showing the deficit quantity.
- **Completion Badge**: The green "completed" checkmark is now an overlay in the upper-right corner of the item icon, consistent with the missing badge's position.
- **Need Label**: Remove the explicit "NEED: X" text label in favor of the red badge.

### 3. Streamlined Tier Headers
- Slim down the tier header within the block.
- Clearly separate the Tier Name/Level from status badges.
- Use subtle visual cues for "NEXT" (accent blue border and subtle glow) instead of the explicit "NEXT" pill.
- Ensure the "Enable/Disable" eye button has a consistent, non-overlapping position.

### 4. Visual Polish
- De-emphasize completed tiers (e.g., reduced opacity or grayscale) to keep the focus on pending upgrades.
- Add sticky behavior to the main Bench Headers so users maintain context while scrolling through many tiers.

## Technical Implementation

### Components
- **HideoutView.tsx**:
    - Update the JSX structure to wrap tiers in a flex container.
    - Refactor the item rendering loop to use the new compact card layout.
    - Integrate the red "missing" badge logic using `plannerResult.deficit`.

### Styles
- **_hideout-view.scss**:
    - `.hideout-view__upgrade-list`: Change to `display: flex; flex-wrap: wrap;`.
    - `.hideout-view__upgrade`: Define as a compact block with fixed/min width. Add `--single` modifier for ultra-compact single-item tiers.
    - `.hideout-view__item`: Complete redesign for the compact vertical card.
    - `.hideout-view__item-missing-badge`: New style for the red circle (mirrored from `_in-raid-view.scss`).
    - Add sticky positioning for `.hideout-view__module-header`.

## Verification Plan
1. **Visual Check**: Verify that tiers wrap correctly on different screen widths.
2. **Density Check**: Ensure that an expanded bench with all tiers visible fits significantly more information on screen than before.
3. **Functional Check**: Verify that toggling items/tiers/benches still works correctly.
4. **Alignment**: Ensure the "missing" count matches the red circle in the In Raid view for the same items.
