# CHANGE REQUEST
## Quartermaster Specification Update - Unlocked Blueprint Synchronization and Craftability

Document Type: Structured Delta vs Previous Specification
Scope: Quartermaster API integration, local cache, Crafting UI, and planner craftability
Impact Level: Feature addition with planner behavior change
Version: CR-Blueprint-Sync-v1

---

# 1. SUMMARY

Quartermaster must use the user's currently learned blueprints when deciding whether blueprint-locked items are craftable.

ArcTracker exposes learned blueprint state through:

```
https://arctracker.io/api/v2/user/blueprints
```

Raider Tools must fetch this data through the existing ArcTracker proxy/service layer, cache it locally, and pass learned blueprint availability into the Quartermaster planner.

Example source fixture:

```
docs/sample/arctracker-api/blueprints.json
```

---

# 2. ADDITIONS

---

## CR-001 - Add Blueprint API Synchronization

### Type
Addition

### Affected Section
4. DYNAMIC API INTEGRATION

### New Section
4.6 Blueprint Integration

### Change

Quartermaster must support synchronizing learned blueprints from the ArcTracker user blueprints endpoint.

Upstream endpoint:

```
GET https://arctracker.io/api/v2/user/blueprints
```

Per the ArcTracker proxy integration rules, Quartermaster must not call `arctracker.io` directly. The request must go through the shared Raider Tools ArcTracker API service/proxy layer.

Expected upstream response shape:

```ts
interface ArcTrackerBlueprintResponse {
  data: {
    blueprints: ArcTrackerBlueprint[]
  }
}

interface ArcTrackerBlueprint {
  id: string
  name: string
  category: string
  rarity: string
  learned: boolean
  targetItemId: string
}
```

Example:

```json
{
  "id": "deadline_blueprint",
  "name": "Deadline Blueprint",
  "category": "Explosives",
  "rarity": "Common",
  "learned": true,
  "targetItemId": "deadline"
}
```

If `learned` is `true`, the item identified by `targetItemId` must be considered blueprint-unlocked.

### Technical Impact

- Add shared ArcTracker API service support for user blueprints.
- Add a Quartermaster sync path for blueprints.
- Normalize the response into a lookup keyed by `targetItemId`.
- Unknown `targetItemId` values must be ignored by planner logic.

---

## CR-002 - Add Local Blueprint Cache

### Type
Addition

### Affected Section
4. DYNAMIC API INTEGRATION

### Change

Fetched blueprint state must be cached locally in Raider Tools.

Cache must store:

```ts
interface CachedBlueprints {
  unlockedItemIds: string[]
  blueprintsByTargetItemId: Record<string, CachedBlueprint>
  syncedAt: string
}

interface CachedBlueprint {
  id: string
  name: string
  category: string
  rarity: string
  learned: boolean
  targetItemId: string
}
```

Rules:

- `unlockedItemIds` contains only blueprints with `learned === true`.
- `unlockedItemIds` must be sorted ASCII ascending.
- `blueprintsByTargetItemId` must be keyed by `targetItemId`.
- Cache writes must replace the previous cached blueprint state atomically.
- Failed sync must not clear the previous cache.
- Sign-out must wipe cached blueprint state along with other user-specific Quartermaster state.

### Technical Impact

- Add IndexedDB/local storage support consistent with existing ArcTracker cached user data.
- Add typed read/write helpers.
- Include blueprint cache in sign-in hydration/sign-out wipe behavior if it is stored through shared user state mechanisms.

---

## CR-003 - Add "Sync Unlocked Blueprints" Button to Crafting UI

### Type
Addition

### Affected Section
7.6 Crafting View

### Change

The Crafting UI panel must provide a **Sync Unlocked Blueprints** button next to the existing **Sync My Items** button.

Behavior:

- Clicking the button triggers blueprint synchronization.
- While syncing, the button must show a loading/disabled state.
- On success, cached blueprint state and planner output must refresh.
- On failure, the previous cached blueprint state must remain active.
- When cached blueprint state is available, the button must show learned blueprint progress, e.g. `40/70 unlocked`.
- The UI should expose the last blueprint sync timestamp when available, following the existing timestamp style used for inventory/loadout syncs.

Authentication behavior:

- If the user is not authenticated, show the existing auth-gated prompt behavior.
- A 401 from the sync path must prompt re-authentication using the existing ArcTracker error handling conventions.

### Technical Impact

- Extend `CraftingView` props with blueprint sync state and handler.
- Wire the Quartermaster root state to cached blueprint data.
- Add localization keys for the new button and any timestamp/error labels.

---

## CR-004 - Extend Planner Input With Blueprint Availability

### Type
Addition

### Affected Section
6.3 Definitions for Planning

### Change

Planner execution must receive a set of learned blueprint target item ids:

```ts
type UnlockedBlueprintItemIds = Set<ItemId>
```

This set is derived from the cached blueprint API response:

```ts
blueprints
  .filter(blueprint => blueprint.learned)
  .map(blueprint => blueprint.targetItemId)
```

The planner must use this runtime set instead of treating generated `item.blueprintLocked` as the final user-specific unlock decision.

### Technical Impact

- Extend `computePlan(...)` and `runGreedyPlanner(...)` inputs with unlocked blueprint item ids.
- Thread the set into the craftability predicate.
- Keep planner deterministic for identical item data, stash, lists, bench levels, and unlocked blueprint set.

---

# 3. MODIFICATIONS

---

## CR-005 - Replace Static Blueprint-Lock Craftability With Runtime Blueprint State

### Type
Modification

### Affected Section
6.3.5 Craftability Predicate

### Previous Behavior

An item is locally craftable only if:

- item has `recipe`
- `blueprintLocked` is false
- `craftBench` is defined
- required bench exists in planner
- bench level >= `stationLevelRequired`

### New Behavior

An item is locally craftable if:

- item has `recipe`
- `craftBench` is defined
- required bench exists in planner
- bench level >= `stationLevelRequired`
- blueprint availability passes the runtime rule below

Runtime blueprint availability rule:

```ts
if (!item.blueprintLocked) {
  return true
}

return unlockedBlueprintItemIds.has(item.id)
```

Meaning:

- Items not marked `blueprintLocked` in static data remain craftable without API blueprint state.
- Items marked `blueprintLocked` are craftable only when their `item.id` appears in the learned blueprint cache.
- For `deadline`, a learned API entry with `targetItemId: "deadline"` makes Deadline craftable.

### Technical Impact

- Remove direct `if (item.blueprintLocked) return uncraftable` behavior.
- Add an explicit blueprint availability helper/predicate.
- Preserve `blueprint_locked` blocker diagnostics only for items that are statically blueprint-locked and absent from the unlocked blueprint set.

---

## CR-006 - Define Blueprint Cache Fallback Behavior

### Type
Modification

### Affected Section
6.3.5 Craftability Predicate

### Change

If no blueprint cache exists yet, Quartermaster must use this conservative fallback:

- `blueprintLocked: false` items are craftable.
- `blueprintLocked: true` items are treated as not locally craftable until blueprints are synced.

This avoids silently assuming locked recipes are available once a real blueprint API exists.

The Crafting UI must make the remedy discoverable by showing **Sync Unlocked Blueprints** next to **Sync My Items**.
Use a tooltip to explain the need for blueprint sync when blueprint-locked items are present:
"Sync blueprints to check craftability for locked items".

### Technical Impact

- Planner must distinguish between an empty synced blueprint set and missing blueprint cache when useful for UI messaging.
- Crafting view should guide users to sync blueprints when blueprint-locked blockers exist and no blueprint cache is present.

---

## CR-007 - Keep Static Blueprint Metadata in Generated Item Data

### Type
Modification

### Affected Section
2.1.2 Final Item Schema

### Change

The generated `blueprintLocked` field remains part of item data.

Its meaning changes from "the user cannot craft this" to:

> This item requires a learned blueprint according to static game data.

User-specific craftability is determined by combining:

- static `item.blueprintLocked`
- runtime learned blueprint cache

### Technical Impact

- No item importer schema removal required.
- Existing generated data remains useful as the static requirement marker.

---

# 4. TESTING REQUIREMENTS

---

## CR-008 - Blueprint API and Cache Tests

### Type
Addition

### Affected Section
12. Testing

### Requirements

Add tests covering:

- Parsing `docs/sample/arctracker-api/blueprints.json`.
- Learned blueprints produce sorted `unlockedItemIds`.
- Unlearned blueprints do not appear in `unlockedItemIds`.
- Unknown `targetItemId` values do not crash planner execution.
- Failed sync preserves previous cached blueprint state.

---

## CR-009 - Planner Craftability Tests

### Type
Addition

### Affected Section
12. Testing

### Requirements

Add planner tests covering:

- `blueprintLocked: false` craftable item remains craftable without blueprint cache.
- `blueprintLocked: true` item is not craftable when absent from `unlockedBlueprintItemIds`.
- `blueprintLocked: true` item is craftable when present in `unlockedBlueprintItemIds`.
- Deadline example:
  - Required list contains `deadline` x1.
  - Stash contains `comet_igniter` x1, `explosive_compound` x3, `arc_alloy` x80.
  - Unlocked blueprint set contains `deadline`.
  - Planner must produce craft steps for `arc_circuitry` x2 and `deadline` x1, assuming sufficient bench levels.

---

# 5. NON-GOALS

- Do not add manual blueprint editing in this change.
- Do not infer learned blueprints from quest completion.
- Do not write back blueprint state to ArcTracker.
- Do not perform any in-game crafting action.
- Do not remove `blueprintLocked` from generated item data.
