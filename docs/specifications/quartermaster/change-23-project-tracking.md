# Change-23: Project Tracking

## Status
Implemented

## Summary
Add community project tracking to Quartermaster. Users can track required items for in-game community projects (Trophy Display, Avian Alarm, Seasonal Expeditions). Projects have multiple sequential steps (phases), each requiring specific items in given quantities. Items are submitted step-by-step in-game — only the current incomplete step can be progressed. The Quartermaster tracks all pending project items and helps protect them from recycling.

## Motivation
Quartermaster already tracks Hideout required items and user-created lists. Projects are the third major category of required items. Unlike Hideout upgrades (submitted all at once per tier), project goals are submitted incrementally. The Embark API provides per-goal submission progress (`amount` submitted vs `required`), allowing the planner to compute exactly how many items are still needed.

## Requirements

### Data Layer (R1)
- Import project definitions from `../arcraiders-data/projects.json` into `public/data/quartermaster/projects.<locale>.json`
- Generate locale-specific files via `scripts/generate-quartermaster-projects.ts`
- Add project definition types (`ProjectDefinition`, `ProjectStep`, `ProjectRequirementItem`)
- Include `startDate` and `endDate` (Unix epoch seconds) in the generated data
- Copy `../embark-api/arcraiders-api-mapping/project-mapping.json` to `infra/lambda/data/` for server-side Embark API response decoding
- Clean up redundant expedition project names: `"Expedition Project (Expedition 4)"` → `"Expedition 4"`

### State & Store (R2)
- Add `projectToggles` to `QuartermasterState` (mirrors `hideoutToggles`): `{ listEnabled: Record<string, boolean>, itemEnabled: Record<string, boolean> }`
- Keys: `projectId:stepIndex` (list) and `projectId:stepIndex:itemId` (item)
- Bump `QuartermasterState` schema version from 2 to 3
- Add `'project'` to `ListType` and `StoredList.type`

### List Generation (R3)
- Generate one `StoredList` per project step with `type: 'project'`
- List ID format: `project_<projectId>_<stepIndex>` (stepIndex is 1-based)
- List naming: `"Step <N> (<StepName>)"` (project name not repeated in step rows)
- Generate lists for ALL pending steps regardless of completion, not just the current one
- A step marked as completed (by API) defaults to disabled
- All other steps default to enabled
- **Expired projects**: Projects whose `endDate` (Unix epoch seconds) is earlier than the current time are filtered out entirely — they produce no lists, are not shown in the Projects view, and contribute no planner targets, regardless of whether cached progress exists for them
- **Completed projects**: Completed projects remain visible in the Projects view as long as they are not expired. Expired projects are hidden even if fully completed
- **No-fallback**: Lists are only generated for projects that exist in both the static definitions AND the cached progress. Projects present in definitions but absent from cached progress are silently skipped

### Planner Integration (R4)
- Project lists merge into `allLists` after hideout and before user lists
- Priority order: `hideout → project → user`
- `requiredSourcesByItemId` tracks project list provenance
- `getListIcon()` shows `BriefcaseBusiness` for project type
- Tooltip "Needed for" entries show project list name with briefcase icon

### Projects View UI (R5)
- New top-level view between Hideout and In Raid in the sidebar
- Sidebar nav item: "Projects" with `BriefcaseBusiness` icon and optional badge count
- Badge count: number of project steps where all required items are owned and the step is the current incomplete step ("available to submit")
- Top controls bar: "Sync Projects" button + segmented tracking control ("Disable All", "Next Steps Only", "Enable All Pending") + collapse/expand all
- Project cards as collapsible sections (sorted: incomplete first, then complete)
- Each project card header: toggle enable/disable eye button, project name, tracking count badge, "Submit Available" badge
- Expanded project shows step cards in a flex-wrap layout
- Each step card: toggle enable/disable for the step, step name, completed/available pill badges
- Each step shows item cards (mirroring Hideout item layout) with missing deficit badge and green checkmark for satisfied items
- Individual items can be toggled on/off

### Sync APIs (R6)
- **ArcTracker**: `GET /api/v2/user/projects` via the existing `/me/arctracker/` proxy
  - Returns step-level completion only (`phase.completed: boolean`)
  - Goals array is empty (ArcTracker doesn't report per-goal progress)
  - All items in incomplete steps treated as "needed"
- **Embark**: New `POST /me/embark/projects/sync` Lambda endpoint
  - Calls `POST /v1/pioneer/projects/list` upstream
  - Decodes response through `project-mapping.json` to resolve `projectAssetId`/`goalAssetId` to project IDs and item IDs
  - Returns per-goal progress: `required`, `submitted`, `remaining`, `completed`
- **Embark read**: `GET /me/embark/projects` returns latest cached project progress
- Both endpoints follow existing throttling, group gating, and token validation patterns
- Sync uses the active `gameDataSource` (arctracker or embark) — same logic as all other Quartermaster views

### Available-to-Submit Logic (R7)
- A step is "available to submit" only if:
  1. It is the first incomplete step in its project (all prior steps are completed)
  2. The user owns all required items in sufficient quantity
- Only current steps trigger the "Submit Available" badge and sidebar counter
- Future steps (beyond the current incomplete) show required items but do NOT show submit-available

### Toggle Persistence (R8)
- Toggles stored in `quartermasterStore.projectToggles`
- `cleanupObsoleteProjectToggles()` removes toggle state for completed steps after sync
- Persisted via existing `UserStateStore` infrastructure (IndexedDB + server-side)

## Design Decisions

### Per-Step Lists (Not Per-Goal)
Each project step generates a single list containing all goals for that step. Individual items within the step can be independently toggled. This is simpler than per-goal lists (which would produce 4+ tiny lists per step) and matches how players think about steps.

### All Pending Steps Tracked
All steps generate lists, not just the current incomplete step. This allows players to proactively collect items for future steps while they work on the current one.

### Project-Mapping.json as Static Artifact
The Embark project mapping is pre-generated and bundled with the Lambda (in `infra/lambda/data/`). It maps Embark's integer `projectAssetId`/`goalAssetId` to human-readable project/step/goal names and item IDs. This avoids runtime lookups.

### No S3 Snapshots for Projects
Unlike inventory, project data is small enough to store inline in DynamoDB. No S3 snapshot storage is needed.

### Separate Embark Lambda
A dedicated `embark-projects.ts` Lambda with its own throttle keys avoids coupling with the inventory sync flow. Users can sync projects independently.

## Files Changed

| File | Change |
|------|--------|
| `scripts/generate-quartermaster-projects.ts` | **NEW** Locale-specific project JSON generator |
| `public/data/quartermaster/projects.json` | **NEW** Raw multilang project definitions |
| `public/data/quartermaster/projects.*.json` | **NEW** 13 locale-specific project files |
| `infra/lambda/data/project-mapping.json` | **NEW** Embark project mapping artifact |
| `src/apps/quartermaster/types/project.ts` | **NEW** Project types |
| `src/apps/quartermaster/utils/projectLists.ts` | **NEW** Project list generation |
| `src/apps/quartermaster/utils/projectStorage.ts` | **NEW** Project toggle storage |
| `src/apps/quartermaster/components/views/ProjectsView.tsx` | **NEW** Projects view component |
| `src/apps/quartermaster/styles/_projects-view.scss` | **NEW** Projects view styles |
| `infra/lambda/embark-projects.ts` | **NEW** Embark projects sync Lambda |
| `src/apps/quartermaster/index.tsx` | State, callbacks, project list generation, sync wiring, view rendering |
| `src/apps/quartermaster/types/planner.ts` | Add `'project'` to `ListType` |
| `src/apps/quartermaster/types/list.ts` | Add `'project'` to `StoredList.type` |
| `src/apps/quartermaster/utils/dataLoader.ts` | Add `loadProjectDefinitions()` |
| `src/apps/quartermaster/utils/localization.ts` | Add `formatProjectListName()` |
| `src/apps/quartermaster/utils/api.ts` | Re-export `syncProjects`, `getProjects`, `CachedProjects` |
| `src/apps/quartermaster/utils/planner/aggregation.ts` | Sort projects after hideout, before user |
| `src/apps/quartermaster/utils/planner/provenance.ts` | Accept `'project'` in list type |
| `src/apps/quartermaster/utils/itemInsights.ts` | Accept `'project'` in list type |
| `src/apps/quartermaster/components/Sidebar.tsx` | Add 'projects' nav item + badge |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | Add `BriefcaseBusiness` icon |
| `src/apps/quartermaster/styles/main.scss` | Import `_projects-view.scss` |
| `src/apps/quartermaster/utils/preferences.ts` | Add `'projects'` to `QuartermasterViewId` |
| `src/shared/types/arctracker.ts` | Add `ArctrackerProjectsResponse`, `CachedProjects` types |
| `src/shared/services/arctrackerApi.ts` | Add `syncProjects()`, `getProjects()` |
| `src/shared/services/cacheService.ts` | Add `getCachedProjects()`, extend `CacheValue` |
| `src/shared/services/gameDataApi.ts` | Add `getEmbarkProjects()`, `syncEmbarkProjects()` |
| `src/shared/state/stores.ts` | Add `projectToggles`, bump schema to v3 |
| `src/shared/state/__tests__/hydration.test.ts` | Add `projectToggles` to test fixture |
| `src/shared/i18n/locales/en.json` | Add project translation keys |
| `infra/lib/raider-tools-stack.ts` | Add `embarkProjectsFn` Lambda + routes |
| `infra/local/server.ts` | Add `embarkProjects` handler |
| `infra/local/routes.ts` | Add project route keys |
| `package.json` | Add `generate:projects-quartermaster` script |

## Test Coverage
- Existing 97 quartermaster tests continue to pass
- No dedicated project unit tests yet (UI-only feature at this stage)
