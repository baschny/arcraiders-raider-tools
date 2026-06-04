# Change-25: View Consistency (Hideout, Projects, Quests)

## Status
Implemented

## Summary
Unify the visual appearance and tracking behavior across QuestView, ProjectsView, and HideoutView. Standardize item cell backgrounds, icon sizing, tier/step tracking granularity (shift from list-level to item-level toggles), accordion styling simplification, and add `<have> / <required>` progress display to Hideout items.

## Motivation
The three views share similar item-tracking functionality but diverge in visual clarity:
1. **Icon sizing**: Quests/Projects icon containers are forced to `width: 100%` inside their cells, shrinking icons to ~68px. Hideout icons render at 80px. No consistent size.
2. **Dual-state tracking**: Hideout and Projects maintain two toggle layers (`listEnabled` + `itemEnabled`), creating confusion about what the tier/step eye button actually controls. Quests uses only item-level toggles -- simpler and more intuitive.
3. **Background hierarchy**: Hideout/Projects have four nesting levels (page -> accordion card -> tier/step card -> item cell) while Quests has three. The accordion cards add an unnecessary shade layer that differs from the Quests pattern.
4. **Item cell backgrounds**: Hideout items use a darker `rgba($bg-dark, 0.25)` while Quests/Projects use the lighter `$bg-tertiary`.
5. **Missing progress**: Hideout items show only the item name; Quests and Projects show `<have> / <required>`.

---

## Requirements

### R1 -- Consistent Icon & Cell Styling

**R1.1** -- Unify item cell dimensions and padding across all three views:
- Cell width: **84px** (unchanged)
- Cell padding: **`$spacing-xs`** (4px) for all three (currently Quests/Projects use `$spacing-sm` / 8px, Hideout already uses `$spacing-xs`)
- Icon container: apply `width: 100%; height: auto; aspect-ratio: 1` **consistently** across all three views (currently only Quests/Projects have this override; Hideout does not)
- Result: all icons render at ~76px (84px cell - 8px padding) across all three views, an intermediate between the current ~68px (Quests) and 80px (Hideout)

**R1.2** -- Apply the same `tooltipContext` prop to QuestsView ItemIcon calls (currently only Hideout and Projects pass it, at `HideoutView.tsx:539-548` and `ProjectsView.tsx:537-546`). QuestsView at line 317 does not pass it. This enables tooltips on quest items.

---

### R2 -- Shift Tracking from List-Level to Item-Level (Hideout)

**R2.1** -- `handleToggleHideoutList` (`index.tsx:691-701`): Instead of toggling `listEnabled[listKey]`, toggle all `itemEnabled` entries for items in that tier. For each item in the list, set `itemEnabled[itemKey(moduleId, level, itemId)] = !anyItemCurrentlyEnabled` where `anyItemCurrentlyEnabled` is derived from `list.items.some(i => i.isEnabled)`.

**R2.2** -- `handleSetHideoutModuleListsEnabled` (`index.tsx:703-719`): Instead of setting `listEnabled` for multiple tiers, toggle all `itemEnabled` entries for all items across all specified tiers and levels.

**R2.3** -- `handleSetHideoutTrackingMode` (`index.tsx:721-750`): Operate on `itemEnabled` instead of `listEnabled`. For 'next-only', enable all `itemEnabled` in the next tier and disable `itemEnabled` in all other tiers. For 'enable-all'/'disable-all', set `itemEnabled` for all items across all tiers accordingly.

**R2.4** -- Derive `list.isEnabled` from items: a tier list is considered enabled if `list.items.some(item => item.isEnabled)` returns true. Update `generateHideoutLists` in `utils/hideoutLists.ts` (line 51) to compute `isEnabled` from items rather than from `toggleState.listEnabled`.

**R2.5** -- Update tier eye toggle button icon logic in `HideoutView.tsx:472-484`:
- If any item in the tier is enabled -> show `Eye` (the tier is tracking)
- If all items in the tier are disabled -> show `EyeOff` (the tier is not tracking)
- Uses `list.isEnabled` which is now derived from items (R2.4), so the existing ternary at line 483 is unchanged.

**R2.6** -- Update module (bench) eye button icon logic in `HideoutView.tsx:378-405`:
- Same collective logic as R2.5 but across all tiers of the module
- Currently at line 404: `{areAllModuleListsEnabled ? <EyeOff size={16} /> : <Eye size={16} />}` -- update `areAllModuleListsEnabled` to derive from item-level `isEnabled` across all module lists. The current logic at line 328: `moduleLists.every(list => list.isEnabled)` already works since `list.isEnabled` is now derived from items.

**R2.7** -- The `listEnabled` field in `HideoutToggleState` (`types/hideout.ts`) becomes dead state. Keep the type definition for backward compatibility but stop reading/writing it. The `itemEnabled` field becomes the sole source of truth for tracking enablement.

**R2.8** -- Update the "Next Only" segmented control button `currentMode` detection (`HideoutView.tsx:138-149`): The existing logic compares `list.isEnabled` against expected mode; since `list.isEnabled` is now derived from items (R2.4), this automatically reflects item-level state. No code change needed beyond R2.4.

**R2.9** -- `isNextRedundant` check (`HideoutView.tsx:151-153`): Keep as-is. Compares expected enabled items for next-only vs enable-all at list level, which transparently flows to item level.

---

### R3 -- Shift Tracking from List-Level to Item-Level (Projects)

**R3.1** -- `handleToggleProjectList` (`index.tsx:765-775`): Mirror R2.1 -- toggle all `itemEnabled` for items in that step.

**R3.2** -- `handleSetProjectStepsEnabled` (`index.tsx:777-793`): Mirror R2.2 -- toggle all `itemEnabled` across all specified steps.

**R3.3** -- `handleSetProjectTrackingMode` (`index.tsx:795-835`): Mirror R2.3 -- operate on `itemEnabled`.

**R3.4** -- Derive `list.isEnabled` from items in `generateProjectLists` (`utils/projectLists.ts`, lines 75 and 101).

**R3.5** -- Update step eye button icon logic in `ProjectsView.tsx:452-465`:
- If any item in the step is enabled -> show `Eye`
- If all items disabled -> show `EyeOff`
- When step is completed (`isCompleted` at line 452), the eye button is hidden. Keep this behavior.

**R3.6** -- Update project eye button icon logic in `ProjectsView.tsx:353-380`: collective state across all steps. Uses `areAllListsEnabled` (line 304) which now derives from item-level state via `list.isEnabled`.

**R3.7** -- Add `isNextRedundant` check to ProjectsView (matching HideoutView lines 151-153). Hide the "Next Only" button when next-only would enable the same items as enable-all (i.e., only one pending step exists). This check uses item-level state via the derived `list.isEnabled`.

**R3.8** -- The `listEnabled` field in `ProjectToggleState` (`types/project.ts`) becomes dead state. Same as R2.7 -- keep type, stop reading/writing.

---

### R4 -- Accordion Background Simplification

**R4.1** -- Remove the "card" styling from `.hideout-view__module` (`_hideout-view.scss:67-94`):
- Remove `background: $bg-secondary`
- Remove `border-radius: $radius-md`
- Remove `overflow: hidden`
- Add `border-bottom: 1px solid rgba($border-light, 0.18)` to separate modules visually
- Module header background (`_hideout-view.scss:107`): change from `background: $bg-secondary` to `background: $bg-primary` so it blends with the page

**R4.2** -- Remove the "card" styling from `.projects-view__module` (`_projects-view.scss:67-89`):
- Same changes as R4.1

**R4.3** -- Update tier card (`.hideout-view__upgrade`) background (`_hideout-view.scss:246`):
- Change from `background: $bg-tertiary` to `background: $bg-secondary`
- This becomes the "card" level, matching QuestsView's quest block background

**R4.4** -- Update step row (`.projects-view__step-row`) background (`_projects-view.scss:213`):
- Change from `background: $bg-tertiary` to `background: $bg-secondary` (same as R4.3)

**R4.5** -- Update Hideout item cell background (`_hideout-view.scss:340`):
- Change from `background: rgba($bg-dark, 0.25)` to `background: $bg-tertiary` (matching QuestsView and ProjectsView item cells)

**R4.6** -- The disabled states use `opacity` which naturally darkens the background -- matching the user's requested "lighter when enabled, darker when disabled" effect. Current opacity values are already consistent across views:
- Item `&--disabled`: `opacity: 0.5` in all three views
- Tier `&--disabled`: `opacity: 0.55` in Hideout (line 252)
- Step `&--disabled`: `opacity: 0.55` in Projects (line 218)

**R4.7** -- Ensure the sticky module header (`_hideout-view.scss:104-108`, `_projects-view.scss:99-103`) still works with a `$bg-primary` background. The `position: sticky; top: 0; z-index: 10` properties remain unchanged.

---

### R5 -- Hideout Item Progress Display

**R5.1** -- In HideoutView item rendering (`HideoutView.tsx:514-565`), add a progress span below the item name, matching the existing QuestsView pattern:

```tsx
<span className="hideout-view__item-progress">
  {owned} / {listItem.quantity}
</span>
```

The `owned` variable is already computed at line 511: `const owned = getOwnedQuantity(listItem.itemId) ?? 0;`. Insert the new span after the existing name span at line 564.

**R5.2** -- Add SCSS for `.hideout-view__item-progress` in `_hideout-view.scss`, matching `.quests-view__item-progress` from `_quests-view.scss:236-249`:

```scss
&__item-progress {
  display: block;
  width: 100%;
  text-align: center;
  color: $text-secondary;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  margin-top: auto;
}

&__item--complete &__item-progress {
  color: $status-available;
}
```

---

### R6 -- i18n Verification

No new keys are required. The existing toggle tooltip keys cover the same user actions (enabling/disabling items). The behavioral change from list-level to item-level tracking is transparent to the user -- they still see an Eye/EyeOff button and click to enable/disable.

Verify that existing keys still make sense after the change:
- `quartermaster.hideout.enableTierTooltip` / `quartermaster.hideout.disableTierTooltip` -- "Enable tier" now means "enable all items in this tier" (acceptable)
- `quartermaster.hideout.enableBenchTooltip` / `quartermaster.hideout.disableBenchTooltip` -- same logic at module level
- `quartermaster.projects.enableStepTooltip` / `quartermaster.projects.disableStepTooltip` -- same for projects
- `quartermaster.projects.enableProjectTooltip` / `quartermaster.projects.disableProjectTooltip` -- same at project level
- All item-level tooltip keys unchanged

---

## Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/apps/quartermaster/index.tsx` | Rewrite `handleToggleHideoutList`, `handleSetHideoutModuleListsEnabled`, `handleSetHideoutTrackingMode` to use `itemEnabled`; same for Project handlers (`handleToggleProjectList`, `handleSetProjectStepsEnabled`, `handleSetProjectTrackingMode`); update `progressMapForTracking` dependency if needed |
| `src/apps/quartermaster/components/views/HideoutView.tsx` | Update tier and module eye icon logic; add item progress span; update `isNextRedundant` logic |
| `src/apps/quartermaster/components/views/ProjectsView.tsx` | Update step and project eye icon logic; add `isNextRedundant` check |
| `src/apps/quartermaster/components/views/QuestsView.tsx` | Add `tooltipContext` to ItemIcon |
| `src/apps/quartermaster/utils/hideoutLists.ts` | Derive `list.isEnabled` from items instead of `toggleState.listEnabled` (line 51) |
| `src/apps/quartermaster/utils/projectLists.ts` | Derive `list.isEnabled` from items instead of `toggleState.listEnabled` (lines 75, 101) |
| `src/apps/quartermaster/styles/_hideout-view.scss` | Module: remove `background`/`border-radius`/`overflow`, add `border-bottom`; module-header: change bg to `$bg-primary`; tier: change bg to `$bg-secondary`; item: change bg to `$bg-tertiary`, add `width: 100%` icon override, add item-progress styles |
| `src/apps/quartermaster/styles/_projects-view.scss` | Module: same card removal as Hideout; step: change bg to `$bg-secondary`; add `width: 100%` icon override; update padding to `$spacing-xs` |
| `src/apps/quartermaster/styles/_quests-view.scss` | Update item padding to `$spacing-xs` |

### NOT Modified

| File | Reason |
|------|--------|
| `src/apps/quartermaster/types/hideout.ts` | Keep `HideoutToggleState.listEnabled` field for backward compatibility (dead but harmless) |
| `src/apps/quartermaster/types/project.ts` | Keep `ProjectToggleState.listEnabled` field for backward compatibility |
| `src/apps/quartermaster/utils/hideoutStorage.ts` | Cleanup logic handles both `listEnabled` and `itemEnabled` -- safe to leave as-is |
| `src/apps/quartermaster/utils/projectStorage.ts` | Same as hideoutStorage |
| `src/shared/state/stores.ts` | Schema version unchanged (no new fields added, existing fields kept for backward compat) |
| `src/shared/i18n/locales/en.json` | Existing keys still apply after behavioral change |
| `src/apps/quartermaster/components/ItemIcon.tsx` | No changes needed -- size prop and rendering unchanged |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| All items in a tier disabled, user clicks tier eye | All items become enabled (tier eye shows EyeOff -> Eye) |
| Some items enabled, user clicks tier eye | All items become disabled (tier eye shows Eye -> EyeOff) |
| No items in a tier (empty list) | Tier not rendered (existing behavior, unchanged) |
| User clicks "Next Only" when only one pending tier/step exists | "Next Only" button hidden (`isNextRedundant` check) |
| Completed tier or step | Eye button hidden; derived `isEnabled = false` since no items need tracking |
| User manually disables individual items after "Next Only" | Tier goes into "custom" state; displays Eye since some items still enabled |
| Existing user has `listEnabled` state stored | Ignored -- `list.isEnabled` now derived from items. No migration; list-level disabling is silently discarded. |
| Project step with submitted progress (`submitted`/`required`) | Keep existing ProjectsView behavior showing submitted/required progress separately from owned/required |
| `getOwnedQuantity` returns `null` (no inventory synced) | Progress shows `0 / required` (the `?? 0` fallback at HideoutView.tsx:511) |
| Module accordion with removed card background | Sticky header still works (z-index 10, top 0); border-bottom on module provides visual separation |
| Hideout tier with single item | `--single` modifier (min-width 140px) still applies; behavior unchanged |

---

## Rollout Strategy

1. **Phase 1** (R1, R5): Unify cell/icon styling and add Hideout progress display. Apply consistent padding, icon sizing, `tooltipContext`. Add `<have> / <required>` to Hideout items.
2. **Phase 2** (R4): Simplify accordion backgrounds. Remove card styling from module/project wrappers, adjust tier/step/item backgrounds.
3. **Phase 3** (R2, R3): Shift tracking to item-level. Update all toggle handlers to use `itemEnabled`. Derive `list.isEnabled` from items. Add `isNextRedundant` to ProjectsView.
4. **Phase 4** (R6): Verify i18n keys still apply.
5. **Verification**: `npm run build && npm test`
