# Change 17: Prioritized Items (In-Raid Focus)

## Summary

Allow the user to mark specific items as "Prioritized" across any Quartermaster
view that renders item icons. In the In Raid view, prioritized items appear in a
dedicated "Priority Targets" section above "Direct Targets – Bring Home", without
being repeated elsewhere.

## Motivation

A player may want to focus one specific raid on a subset of items while keeping
the full In Raid calculation visible. Currently the In Raid view shows all
targets and craft-support materials. With Prioritized items, the user can
quickly see which handful of items matter most for the current raid.

## Requirements

### CR-001 – Prioritized Item Set (State)

- Persist `prioritizedItemIds: string[]` in `QuartermasterState`
- Backed by `UserStateStore` (synced across devices for signed-in users)
- Schema version bumped from 1 → 2; unknown entries in migration are dropped

### CR-002 – Prioritize Toggle (ItemIcon)

- Add a star icon button (lucide `Star`) to the top-right of the `ItemIcon` container
- Filled star = prioritized, outline star = not prioritized
- Tooltip on hover: "Mark as Priority Target" / "Remove from Priority Targets"
- Only rendered when tooltip context is available (item exists in planner dataset)
- Click calls `togglePrioritize`, stops event propagation
- `onKeyDown` stops propagation to prevent keyboard events from bubbling into
  parent click handlers (e.g., Hideout item toggles)
- Available from all views: My Items, Lists, Hideout, In Raid, Crafting

### CR-003 – Priority Targets Section (In Raid View)

- Read `prioritizedSet` from shared hook
- Split In Raid suggestions into three groups:
  1. **Priority Targets** — items whose `itemId` is in prioritized set
  2. **Direct Targets – Bring Home** — `BRING_HOME_FINAL_TARGET`, excluding prioritized
  3. **Crafting Materials** — remaining, excluding prioritized
- Synthetic `InRaidSuggestion` entries are created for prioritized items that
  the planner did not select (e.g., items marked from My Items with no active
  lists). These render as "bring home" targets in the Priority Targets section.
- The In Raid empty-state guard checks for prioritized items, so the view
  renders even when `plannerResult.inRaidSuggestions.items` is empty.
- "Priority Targets" section header uses the Star icon
- Same visual treatment as existing sections (grid layout, action icons, missing counts)
- Prioritized items are NOT repeated in the lower sections

## UX Notes

- If no items are prioritized, the "Priority Targets" section does not render
- The star in the section header makes the visual connection to the star toggle
- Section header i18n key: `quartermaster.inRaid.priorityTargets` → "Priority Targets"

## Files Changed

| File | Change |
|------|--------|
| `src/shared/state/stores.ts` | Add `prioritizedItemIds` to `QuartermasterState`, bump to v2 |
| `src/apps/quartermaster/hooks/usePrioritizedItems.ts` | New hook |
| `src/apps/quartermaster/components/ItemIcon.tsx` | Add star toggle with onKeyDown stop-propagation |
| `src/apps/quartermaster/components/views/InRaidView.tsx` | Add Priority Targets section, synthetic suggestions, dedup |
| `src/apps/quartermaster/styles/_item-icon.scss` | Star button styles |
| `src/apps/quartermaster/styles/_in-raid-view.scss` | Priority section spacing |
| `src/shared/state/hydration.ts` | Include `prioritizedItemIds` in `anyLocalDataPresent()` |
| `src/shared/i18n/locales/en.json` | New i18n keys: `priorityTargets`, `prioritizeMark`, `prioritizeRemove` |
| `docs/specifications/quartermaster/specification-quartermaster.md` | Update spec with Priority Targets section |

**Locale notes**: Only `en.json` was updated with the three new keys. The
`LocaleContext` fallback chain resolves missing keys in other locale files by
falling through to English, so no placeholder keys are needed in `de.json`,
`fr.json`, etc.