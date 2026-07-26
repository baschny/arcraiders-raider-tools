# Change 40 - Solid Hideout Sticky Headers

## Status

Implemented

## Problem

Expanded Hideout bench headers remain sticky at the top of the Hideout scroll
container, but their backgrounds are translucent. Upgrade content scrolling
under a header remains visible through both its normal and interactive
hover/focus states.

The Projects view already uses the desired opaque sticky-header treatment.

## Required Behavior

- Hideout bench headers remain sticky with their existing position and stacking
  behavior.
- The normal sticky-header background is fully opaque.
- The hover and keyboard-focus backgrounds are fully opaque.
- Upgrade content scrolls underneath the header without showing through it.
- Existing collapse behavior, disabled/completed treatments, text colors,
  borders, and header layout remain unchanged.
- Use the same solid background treatment as the Projects view:
  - normal: `$bg-secondary`
  - hover/focus: `$bg-tertiary`
- Keep the change in `_hideout-view.scss`; do not add inline styles.

## Specification Changes

After approval, update `specification-quartermaster.md` section 4.4 to require
fully opaque Hideout sticky-header backgrounds in normal, hover, and
keyboard-focus states.

## Acceptance Criteria

1. Scrolling expanded Hideout upgrade content underneath a sticky bench header
   never shows content through the header.
2. Hovering or keyboard-focusing a clickable bench header remains fully opaque.
3. Sticky positioning, collapse controls, completion state, and responsive
   layout behave as before.
4. `npm run build` passes.
