# MAP-08 Mobile layout and touch input

Repo: raider-tools `src/apps/maps/` (styles, `index.tsx`, `MapView.tsx`, `engine/MapEngine.ts`). Decision D5.

## Scope

1. Below the site's mobile breakpoint (`src/shared/styles/_variables.scss`): the left bar becomes a bottom sheet
   (collapsed handle with the Loot/ARC switch and the current item; drag or tap to expand to ~60 % height); map
   and condition bars become one horizontally scrolling row each; `fitPadding` follows the sheet.
2. Engine: pointer events for one-finger pan, two-finger pinch zoom around the midpoint, double-tap zoom;
   `touch-action: none` on the canvas; no page scroll or browser zoom while on the map.
3. Tap on a spot shows the tooltip as a dismissible card (no hover on touch); tap on empty map dismisses.
4. Help "(?)" tooltips open on tap.
5. Respect safe-area insets; keep the Header auto-hide disabled on `/maps` (already).

## Acceptance

- Desktop behaviour unchanged.
- Reason through the layout at 375×812 and 768×1024 in the report (the agent does not run a browser; the main
  session verifies in the preview).
- Build, lint, tests pass.
