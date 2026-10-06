# MAP-07 UI strings into en.json

Repo: raider-tools `src/apps/maps/**`, `src/shared/i18n/locales/en.json`. Run alone (touches most components).

## Why

All UI copy in the maps app is hard-coded English. Crowdin translates `en.json`.

## Scope

1. Move every user-visible string (buttons, titles, aria labels, help "(?)" tooltips, legend, tooltip field
   labels, counts with plurals, empty states, category and kind labels from `data/kinds.ts`) to `t()`/`tm()`
   under `maps.*`. Use `useLocale()` from `src/shared/context/LocaleContext.tsx`; follow
   `src/shared/i18n/glossary.ts` for game terms. Reuse existing keys where the same text exists.
2. Kind labels: `kinds.ts` keeps stable keys, components translate them (`maps.kinds.<key>`,
   `maps.categories.<key>`).
3. Container type labels: replace raw tag parts (`Wrh`, `Rsr Machine M01`) with a label map
   (`maps.containerTypes.<tag>`), with the raw tag as fallback.
4. Item names: display `item.name[locale]` with English fallback (prototype uses `.en`).
5. Number formatting with `Intl.NumberFormat(locale)`.
6. `MapEngine` canvas text (area labels) gets already-translated strings from React; no `t()` inside `engine/`.

## Acceptance

- Verification checklist from `AGENTS.md` "Translation Files — Strict Workflow Rules" holds (only additions in
  `en.json`, no other locale file touched).
- A grep for quoted English UI text in `src/apps/maps` finds nothing user-visible (list any intentional
  exceptions in the report).
- Build, lint, tests pass.
