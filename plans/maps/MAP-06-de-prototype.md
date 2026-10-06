# MAP-06 Remove prototype naming, dashboard card, docs

Repo: raider-tools. Depends on MAP-05.

## Scope

1. Remove the "Prototype" badge (`src/apps/maps/index.tsx`) and every `map-proto` / prototype reference in code,
   comments, scripts and `.gitignore`.
2. Dashboard: a Maps card in `src/pages/Dashboard.tsx` (keys `dashboard.tools.maps` in `en.json`, new key only).
   Check Header and Sidebar nav entries and `usePageTitle` (already present).
3. Docs: `docs/Maps.md` — what the tool does, the data flow (embark-api `build-map-features.js` →
   `generate:maps` → committed `public/data/map-data/` → Amplify deploy), the per-patch runbook, the URL params (`mode`, `map`,
   `cond`, `layer`, `item`, `show`, `enemies`) and prefs key `raider-tools:maps-prefs`, and the scoring rules
   (pool split, category match, plants, nature spots; no drop-rate estimates, no blueprints and why).
4. `AGENTS.md`: add `maps` to "Individual Applications" with a pointer to `docs/Maps.md`.
5. Move `plans/maps-integration.md` content that is now decided into `docs/Maps.md`; keep the plan for open
   later ideas only.

## Acceptance

- `grep -rni "map-proto\|prototype" src scripts package.json .gitignore` finds nothing map-related.
- Build, lint, tests pass.
