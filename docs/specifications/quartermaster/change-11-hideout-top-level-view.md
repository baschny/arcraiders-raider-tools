# CHANGE REQUEST
## Quartermaster Specification Update - Promote Hideout Upgrades to Top-Level View

Document Type: Structured Delta vs Previous Specification
Scope: Quartermaster navigation, Lists view, Hideout upgrade planning UI, planner aggregation priority, tests
Impact Level: UI workflow change plus planner priority adjustment
Version: CR-Hideout-View-v1

---

# 1. SUMMARY

Quartermaster must promote hideout upgrade planning from a hidden section inside the Lists view into a dedicated top-level **Hideout** view.

The Hideout view owns all generated hideout upgrade lists. User-authored lists remain in the Lists view. Generated hideout lists continue to participate in In Raid and Crafting planning, but they must have higher planner priority than user lists.

This change supersedes the parts of `change-05-hideout-from-api.md` that place generated hideout upgrade lists and the **Sync Hideouts** control inside the Lists view.

---

# 2. ADDITIONS

## CR-011.1 - Add Hideout Top-Level View

### Affected Areas
- `src/apps/quartermaster/components/Sidebar.tsx`
- `src/apps/quartermaster/index.tsx`
- shared Quartermaster navigation translations
- Quartermaster route-local view state

### Requirement
Add a top-level Quartermaster view named:

```text
Hideout
```

The sidebar view order must be:

1. My Items
2. Lists
3. Hideout
4. In Raid
5. Crafting

The new view id should be stable and explicit:

```ts
type ViewId = 'stash' | 'lists' | 'hideout' | 'in-raid' | 'crafting'
```

### Rules

- The Hideout view is the only UI location for generated hideout upgrade lists.
- The Hideout view must use the same app-level data sources already used for hideout progression:
  - imported hideout definitions
  - cached user hideout state
  - persisted hideout list and item toggle state
- The Hideout view must be available even when no hideout cache exists, so it can show the sync prompt and sync action.

### Technical Impact

Create a dedicated view component, recommended:

```text
src/apps/quartermaster/components/views/HideoutView.tsx
```

Create scoped styles, recommended:

```text
src/apps/quartermaster/styles/_hideout-view.scss
```

Import the style partial from:

```text
src/apps/quartermaster/styles/main.scss
```

---

## CR-011.2 - Move Sync Hideouts to Hideout View

### Affected Areas
- `src/apps/quartermaster/components/views/ListsView.tsx`
- new `HideoutView`
- hideout sync callbacks in `src/apps/quartermaster/index.tsx`

### Requirement
Move the **Sync Hideouts** control out of the Lists view and into the top of the Hideout view.

### Rules

- The Sync Hideouts button must appear at the top of the Hideout view.
- The button must use the existing hideout sync behavior and loading state.
- The Lists view must not render a hideout sync button.
- If no hideout cache exists, the Hideout view must show a prompt explaining that hideout data must be synced before upgrade lists can be generated.
- If hideout sync fails, the existing sync error behavior must remain visible through the app-level error pattern.

### Technical Impact

`ListsView` no longer needs hideout sync props.

Recommended props move from `ListsView` to `HideoutView`:

```ts
onSyncHideout: () => void
isSyncingHideout: boolean
hasHideoutCache: boolean
```

---

## CR-011.3 - Remove Hideout Upgrade Lists From Lists View

### Affected Areas
- `src/apps/quartermaster/components/views/ListsView.tsx`
- `src/apps/quartermaster/styles/_lists-view.scss`
- Lists view tests, if present

### Requirement
The Lists view must contain user-authored lists only.

### Rules

- Generated hideout lists must not appear in the Lists view sidebar.
- Generated hideout list details must not appear in the Lists view content panel.
- The Lists view must not show a hideout upgrade group, hideout hints, or hideout controls.
- The Lists view selected-list state must resolve only user-authored lists.
- The Lists view must keep existing user-list behavior:
  - create list
  - rename list
  - delete list
  - reorder lists
  - add items
  - remove items
  - reorder items
  - change quantities
  - enable or disable lists and items

### Technical Impact

`ListsView` should no longer receive:

```ts
hideoutLists
onToggleHideoutList
onToggleHideoutItem
onSyncHideout
isSyncingHideout
hasHideoutCache
```

Remove hideout-specific parsing and branch logic from the Lists view.

---

## CR-011.4 - Hideout Overview Layout

### Affected Areas
- new `HideoutView`
- `src/apps/quartermaster/types/hideout.ts`
- `src/apps/quartermaster/utils/hideoutLists.ts`
- Quartermaster localization dictionaries

### Requirement
The Hideout view must present all hideout benches/modules as an overview.

Each bench must show, at a glance:

- bench/module name
- current tier
- max tier
- completion state when fully upgraded
- generated upgrade lists for every future unlock/tier

### Tier Display

For each bench, display:

```text
Tier <currentLevel>/<maxLevel>
```

If the bench is fully upgraded, show a completed state next to the tier badge. A green checkmark is the preferred visual treatment.

### Unlock Handling

The first upgrade level is the bench **Unlock** tier.

Rules:

- `currentLevel = 0` means the bench is not yet unlocked.
- The first generated upgrade list for such a bench must be labeled as the unlock step.
- Unlock is treated as the first tier in the Hideout view.
- Unlock requirements must participate in planning exactly like later tier requirements.

Recommended display labels:

```text
Unlock
Tier 2
Tier 3
Tier 4
```

For already unlocked benches, future levels should continue to use tier labels.

### Completed Benches

Fully upgraded benches must still be shown in the overview.

Rules:

- Completed benches show the current/max tier badge.
- Completed benches show the completed visual state.
- Completed benches have no generated upgrade lists.
- Completed benches do not contribute planner targets.

### Technical Impact

The Hideout view needs a bench-oriented structure derived from:

```ts
HideoutModuleDefinition[]
CachedHideout | null
StoredList[] // generated hideout lists
```

Generated lists may remain represented as `StoredList` internally, but the Hideout view should group them by module/bench for presentation.

---

## CR-011.5 - Generated Hideout List Behavior in Hideout View

### Affected Areas
- new `HideoutView`
- `src/apps/quartermaster/utils/hideoutLists.ts`
- `src/apps/quartermaster/utils/hideoutStorage.ts`
- Quartermaster planner aggregation input

### Requirement
For every bench, the Hideout view must show one generated item list for every future unlock/tier that is not yet completed.

### Rules

- Generate every future tier per bench, not only the next tier.
- Each generated list contains only the requirement items for that specific unlock/tier.
- Generated lists remain non-cumulative.
- Generated list composition is read-only.
- Generated list quantities are read-only.
- Generated lists are not reorderable.
- Generated list items are not reorderable.
- Users may enable or disable each generated list.
- Users may enable or disable individual items inside each generated list.
- Existing per-list and per-item toggle persistence must remain.
- Obsolete toggle cleanup after progression must remain.

### Naming

Generated list names should distinguish unlock from later tiers.

Recommended names:

```text
<Bench Name> Unlock
<Bench Name> Tier <N>
```

If the list is the next immediate upgrade for that bench, the UI may add a compact `Next` indicator, but the list name itself does not need to include `(Next)` if the Hideout view already communicates that state visually.

### Technical Impact

Existing generated hideout list ids may remain:

```text
hideout_<moduleId>_<level>
```

The UI must parse or otherwise carry `moduleId` and `level` so it can call existing toggle handlers:

```ts
onToggleHideoutList(moduleId, level)
onToggleHideoutItem(moduleId, level, itemId)
```

---

## CR-011.6 - Hideout Planner Priority

### Affected Areas
- `src/apps/quartermaster/index.tsx`
- `src/apps/quartermaster/utils/planner/aggregation.ts`
- `src/apps/quartermaster/utils/planner/*`
- `src/apps/quartermaster/types/planner.ts`

### Requirement
Generated hideout upgrade lists must have higher priority than user-authored lists when computing:

- In Raid suggestions
- Crafting plan
- material deficits
- target ordering
- protected-from-recycling reservations

### Priority Order

Planner aggregation order must be:

1. enabled generated hideout upgrade lists
2. enabled user-authored lists

Inside generated hideout upgrade lists, order must be:

1. next upgrades first
2. remaining future tiers
3. bench/module name ascending
4. target level ascending
5. item order within the generated list
6. value descending
7. item id ascending

Inside user-authored lists, existing user-list order remains:

1. list order
2. item order inside list
3. value descending
4. item id ascending

### Next Upgrade Definition

A generated hideout list is a next upgrade when:

```ts
targetLevel === currentLevel + 1
```

This applies to unlock as well:

```ts
currentLevel === 0 && targetLevel === 1
```

### Duplicate Target Rule

If the same item appears in both hideout and user lists:

- quantities still sum
- hideout priority wins for earliest priority metadata

If the same item appears in multiple hideout lists:

- quantities still sum
- the earliest hideout priority position wins

### Technical Impact

The current planner merge must change from:

```ts
allLists = [...userLists, ...hideoutLists]
```

to a priority-aware model equivalent to:

```ts
allLists = [...orderedHideoutLists, ...userLists]
```

The implementation may either:

- pass ordered lists into the existing planner, or
- extend planner priority metadata with an explicit source priority.

The result must be deterministic.

---

## CR-011.7 - Hideout View Empty and Completed States

### Affected Areas
- new `HideoutView`
- Quartermaster localization dictionaries

### Requirement
The Hideout view must clearly handle all states:

1. static data loading
2. no cached hideout state
3. sync in progress
4. synced with pending upgrades
5. synced with all benches completed
6. unknown cached modules ignored

### Rules

- No cached hideout state: show the sync prompt and no generated upgrade lists.
- Sync in progress: disable the sync button and show loading state.
- Pending upgrades: show bench cards/sections with future unlock/tier lists.
- All completed: show all benches with completed tier badges and no planner-contributing lists.
- Unknown modules from the API must not create UI benches or planner lists.
- The `stash` module remains excluded from hideout upgrade list generation.

### Technical Impact

The view must not synthesize generated lists from fallback bench assumptions. Fallback bench levels remain craftability-only behavior.

---

# 3. MODIFICATIONS TO EXISTING CHANGE REQUESTS

## CR-011.8 - Amend `change-05-hideout-from-api.md` CR-004

### Previous Requirement
The Lists view provides a **Sync Hideouts** button.

### New Requirement
The Hideout view provides the **Sync Hideouts** button.

Generated hideout upgrade lists are no longer displayed in the Lists view.

---

## CR-011.9 - Amend `change-05-hideout-from-api.md` CR-007

### Previous Requirement
Generated hideout upgrade lists exist and participate in planner aggregation.

### New Requirement
Generated hideout upgrade lists still exist and still participate in planner aggregation, but their UI home is the top-level Hideout view.

Planner aggregation must prioritize generated hideout lists before user-authored lists.

---

## CR-011.10 - Replace `change-05-hideout-from-api.md` CR-009

### Previous Requirement
Lists view displays two groups:

- User Lists
- Hideout Upgrade Lists

### New Requirement
Lists view displays only user-authored lists.

Hideout view displays generated hideout upgrade lists grouped by bench/module.

---

# 4. TESTING & VALIDATION

Add or update tests for the following scenarios:

- Sidebar includes `Hideout` between `Lists` and `In Raid`.
- Lists view receives and renders only user-authored lists.
- Lists view no longer renders hideout upgrade groups or Sync Hideouts.
- Hideout view renders Sync Hideouts at the top.
- Hideout view shows no generated lists when no hideout cache exists.
- Hideout view shows every bench from static definitions except excluded modules.
- Hideout view shows completed benches with `Tier <current>/<max>` and completed state.
- Hideout view generates one list for every future unlock/tier.
- Unlock is shown as the first tier for benches with `currentLevel = 0`.
- Generated hideout list and item toggles persist.
- Disabled generated hideout lists do not contribute planner targets.
- Disabled generated hideout items do not contribute planner targets.
- Planner prioritizes hideout-generated targets before user-list targets.
- Duplicate item targets sum quantities while retaining hideout priority metadata.
- In Raid suggestions reflect hideout priority before user-list priority.
- Crafting plan reflects hideout priority before user-list priority.
- Obsolete hideout toggle cleanup still runs after hideout progression.

---

# 5. NON-GOALS

- Do not allow editing generated hideout list names.
- Do not allow editing generated hideout list quantities.
- Do not allow adding or removing generated hideout list items.
- Do not allow reordering generated hideout lists or generated hideout list items.
- Do not move user-authored lists out of the Lists view.
- Do not use fallback bench levels to create hideout upgrade lists.
- Do not introduce server-side planning or persistence changes.
