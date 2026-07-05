# Change 36 — In Raid View: Uncraftable-Only Filter

**Status:** Implemented

## Summary

Add a toggle switch to the In Raid filter bar that, when enabled, hides items the user can craft themselves (have recipe, blueprint unlocked, bench tier sufficient) and shows only items they must loot in-raid because they cannot craft them.

## Motivation

The In Raid view shows all suggested loot items, including many that the user can craft from their stash once back at base. This forces unnecessary scrolling and noise. A toggle to collapse craftable items lets the user focus on what must actually come from a raid.

---

## Requirements

### R1 — Toggle State

**File(s)**: `src/apps/quartermaster/utils/preferences.ts`

**Change type**: addition

**Detail**: Add `showOnlyUncraftable: boolean` to the `InRaidFilters` interface. Default is `false`. Persist to and restore from `localStorage` under the existing `quartermaster.ui.inRaidFilters` key, alongside the existing fields.

### R2 — Craftability Check

**File(s)**: `src/apps/quartermaster/components/views/InRaidView.tsx`

**Change type**: addition

**Detail**: Add a helper function `isItemCraftable(item, plannerResult)` that returns `true` only when the item has a recipe AND all crafting conditions are met (blueprint unlocked, bench level sufficient). Uses `plannerResult.craftability[item.id]` — the pre-computed `CraftabilityInfo` from the planner.

Logic:
- No `craftability` entry → not craftable
- `hasRecipe === false` → not craftable (no recipe/upgrade path)
- `canCraft === false` → not craftable (blocked by blueprint, bench, or cycle)
- `canCraft === true` → craftable

### R3 — Filter Application

**File(s)**: `src/apps/quartermaster/components/views/InRaidView.tsx`

**Change type**: modification

**Detail**: When `filters.showOnlyUncraftable` is `true`, filter out items where `isItemCraftable()` returns `true`. Apply this in two places:

1. `computeFilterOptions()` — include the uncraftable filter when counting available option values so dropdown counts reflect the active uncraftable toggle.
2. `filteredSectionItems()` — apply the uncraftable filter alongside type/rarity/location filters so displayed results respect the toggle.

### R4 — Toggle UI

**File(s)**: `src/apps/quartermaster/components/views/InRaidView.tsx`

**Change type**: addition

**Detail**: Add a toggle switch before the Type/Rarity/Location filter dropdowns in the In Raid filter bar:

- Label text from i18n key `quartermaster.inRaid.filterUncraftable`
- `role="switch"` with `aria-checked` reflecting state
- Track + knob styling using CSS classes `in-raid-view__toggle-switch`, `in-raid-view__toggle-switch--active`, `in-raid-view__toggle-knob`
- Clicking toggles `showOnlyUncraftable` in filter state

### R5 — Clear Filters Integration

**File(s)**: `src/apps/quartermaster/components/views/InRaidView.tsx`

**Change type**: modification

**Detail**:
- Include `showOnlyUncraftable` in `hasActiveFilters` (so clear-all button appears when toggle is active)
- Reset `showOnlyUncraftable: false` in `handleClearFilters()`

### R6 — Toggle Styles

**File(s)**: `src/apps/quartermaster/styles/_in-raid-view.scss`

**Change type**: addition

**Detail**: Add CSS classes for the toggle switch:
- `.in-raid-view__toggle` — flex row container with gap
- `.in-raid-view__toggle-label` — label text styling (matches dropdown trigger text size/weight)
- `.in-raid-view__toggle-switch` — pill track (36×20px, rounded), grey when off, `$text-accent` when active
- `.in-raid-view__toggle-knob` — 14×14px circle, animates between left:2px and left:calc(100% - 16px)

### R7 — Localization

**File(s)**: `src/shared/i18n/locales/en.json`

**Change type**: addition

**Detail**: Add `quartermaster.inRaid.filterUncraftable: "Uncraftable only"` to the en.json locale file.

---

## Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/apps/quartermaster/utils/preferences.ts` | Add `showOnlyUncraftable` to `InRaidFilters` type, default, load/save |
| `src/apps/quartermaster/components/views/InRaidView.tsx` | Add `isItemCraftable` helper, toggle UI, filter logic in `computeFilterOptions` and `filteredSectionItems`, update `hasActiveFilters` and `handleClearFilters` |
| `src/apps/quartermaster/styles/_in-raid-view.scss` | Add toggle switch track/knob CSS |
| `src/shared/i18n/locales/en.json` | Add `filterUncraftable` key |

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|------------------|
| Toggle OFF (default) | All In Raid suggestions shown as before |
| Toggle ON, item has no recipe (weapons, mods, quick use) | Item remains visible — must loot |
| Toggle ON, item has recipe + blueprint locked + not unlocked | Item remains visible — cannot craft yet |
| Toggle ON, item has recipe + bench level too low | Item remains visible — cannot craft yet |
| Toggle ON, item has recipe + blueprint + bench all met | Item hidden — user can craft from stash |
| Toggle ON, clear-all button clicked | Toggle resets to OFF, all items shown again |
| Toggle ON + active type/rarity/location filters | Uncraftable filter AND type/rarity/location filters all apply (AND logic) |

---

## Rollout Strategy

Single phase: implement the toggle, filter logic, and styles together. No backend or data changes required — the `craftability` map is already part of `PlannerResult`.
