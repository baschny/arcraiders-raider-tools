# Change 38 - Project Header Controls and Progress

## Status

Implemented

## Problem

The Projects view has three usability and correctness problems:

1. Expanded project headers are sticky, but their translucent background allows
   the scrolling step content to remain visible through the header.
2. The project-level eye button does not reliably produce the same tracking
   state as toggling every step in the project to the same state.
3. Project headers show only the count of currently tracked item types and do
   not summarize submission or step completion progress.

## Required Behavior

### Solid Sticky Headers

Expanded project headers remain sticky at the top of the Projects scroll
container.

- The normal header background must be fully opaque.
- Hover and keyboard-focus header backgrounds must also be fully opaque.
- Step content must scroll underneath the header without showing through it.
- Existing sticky positioning, collapse behavior, and header state styling
  remain unchanged.

### Project-Level Tracking Toggle

The project-level eye button is a bulk version of the individual eye buttons
shown for incomplete steps.

- If every incomplete step in the project is enabled, activating the project
  button disables every item in every incomplete step.
- If any incomplete step in the project is disabled or partially disabled,
  activating the project button enables every item in every incomplete step.
- The resulting state must be identical to setting every individual step to
  that same enabled or disabled state.
- The operation must update all item-level tracking overrides for the selected
  project in one state update.
- Other projects and their item tracking overrides must not change.
- The button icon and accessible label must reflect the next action.
- Clicking or using the project toggle must not collapse or expand the project.

### Project Header Progress Badges

Every visible project header shows these progress summaries:

1. The existing tracked-items badge, which continues to show the number of
   unique enabled required item IDs.
2. A missing-items badge showing the number of distinct project requirement
   entries whose synchronized submitted quantity is lower than the required
   quantity.
3. A completed-steps badge in the form
   `"<completed>/<total> STEPS"` while the project is still in progress.

Counting rules:

- A requirement entry is one item requirement within one project step.
- The missing-items count is not the sum of missing units.
- The same item required by two different steps counts as two requirement
  entries when both are still incomplete.
- Category-based requirements are excluded from the missing-items badge because
  they are not individual item requirements.
- Completed steps contribute no missing requirement entries.
- Step completion uses synchronized project progress and the same effective
  completion rules used by the displayed step rows.
- The total step count is the number of generated step lists displayed for the
  project.
- Step progress uses a neutral/accent treatment rather than the green completed
  treatment.
- Completed projects replace the step-progress badge with a green
  `"PROJECT COMPLETED"` badge next to the existing green checkmark.
- Completed projects hide the redundant `0 ITEMS` and `0 MISSING` badges.

The new labels must be added as new English translation keys. Existing English
translation values and Crowdin-managed locale files must not be changed.

## Specification Changes

After approval, update `specification-quartermaster.md` section 4.5:

- Require fully opaque sticky project-header backgrounds.
- Define the project eye button as a bulk equivalent of toggling all project
  steps.
- Add the missing-item and completed-step header badges and their counting
  semantics.

## Implementation Notes

- Keep the visual changes in `_projects-view.scss`; do not add inline styles.
- Derive project progress summaries from the generated project lists and cached
  synchronized progress already available to `ProjectsView`.
- Use a shared, testable project bulk-toggle operation so project-level and
  step-level behavior cannot diverge.
- Add only the required keys to `src/shared/i18n/locales/en.json`.

## Acceptance Criteria

1. Scrolling an expanded project's steps beneath its sticky header never shows
   step content through the normal, hover, or focus header background.
2. Activating the project eye button on a project whose incomplete steps are
   fully enabled disables every item in every incomplete step.
3. Activating the project eye button on a disabled or mixed project enables
   every item in every incomplete step.
4. Project bulk toggling leaves all other projects unchanged and does not
   collapse the selected project.
5. Each incomplete project header shows tracked items, missing requirement
   entries, and completed steps out of total steps.
6. A completed project header shows a green checkmark and `"PROJECT COMPLETED"`
   badge without zero-value tracked-items or missing-items badges.
7. Missing-item counts handle partial submissions, fully submitted items,
   repeated item IDs across steps, and completed steps according to the rules
   above.
8. Automated tests cover fully enabled, fully disabled, and mixed bulk-toggle
   states plus progress-count calculations.
9. `npm test` and `npm run build` pass.
