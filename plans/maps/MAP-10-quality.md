# MAP-10 Lint, accessibility, performance pass

Repo: raider-tools `src/apps/maps/`. After MAP-07 and MAP-08.

## Scope

1. `npm run lint` clean for the maps app with no new disables (justify any existing ones).
2. Accessibility: all icon buttons have translated `aria-label`s; filter rows are keyboard operable (tri-state
   checkbox with `aria-checked="mixed"`, chevron as a separate button with `aria-expanded`); segmented controls
   use `role="radiogroup"`; Esc closes menus and unpins; visible focus styles; the canvas has a text alternative
   pointing at the sidebar lists.
3. Inline styles: move to SCSS where the project standard asks for it (dynamic colors via CSS variables are fine).
4. Performance: check the lazy `maps` chunk size in `npm run build` output (report it); no maps code in the main
   chunk; `useAllMaps` only fetches when needed; engine redraws are throttled to animation frames.
5. Remove dead code from the prototype phase (blueprint remnants, unused exports, the `MATCH_CATEGORY` toggle
   becomes a plain rule with a comment).

## Acceptance

- Build, lint, tests pass; report lists chunk sizes before/after.
