# Change-28: ArcTracker Project Requirements Display

## Status
Proposed

## Summary
The ArcTracker projects API (`/v2/user/projects`) now returns per-phase `requirements` (item-based `{itemId, required, submitted}`) and `categoryRequirements` (category-based `{category, required, submitted}`). Currently `syncProjects()` discards this data entirely (`goals: []`). This change populates the cached goal structures from the API response, surfaces per-item submission progress in the Projects view, and adds category requirement progress bars for phases like "Load Stage" and "Departure" that have no individual item requirements.

## Motivation
- ArcTracker users see zero per-item progress in the Projects view today — only phase-level completion
- The new API provides granular `submitted`/`required` counts that enable exact "still needed" calculations
- Category-based requirements (e.g., "250,000 value of Combat Items") have no representation at all
- Embark users already get this via the `embark-projects.ts` Lambda + `project-mapping.json`; this brings parity

---

## Requirements

### R1 — Add ArcTracker API Response Types

**File(s)**: `src/shared/types/arctracker.ts`

**Change type**: addition

**Detail**:
Add two named interfaces and extend `ArctrackerProjectPhase`:

```typescript
export interface ArctrackerProjectRequirement {
  itemId: string;
  required: number;
  submitted: number;
}

export interface ArctrackerProjectCategoryRequirement {
  category: string;
  required: number;
  submitted: number;
}

export interface ArctrackerProjectPhase {
  phase: number;                                                      // ADD — API provides this
  name: string;
  completed: boolean;
  requirements?: ArctrackerProjectRequirement[];                      // ADD
  categoryRequirements?: ArctrackerProjectCategoryRequirement[];      // ADD
}
```

### R2 — Add Cached Category Goal Type

**File(s)**: `src/shared/types/arctracker.ts`

**Change type**: addition

**Detail**:
Add `CachedProjectCategoryGoal` interface (parallel to `CachedProjectGoal` but for category-based requirements):

```typescript
export interface CachedProjectCategoryGoal {
  category: string;
  required: number;
  submitted: number;
  remaining: number;
  completed: boolean;
}
```

Append `categoryRequirements?: CachedProjectCategoryGoal[]` to `CachedProjectStepProgress`:

```typescript
export interface CachedProjectStepProgress {
  name: string;
  index: number;
  completed: boolean;
  goals: CachedProjectGoal[];
  categoryRequirements?: CachedProjectCategoryGoal[];   // ADD
}
```

### R3 — Make `CachedProjectGoal.goalAssetId` Optional

**File(s)**: `src/shared/types/arctracker.ts`

**Change type**: modification

**Detail**:
Change `goalAssetId` from `number` to `number | undefined` — the ArcTracker API provides `itemId` directly (no integer asset IDs), so goals populated from that path will not have a `goalAssetId`. The Embark Lambda path still populates it.

```typescript
export interface CachedProjectGoal {
  goalAssetId?: number;     // was: goalAssetId: number
  itemId: string;
  required: number;
  submitted: number;
  remaining: number;
  completed: boolean;
}
```

### R4 — Transform ArcTracker API Response into Goals

**File(s)**: `src/shared/services/arctrackerApi.ts`

**Change type**: modification

**Detail**:
Replace the inline `goals: []` placeholder in `syncProjects()` with a call to a new extracted `transformProjectGoals()` function. The function:

1. Maps `phase.requirements` → `CachedProjectGoal[]`:
   - `itemId`: from requirement
   - `required`: from requirement
   - `submitted`: from requirement
   - `remaining`: `required - submitted` (clamped to ≥ 0)
   - `completed`: `submitted >= required`
   - `goalAssetId`: `undefined` (not provided by ArcTracker)
2. Maps `phase.categoryRequirements` → `CachedProjectCategoryGoal[]`:
   - `category`: from requirement
   - `required`: from requirement
   - `submitted`: from requirement
   - `remaining`: `required - submitted` (clamped to ≥ 0)
   - `completed`: `submitted >= required`
3. Uses `phase.phase` directly as the step `index` (no `index + 1` fallback)
4. Requirements for `itemId`s not present in the static project definitions are skipped (the definitions remain authoritative for which items belong to which phase)

Extract as:

```typescript
function transformProjectGoals(
  proj: ArctrackerProject,
): { goals: CachedProjectGoal[]; categoryRequirements: CachedProjectCategoryGoal[] } {
  // ... mapping logic
}
```

The existing `syncProjects()` signature and cache-write behavior are unchanged.

### R5 — Add `categoryRequirements` to `StoredList`

**File(s)**: `src/apps/quartermaster/types/list.ts`

**Change type**: modification

**Detail**:
Add `categoryRequirements` field to `StoredList`:

```typescript
export interface StoredListCategoryGoal {
  category: string;
  required: number;
  submitted: number;
  remaining: number;
}

export interface StoredList {
  id: string;
  name: string;
  type: 'user' | 'hideout' | 'project' | 'quest';
  isEnabled: boolean;
  items: ListItem[];
  categoryRequirements?: StoredListCategoryGoal[];   // ADD
}
```

### R6 — Populate `categoryRequirements` in Project List Generation

**File(s)**: `src/apps/quartermaster/utils/projectLists.ts`

**Change type**: modification

**Detail**:
In `generateProjectLists()`, for each phase that has `progressInfo?.categoryRequirements`, copy them into the generated `StoredList.categoryRequirements`. The mapping is a straight pass-through — no cross-referencing with static definitions needed.

Existing logic for `items` (item-based requirements, `quantity = goal.remaining`) is unchanged and now works for ArcTracker-sourced data since goals are populated (R4).

### R7 — Render Category Progress Bars in ProjectsView

**File(s)**: `src/apps/quartermaster/components/views/ProjectsView.tsx`

**Change type**: modification

**Detail**:
Below each step's item grid (`.projects-view__items`), when `list.categoryRequirements` is non-empty, render a category summary section with per-category progress bars:

- Each category row shows: category label, `{formatNumber(submitted)} / {formatNumber(required)}`, and a horizontal progress bar with fill percentage `(submitted / required) * 100`
- When all categories in a step are completed, the section uses a completed style
- Number formatting uses `formatNumber` from `useLocale()`

### R8 — Suppress Green Checkmark for Already-Submitted Items

**File(s)**: `src/apps/quartermaster/components/views/ProjectsView.tsx`

**Change type**: modification

**Detail**:
The green checkmark (`.projects-view__item-complete`, line 586) currently indicates "user owns enough items to submit." When an item is already fully submitted server-side (`submitted >= required`), `remaining === 0` makes `owned >= 0` always true, causing a misleading checkmark.

Add a condition to suppress the checkmark: render only when `isRequirementAvailable && !(hasProgress && listItem.submitted! >= listItem.required!)`. Already-submitted items should appear as disabled (cannot be toggled) with no checkmark.

### R9 — Fix "Submit Available" Badge for Fully Submitted Steps

**File(s)**: `src/apps/quartermaster/components/views/ProjectsView.tsx`

**Change type**: modification

**Detail**:
The "Submit Available" badge (lines 334–342) checks whether all current-step items have `owned >= quantity`. With server-side completion, items have `remaining === 0`, making the badge incorrectly light up for fully-submitted steps.

Modify the `hasAvailableSubmit` check to exclude items where `submitted !== undefined && required !== undefined && submitted >= required`. The badge should only appear when the user actually has items to submit.

### R10 — Add Category Bar Styles

**File(s)**: `src/apps/quartermaster/styles/_projects-view.scss`

**Change type**: addition

**Detail**:
Add styles for:
- `.projects-view__category-requirements` — container
- `.projects-view__category-row` — individual category row
- `.projects-view__category-label` — category name
- `.projects-view__category-progress` — progress bar track
- `.projects-view__category-progress-fill` — filled portion
- `.projects-view__category-counts` — submitted/required text

---

## Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types/arctracker.ts` | R1: `ArctrackerProjectRequirement`, `ArctrackerProjectCategoryRequirement`, extend `ArctrackerProjectPhase`. R2: `CachedProjectCategoryGoal`, extend `CachedProjectStepProgress`. R3: `goalAssetId` → optional |
| `src/shared/services/arctrackerApi.ts` | R4: Extract `transformProjectGoals()`, populate goals + categoryRequirements, use `phase.phase` for index |
| `src/apps/quartermaster/types/list.ts` | R5: Add `categoryRequirements` to `StoredList` |
| `src/apps/quartermaster/utils/projectLists.ts` | R6: Populate `categoryRequirements` on generated lists |
| `src/apps/quartermaster/components/views/ProjectsView.tsx` | R7: Category progress bars. R8: Checkmark suppression. R9: Submit-available fix |
| `src/apps/quartermaster/styles/_projects-view.scss` | R10: Category bar styles |

### No New Files

### No Deleted Files

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|------------------|
| Phase has `requirements` but no `categoryRequirements` | Items rendered normally with submitted/required progress; no category section |
| Phase has `categoryRequirements` but no `requirements` (e.g., Load Stage, Departure) | Empty item grid + category progress bars rendered below |
| Phase has neither `requirements` nor `categoryRequirements` | Behaves as today (empty goals, phase-level completion only) |
| API returns a requirement `itemId` not in static definitions | Skipped silently (R4) |
| Phase `completed: true` but `submitted < required` for some items | API inconsistency — trust `completed` for step state, still show individual progress |
| Category requirement with `required: 0` | Avoid division by zero in progress bar; show 0% filled |
| Embark data source | No change — Embark path populates goals via `embark-projects.ts`, `categoryRequirements` remains `undefined` |
| API response missing `phase` field on a phase object | TypeScript compile error — `phase: number` is required on `ArctrackerProjectPhase` |
| All items in a step fully submitted (`submitted >= required` for all) | Step shows as completed; items disabled, no green checkmark, no Submit Available badge |
| Some items submitted, some not, user has inventory for submitted ones | Submitted items: disabled, no checkmark. Unsubmitted items: checkmark shown if inventory sufficient |

---

## Rollout Strategy

1. **Types** (R1–R3, R5): Update `arctracker.ts` and `list.ts` — pure type additions, no behavioral change, no compilation impact
2. **Transformation** (R4): Extract `transformProjectGoals()` in `arctrackerApi.ts`, wire into `syncProjects()` — ArcTracker users now get populated `goals` and `categoryRequirements` in cache
3. **List generation** (R6): Pass through `categoryRequirements` in `projectLists.ts` — data reaches view model
4. **Display** (R7–R9): Category bars, checkmark suppression, submit-available fix in `ProjectsView.tsx`
5. **Styles** (R10): Add category bar SCSS
6. **Verify**: Run `npm run build`, `npm test`
