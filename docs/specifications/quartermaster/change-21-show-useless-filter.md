# Change Request 21: Replace "Show Only Recyclable" with "Show Useless" Filter

**Status:** Implemented
**Date:** 2026-05-28

## Summary

Remove the "Show Only Recyclable" filter from the My Items view and replace it with a "Show Useless" filter that shows only items with no crafting or list relevance. This lets users quickly identify items they can safely sell/vendor without losing crafting opportunities.

## Motivation

The "Show Only Recyclable" filter highlighted items the planner wants to recycle, but that's only one dimension of item usefulness. Users also need to identify items that serve **no purpose at all** — items they can safely sell or vendor without impacting any active planning goals.

An item is "useless" (safe to sell) when it has no planner relevance:
- Not directly needed by any active list
- Not an ingredient in any crafting chain for active targets
- Not a recycle/salvage source
- Not a weapon upgrade base

This directly corresponds to the item tooltip's right column (Column 2) being empty — meaning no "Needed for Lists", "Needed for Crafting", or "Could be used for" sections.

## Design Decisions

1. **Preserve `recycleItemIds` useMemo** — it's also used at line 320 for rendering recycle badges in the status column, so it must stay
2. **Include `upgradeBaseItemIds` in useless check** — weapon upgrade base items aren't captured by `itemInsights`, so both sources must be checked
3. **Filter is additive** — the useless toggle works on top of search, category, and rarity filters
4. **Filter state persists** — as of 2026-05-29, all filter state (search, category, rarity, "Show Useless") is persisted in `localStorage` and survives view/app navigation within the same browser session
## Files Changed

- `src/apps/quartermaster/components/views/StashView.tsx` — replace state, add useMemo, update filter/checkbox
- `src/shared/i18n/locales/*.json` (14 files) — remove `showOnlyRecyclable`, add `showOnlyUseless`
- `docs/specifications/quartermaster/specification-quartermaster.md` — update Section 4.1

### Revision (2026-05-29)

- **Filter persistence**: Filter state (search, category, rarity, "Show Useless") is now persisted in `localStorage` so it survives view/app navigation within the same browser session. This follows the existing device-local UI preferences pattern in `src/apps/quartermaster/utils/preferences.ts`.

## Edge Cases

- **Weapon upgrade bases with zero quantity** are always treated as useful
- **Empty itemInsights entry** (all arrays empty) signals useless — matches tooltip Column 2 logic
- **No useless items** → filter shows "No items match" empty state
- **Combined filters** work naturally via chained `.filter()` calls
