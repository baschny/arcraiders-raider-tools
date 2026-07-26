# Change 39 - Project View Persistence and Badge Consistency

## Status

Implemented

## Problem

The Projects view currently owns collapse state in component-local React state.
Switching to another Quartermaster view unmounts the Projects view, so returning
to it resets every incomplete project to expanded.

Users need each project's expanded or collapsed state to survive view changes.
The state must follow the existing user-data architecture so anonymous users
retain it locally and signed-in users receive the same state across sessions and
devices.

The incomplete-project header badges also need to match the established Hideout
header hierarchy: structural progress first, followed by tracked and missing
item counts.

## Required Behavior

### Per-Project State

- Each incomplete project may be expanded or collapsed independently.
- Returning to the Projects view restores the last state of every known project.
- A project with no stored collapse decision is expanded by default.
- Newly synchronized or newly released projects therefore start expanded.
- Completed projects retain their existing non-expandable completed
  presentation.

### Individual and Bulk Controls

- Clicking a project header persists the resulting collapsed or expanded state.
- Keyboard activation of a project header persists the same state.
- **Collapse All** stores every currently visible, incomplete project as
  collapsed.
- **Expand All** removes every currently visible, incomplete project from the
  collapsed set.
- Bulk operations must not overwrite stored state for project IDs that are not
  currently visible.

### User-Data Storage

Store the preference inside the existing Quartermaster
`UserStateStore<QuartermasterState>` domain:

```ts
projectView?: {
  collapsedProjectIds: string[];
}
```

Rules:

- Persist only collapsed project IDs. Expanded is represented by absence.
- Do not read or write `localStorage` directly from `ProjectsView`.
- Do not add a new state domain, DynamoDB row family, API route, or client
  cache.
- Keep `projectView` optional at rest for backward compatibility with existing
  Quartermaster schema-version 5 records and restored tutorial snapshots.
- The Quartermaster default state includes an empty `collapsedProjectIds`
  array.
- Because the new field is optional at rest, the Quartermaster schema version
  remains 5, following `User-Data.md` section 5.3.
- Reads must tolerate a missing or malformed field and treat it as an empty
  collapsed set.
- Writes must normalize the array to unique string project IDs.
- A collapse-only anonymous Quartermaster state counts as local data during
  first-sign-in migration.
- Existing `UserStateStore` behavior provides debounced persistence,
  optimistic-concurrency revisions, server-wins conflict handling, anonymous
  local storage, remote signed-in storage, lifecycle flushes, and sign-out
  wiping.

### Snapshot Scope

Quartermaster tutorial snapshots continue to exclude this view preference.
Restoring gameplay/tutorial state must not intentionally replace a user's
project expansion choices. Older snapshot payloads without `projectView` remain
valid.

### Header Badge Consistency

Incomplete project headers show badges immediately after the project name in
this order:

1. `STEP <completed>/<total>`
2. `<count> ITEMS`
3. `<count> MISSING ITEMS`

Rules:

- The step badge uses the same visual treatment as the Hideout view's tier
  badge: `$bg-tertiary` background, `$text-primary` text, and
  `1px solid rgba($border-light, 0.35)` border.
- The tracked-items and missing-items badges retain their existing accent and
  missing-state colors.
- Completed projects retain the distinct green `"PROJECT COMPLETED"` state and
  do not show the three incomplete-project badges.
- Use new English translation keys for the revised step and missing-item label
  formats; remove the superseded keys when their code references are removed.
- Do not edit Crowdin-managed locale files.

## Specification Changes

After approval, update `specification-quartermaster.md` section 4.5 to define:

- persisted per-project expansion state
- sparse collapsed-ID storage semantics
- expanded-by-default behavior for unknown/new projects
- persistence behavior for individual and bulk collapse controls
- the `STEP`, `ITEMS`, `MISSING ITEMS` badge order and Hideout-matching step
  badge treatment

## Implementation Notes

- Lift collapse state out of `ProjectsView` component-local state.
- Pass normalized collapsed project IDs and an update callback from the
  Quartermaster app, which already subscribes to `quartermasterStore`.
- Update the existing Quartermaster state shape and default value only; do not
  introduce direct persistence calls in the view.
- Extend `anyLocalDataPresent()` so collapse-only anonymous state participates
  in first-sign-in migration.
- Do not change `quartermasterSnapshots` capture payload fields.
- Mirror the Hideout tier badge variables in `_projects-view.scss`; do not add
  inline styling.

## Acceptance Criteria

1. Collapsing or expanding a project, leaving Projects, and returning restores
   the same state.
2. Remounting Quartermaster restores the state from the active
   `UserStateStore` backend.
3. A project ID absent from stored state is expanded.
4. A newly synchronized project starts expanded without modifying existing
   projects' decisions.
5. Collapse All and Expand All update all currently visible incomplete projects
   while preserving unknown/non-visible IDs.
6. Anonymous persistence and first-sign-in migration include collapse-only
   state.
7. Sign-out clears the state through the existing Quartermaster store wipe.
8. Older schema-version 5 data and tutorial snapshots without `projectView`
   continue to load with all projects expanded.
9. Automated tests cover sparse-state normalization, individual/bulk updates,
   backward-compatible reads, and collapse-only first-sign-in migration.
10. Incomplete headers render badges in `STEP`, `ITEMS`, `MISSING ITEMS` order.
11. The step badge matches the white Hideout tier badge treatment.
12. Completed headers continue to show only the distinct green project
    completion state.
13. `npm run build` and the relevant Vitest suites pass.
