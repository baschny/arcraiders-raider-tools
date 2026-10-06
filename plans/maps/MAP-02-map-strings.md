# MAP-02 Localized map strings

Repos: embark-api (export), raider-tools (generator + client).

## Why

Map names, condition names, area (POI) names and enemy names come out of the build in English only. raider-tools
treats game content as generated, per-locale data (`items.<locale>.json`) and UI copy as `en.json`/Crowdin.

## Scope

1. Find the game string-table keys behind map, condition, area and enemy names in the map features build
   (`build-map-features.js`); emit the keys (not only English text) in `index.json` / `maps/*.json`.
2. Emit `map-strings.<locale>.json` (key → text) for the 20 locales the site supports, from the game
   localization (`ArcRaidersAssets/Localization/Languages/<lang>/Game.json` or the CUE4Parse export, whichever
   holds these tables). Locale codes as in `src/shared/i18n` (fallback `pt-BR → pt → en`).
3. Reuse existing data where it already exists: `public/data/maps/localizations.json` (schedule map names) and
   the map-events localizations (conditions). Prefer one source; document which.
4. Client: a `useMapStrings(locale)` hook that loads the active locale with English fallback; every place that
   shows these names uses it (`Bars.tsx`, `Sidebar.tsx`, `MapView.tsx`, `MapEngine.ts` area labels, tooltips).
   Keep the English name available for search.

## Out of scope

UI labels (kinds, buttons, help texts): MAP-07. Container type labels (`Wrh`, `Rsr Machine M01`): MAP-07 adds
an `en.json` label map.

## Acceptance

- Switching the site language changes map, condition, area and enemy names; missing strings fall back to English.
- Item search still matches English names.
- Build, lint, tests pass.
