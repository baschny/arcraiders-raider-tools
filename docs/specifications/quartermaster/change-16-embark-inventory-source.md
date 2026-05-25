# Change Request 16: Embark Inventory Source For Quartermaster

## Status
- **Date**: 2026-05-24
- **Status**: Proposed
- **Area**: Quartermaster game-data source integration, Embark inventory sync, shared mapping generation, and sync UX

## Context & Problem
Quartermaster currently consumes user game data through the ArcTracker integration. The current ArcTracker-backed model uses separate user-facing sync paths for:

- stash/inventory
- loadout
- hideout
- blueprints

Direct Embark API access changes the source shape. The Embark endpoint:

```text
GET /v1/pioneer/inventory
```

contains all user-owned and user-unlocked state needed by Quartermaster:

- stash content
- loadout content
- hideout/chamber bench tiers
- learned blueprint unlocks

It also contains additional unlock and account inventory state that other Raider Tools apps may later consume. Therefore, Embark inventory must not be treated as a Quartermaster-only API detail. It should be implemented as shared Raider Tools game-data infrastructure, with Quartermaster as the first consumer.

The inventory decoding logic needs a generated mapping table bundled with Lambda code. The source mapping data lives in the sibling `../embark-api` project, primarily under:

```text
../embark-api/data/arctracker*.json
../embark-api/arcraiders-api-mapping/*.json
```

Raider Tools needs a repeatable script to generate the Lambda mapping artifact from those files so deployed code does not depend on the sibling repository at runtime.

## Goals
This change must:

1. Add Embark inventory as a global Raider Tools game-data source usable by Quartermaster.
2. Keep all Embark API calls server-side.
3. Generate and commit the Lambda mapping table from `../embark-api`.
4. Decode one Embark inventory sync into Quartermaster's existing runtime cache concepts.
5. Add a global Quartermaster sync control for Embark mode.
6. Preserve existing ArcTracker-mode UX and per-view sync controls.
7. Keep planner inputs stable after normalization.
8. Preserve cached data when sync fails.
9. Show clear token expiry, throttle, and mapping diagnostics.

## Non-Goals
This change must not:

- Add background or scheduled Embark sync.
- Add browser-side Embark API calls.
- Replace the Embark link/auth flow.
- Remove ArcTracker support.
- Change the planner algorithm except where required to consume normalized Embark data.
- Add rounds, quests, mastery objectives, or player stats sync.
- Add an admin UI.
- Add static NAT egress or outbound IP rotation.

## Source Selection
Raider Tools must support a global game-data source setting:

```ts
type GameDataSource = 'arctracker' | 'embark';
```

The source setting is account-level state and must be stored server-side on the user profile row.

Rules:

- ArcTracker remains the default source for existing users.
- Embark can be selected only when the user has an active Embark link and is allowed to use Embark.
- Quartermaster uses exactly one active source at runtime.
- Quartermaster must not combine ArcTracker and Embark data in one planner run.
- If Embark is active and the token expires, Quartermaster must prompt re-authentication and continue showing stale Embark cache when available.
- Quartermaster must not silently fall back to ArcTracker on Embark token expiry.

## Embark Auth Gate
All Embark data endpoints must enforce a Cognito group gate:

```text
embark-auth
```

The check must happen in Lambda, not only in the UI.

Implementation notes:

- Read `cognito:groups` from the API Gateway JWT authorizer claims.
- Add a helper in `infra/lambda/_lib/http.ts` or a dedicated auth helper to read group membership.
- Local development may bypass this gate only when `RAIDER_TOOLS_LOCAL_DEV=true`, or it may accept a configurable local test group claim.
- A denied request must return a stable error code:

```json
{ "error": "not_enabled" }
```

## Mapping Generation
### Required Script
Add a repository script that generates the mapping artifact used by the Embark inventory Lambda:

```text
scripts/generate-embark-inventory-mapping.js
```

Add an npm entry point:

```json
"generate:embark-inventory-mapping": "node ./scripts/generate-embark-inventory-mapping.js"
```

The generated file must be committed to Raider Tools:

```text
infra/lambda/data/embark-inventory-mapping.json
```

The production Lambda must read only this generated file. It must not read from `../embark-api` at runtime.

### Source Inputs
The generator must read from `../embark-api`:

```text
../embark-api/data/arctracker-items.json
../embark-api/data/arctracker-items-unknown.json
../embark-api/data/arctracker-structures.json
../embark-api/data/arctracker-blueprints.json
../embark-api/data/arctracker-benches.json
../embark-api/data/arctracker-chambers.json
../embark-api/data/arctracker-currencies.json
../embark-api/arcraiders-api-mapping/augment-loadout-mapping.json
../embark-api/arcraiders-api-mapping/blueprint-mapping.json
../embark-api/arcraiders-api-mapping/hideout-mapping.json
```

If paths differ in the sibling project, the generator may support a configurable root:

```bash
EMBARK_API_ROOT=../embark-api npm run generate:embark-inventory-mapping
```

### Generated Shape
The generated file must be deterministic and sorted by key.

Minimum required shape:

```ts
interface EmbarkInventoryMappingFile {
  version: 1;
  generatedAt: string;
  sourceRoot: string;
  sources: Record<string, string>;
  gameAssetIdToItemId: Record<string, string>;
  gameAssetIdToItemName: Record<string, string>;
  structureNames: Record<string, string>;
  blueprintUnlocksByTokenAssetId: Record<string, {
    targetItemId: string;
    blueprintAssetId?: number;
    name?: string;
  }>;
  hideoutBenchLevelsByGeneratorAssetId: Record<string, {
    moduleId: string;
    currentLevel: number;
    maxLevel: number;
    name?: string;
  }>;
  augmentLoadoutsByAugmentAssetId: Record<string, {
    loadoutFrameAssetId: number;
    backpackSlots: number;
    quickUseSlots: number;
    safePocketSlots: number;
    auxiliarySlots: number;
    name?: string;
  }>;
  constants: {
    inventoryRootAssetId: number;
    currentAugmentAssetId: number;
    regularItemSlotAssetId: number;
    weaponSlotAssetId: number;
    quickUseSlotAssetId: number;
    safePocketSlotAssetId: number;
    meleeSlotAssetId: number;
    workshopRootAssetId: number;
    workshopBenchSlotAssetId: number;
  };
}
```

`generatedAt` may use the current timestamp, but all semantically meaningful sections must be stable for identical inputs.

### Validation
The generator must fail with a non-zero exit code when:

- `../embark-api` data is missing.
- A required mapping file is missing.
- A required constant cannot be resolved.
- Duplicate conflicting mappings are found.
- The generated mapping would be empty.

The generator should print a concise summary:

- number of item mappings
- number of structure mappings
- number of blueprint unlock mappings
- number of hideout bench level mappings
- number of augment mappings
- number of unknown item mappings included

### Integration With Existing Generation
The script should be included in local data-generation workflow documentation.

It may be added to `npm run generate` only if it does not make normal generation fragile for users who lack `../embark-api`. If it remains separate, the Embark implementation instructions must explicitly require running:

```bash
npm run generate:embark-inventory-mapping
```

before committing Embark decoder changes.

## Backend API
### Routes
Add shared Embark inventory routes:

```text
GET  /me/embark/inventory
POST /me/embark/inventory/sync
```

`GET /me/embark/inventory` returns the latest normalized server-side snapshot and metadata without calling Embark.

`POST /me/embark/inventory/sync` performs an upstream Embark inventory fetch if allowed, stores raw and normalized results, and returns the normalized snapshot.

Both routes require:

- Raider Tools Cognito JWT.
- Embark access group.
- linked Embark token.

Only `POST /sync` consumes throttle budget and calls Embark.

### Response Shape
The server must return one bundled inventory snapshot:

```ts
interface EmbarkInventorySnapshot {
  source: 'embark';
  syncedAt: string;
  cachedAt: number;
  manifestId: string;
  schemaVersion: 1;
  rawSnapshotId: string;
  stash: CachedStash;
  loadout: CachedLoadout;
  hideout: CachedHideout;
  blueprints: CachedBlueprints;
  diagnostics: {
    unknownGameAssetIds: number[];
    unknownItemInstances: Array<{
      gameAssetId: number;
      instanceId?: string;
      amount?: number;
      context: 'stash' | 'loadout' | 'blueprint' | 'hideout' | 'other';
    }>;
    mappingVersion: number;
  };
}
```

`CachedStash`, `CachedLoadout`, `CachedHideout`, and `CachedBlueprints` should remain compatible with existing Quartermaster cache usage where practical.

### Error Codes
Embark inventory endpoints must return stable error codes:

- `not_enabled`
- `not_linked`
- `token_expired`
- `manifest_mismatch`
- `rate_limited_user`
- `rate_limited_global`
- `embark_unavailable`
- `decode_failed`
- `mapping_incomplete`

For throttling, return HTTP `429` with:

```ts
interface ThrottleErrorBody {
  error: 'rate_limited_user' | 'rate_limited_global';
  retryAfterSeconds: number;
  nextAllowedAt: string;
  remainingTokens: number;
}
```

### Raw Snapshot Storage
Store raw Embark inventory responses in S3:

- compressed JSON
- encrypted at rest
- 14-day lifecycle expiration
- key includes user id, resource, timestamp, and random suffix

Example key:

```text
embark/raw-inventory/USER_SUB/yyyy/mm/dd/yyyy-mm-ddTHH-mm-ssZ-SNAPSHOT_ID.json.gz
```

Do not include plaintext tokens in S3 keys or metadata.

### DynamoDB Rows
Use the existing user table and avoid new `pk` prefixes.

Recommended rows:

| pk | sk | Purpose |
| --- | --- | --- |
| `USER#<sub>` | `PROFILE` | add `gameDataSource` |
| `USER#<sub>` | `EMBARK#INVENTORY#LATEST` | latest normalized inventory snapshot or S3 pointer plus metadata |
| `USER#<sub>` | `THROTTLE#embark#inventory` | per-user token bucket |
| `GLOBAL#embark` | `THROTTLE#inventory` | global token bucket, if using DynamoDB for global budget |

If a new `GLOBAL#` prefix is introduced, `docs/User-Data.md` must be updated in the same implementation change.

The normalized snapshot may be stored directly in DynamoDB only if it is safely below the 400 KB item limit. Otherwise store normalized JSON in S3 and keep only metadata and an S3 key in DynamoDB.

### Throttling
Use a persisted token bucket for `embark:inventory`.

Initial policy should support user bursts during stash cleanup:

- per-user bucket for inventory sync
- global bucket for all Embark-enabled users
- one in-flight inventory sync per user
- no background consumers

Exact numbers may be tuned during implementation, but the first implementation must expose them as constants or environment configuration.

### Lambda Implementation
Add a new Lambda:

```text
infra/lambda/embark-inventory.ts
```

Add reusable helpers as needed:

```text
infra/lambda/_lib/embarkInventoryDecode.ts
infra/lambda/_lib/embarkThrottle.ts
infra/lambda/_lib/embarkSnapshotStorage.ts
```

The Lambda must:

1. Parse route and method.
2. Resolve user id from JWT.
3. Enforce Embark access group.
4. Load `LINK#embark`.
5. Reject expired tokens before upstream calls.
6. For GET, return latest normalized snapshot or `404` if none exists.
7. For POST, consume throttle, fetch Embark inventory, store raw snapshot, decode, store normalized snapshot, and return it.

### Local API Parity
Update `infra/local/server.ts` with matching routes:

```text
GET  /me/embark/inventory
POST /me/embark/inventory/sync
```

Local development may use:

- local Embark request env vars already present
- a fixture mode for inventory decoding tests
- DynamoDB Local for latest snapshot and throttle rows

## Inventory Decode Contract
The decoder input is the raw flat Embark inventory response:

```ts
interface EmbarkRawInventory {
  items: EmbarkRawInventoryItem[];
}

interface EmbarkRawInventoryItem {
  amount: number;
  durability: number;
  etag?: string;
  gameAssetId: number;
  instanceId: string;
  maxDurability: number;
  slots: string[] | null;
  updatedAt?: number;
}
```

The decoder must:

1. Build an `instanceId` map.
2. Resolve non-empty `slots` references.
3. Detect the character inventory root.
4. Extract stash items from main and extra stash regular item slots.
5. Extract selected augment from `Current Augment`.
6. Resolve selected augment to loadout frame using generated mapping.
7. Extract loadout items from backpack, weapon, shield, quick-use, melee, safe pocket, and auxiliary slots.
8. Extract learned blueprint unlocks from root-level `OnlineItem` unlock tokens.
9. Extract hideout bench levels from workshop generator items.
10. Preserve unknown `gameAssetId`s in diagnostics.

Unknown IDs must not fail the entire sync unless they prevent required root traversal.

## Quartermaster UX
### ArcTracker Mode
Existing ArcTracker-mode UX must continue as it works today:

- My Items view has the combined stash/loadout sync action.
- Hideout view has its existing hideout sync action.
- Crafting view has its existing blueprint sync action.
- Existing stale ArcTracker modal behavior may remain.

This preserves the current separate ArcTracker API model.

### Embark Mode
When the active source is Embark, Quartermaster must show a single global sync action for the application.

Location:

- Add the Embark sync button to the Quartermaster global header area.
- The control should be visible on all Quartermaster views except possibly the welcome view if that view has its own source setup flow.

Behavior:

- Button label: `Sync`
- While syncing: `Syncing inventory...`
- Tooltip or helper text: syncs inventory, loadout, hideout, and blueprints from Embark.
- On success, update cached stash, loadout, hideout, and blueprints together.
- On failure, keep the previous cached snapshot active.
- If throttled, show the next allowed sync time.
- If the token is expired, show a reconnect action linking to `/profile/embark`.
- If the user is not enabled for preview, show a concise unavailable state.

In Embark mode, per-view sync buttons must not trigger separate Embark resource syncs:

- My Items should not show a separate source-specific sync button, or it should delegate to the global Embark sync action.
- Hideout should not show a separate Embark hideout sync button.
- Crafting should not show a separate Embark blueprint sync button.

The views may still display the relevant latest sync timestamps.

### Source Status In Header
The Quartermaster header should display:

- active source: ArcTracker or Embark
- latest sync timestamp for the active source
- Embark token expiry warning when relevant
- mapping warning count when unknown items were found

For Embark mode, one timestamp is enough because one inventory sync updates all Quartermaster data domains.

For ArcTracker mode, existing separate stash/loadout timestamps may remain.

### Unknown Items
Unknown Embark items must be visible enough for preview/debugging:

- Known mapped items participate in planner quantities.
- Unknown items do not participate in planner calculations.
- Unknown items appear in diagnostics or a collapsed "Unknown items" section in My Items.
- Unknown item display should include `gameAssetId`, quantity, and source context where possible.

Do not hide unknown items silently in Embark mode.

## Client Services
Add a source-aware shared game-data service:

```text
src/shared/services/gameDataApi.ts
```

Responsibilities:

- Read active source from `/me`.
- For ArcTracker source, delegate to existing `arctrackerApi.ts` functions.
- For Embark source, call `POST /me/embark/inventory/sync`.
- Write returned Embark `stash`, `loadout`, `hideout`, and `blueprints` into existing IndexedDB cache keys.
- Preserve active cache owner behavior.
- Expose a typed `syncQuartermasterGameData()` helper for Quartermaster.
- Expose a typed `getQuartermasterGameDataCache()` helper for initialization.

Existing cache keys may remain:

```ts
type CacheKey = 'profile' | 'stash' | 'loadout' | 'hideout' | 'blueprints' | 'meta';
```

However, cache metadata must record the source:

```ts
interface CacheMeta {
  lastSyncedAt: number | null;
  version: number;
  userSub: string | null;
  source?: 'arctracker' | 'embark';
}
```

If the active source changes, cached game-data values from the previous source must not be reused as current planner input. The implementation may clear the cache on source change or keep separate source-scoped entries.

## Quartermaster Code Changes
Expected affected areas:

- `src/apps/quartermaster/index.tsx`
  - read active source
  - route sync behavior by source
  - add Embark global sync state
  - remove per-view Embark sync triggers
- `src/apps/quartermaster/components/GlobalHeader.tsx`
  - add source-aware global sync control for Embark mode
  - show source and sync metadata
- `src/apps/quartermaster/components/views/StashView.tsx`
  - keep existing ArcTracker behavior
  - avoid duplicate Embark sync button or delegate to global sync
  - display unknown Embark items/diagnostics if provided
- `src/apps/quartermaster/components/views/HideoutView.tsx`
  - keep ArcTracker hideout sync button
  - suppress or delegate sync in Embark mode
- `src/apps/quartermaster/components/views/CraftingView.tsx`
  - keep ArcTracker blueprint sync button
  - suppress or delegate sync in Embark mode
- `src/apps/quartermaster/utils/api.ts`
  - preserve existing aggregation helpers
  - route cache reads through source-aware game-data helpers where needed
- `src/shared/services/cacheService.ts`
  - include source in cache metadata
  - prevent cross-source cache reuse
- `src/shared/types/arctracker.ts`
  - either generalize cache type names or keep them as compatible implementation names

The planner should continue receiving:

```ts
ownedItemQuantities
benchLevels
unlockedBlueprintItemIds
```

No planner algorithm changes are expected if Embark normalization produces compatible cache shapes.

## Profile API Changes
Extend `/me` response and patch support:

```ts
interface MeResponse {
  gameDataSource: 'arctracker' | 'embark';
}
```

Allow:

```http
PATCH /me
{ "gameDataSource": "embark" }
```

Validation:

- `arctracker` is always accepted.
- `embark` requires linked Embark status and Embark access.
- If validation fails, return a stable error code.

## Documentation Updates
Implementation must update:

- `docs/specifications/Embark-API.md`
- `docs/specifications/Embark-API-Future.md`
  - revise Quartermaster phase 1 to one inventory sync, not separate resource syncs
  - mention generated mapping artifact
- `docs/User-Data.md`
  - add any new row families or prefixes used for snapshots/throttles
  - document `PROFILE.gameDataSource`
- `docs/Local-Development.md`
  - document local Embark inventory route behavior
- `docs/specifications/quartermaster/specification-quartermaster.md`
  - after this change request is approved, fold in the final accepted behavior

## Verification Plan
### Mapping Generator
- Generator fails when `../embark-api` is missing.
- Generator output is deterministic for identical inputs, except for `generatedAt`.
- Generated mapping contains item, structure, blueprint, hideout, and augment mappings.
- Conflicting mappings fail loudly.

### Backend
- `GET /me/embark/inventory` returns 404 before first sync.
- `POST /me/embark/inventory/sync` rejects users without Embark access.
- Expired Embark token returns `token_expired` without upstream call.
- Throttled request returns 429 with retry metadata.
- Successful sync stores raw compressed S3 snapshot.
- Successful sync stores latest normalized snapshot metadata.
- Decode failure preserves raw snapshot and returns `decode_failed`.
- Unknown IDs return successful snapshot with diagnostics.

### Decoder
- Raw inventory fixture produces expected stash items.
- Raw inventory fixture produces expected loadout items.
- Raw inventory fixture produces expected hideout bench levels.
- Raw inventory fixture produces expected learned blueprint target item IDs.
- Selected augment is resolved through generated augment mapping.
- Unknown `gameAssetId`s are preserved in diagnostics.

### Client And Quartermaster
- ArcTracker mode keeps existing per-view sync buttons and behavior.
- Embark mode shows one global Quartermaster sync button.
- Embark global sync updates stash, loadout, hideout, and blueprints from one request.
- Embark mode does not call ArcTracker sync endpoints.
- Source switch prevents stale cross-source cache reuse.
- Planner output uses Embark-owned quantities, hideout levels, and blueprint unlocks.
- Token expiry prompts reconnect and preserves stale cache.
- Throttle errors show next sync time.
- Unknown Embark items are visible in diagnostics or My Items and do not affect planner calculations.

## Open Implementation Decisions
- Exact token-bucket capacity and refill rate for `embark:inventory`.
- Whether normalized latest inventory snapshot is stored directly in DynamoDB or in S3 with a DynamoDB pointer.
- Whether source-scoped IndexedDB cache keys are preferable to clearing cache on source changes.
- Exact global header layout for source, sync, token expiry, and unknown diagnostics.
- Whether the generated mapping artifact should be included in top-level `npm run generate` or remain an explicit Embark-only generation step.
