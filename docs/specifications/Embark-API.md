# Embark API Integration

This document describes the current Embark API integration in Raider Tools from a code and infrastructure perspective. It covers the implemented account-linking flow, inventory sync pipeline, storage layers, cache behavior, and the Quartermaster-facing normalized snapshot model.

For linked-account token storage rules, DynamoDB row families, and sign-out wipe behavior, also read `docs/User-Data.md`. For future work, incomplete implementation details, admin tooling, and additional Embark resources, read `docs/specifications/Embark-API-Future.md`.

## Overview

Raider Tools integrates with Embark through authenticated Raider Tools backend routes. The browser never calls Embark directly and never receives the Embark access token.

Current phase-1 scope is Quartermaster. One Embark inventory sync calls:

```text
GET /v1/pioneer/inventory
```

and decodes the response into four normalized Quartermaster domains:

- stash
- loadout
- hideout
- blueprints

The integration also supports a global game-data source selection on the Raider Tools user profile:

```ts
type GameDataSource = 'arctracker' | 'embark';
```

## Architecture

```text
Browser SPA
  │
  ├─ /me
  ├─ /me/links/embark/start
  ├─ /me/links/embark/complete
  ├─ /me/links/embark
  ├─ /me/embark/inventory
  └─ /me/embark/inventory/sync
  │
  ▼
API Gateway HTTP API + Cognito JWT authorizer
  │
  ├─ ProfileFn            infra/lambda/profile.ts
  ├─ LinksFn              infra/lambda/links.ts
  ├─ EmbarkLinkFn         infra/lambda/embark-link.ts
  └─ EmbarkInventoryFn    infra/lambda/embark-inventory.ts
  │
  ├─ DynamoDB             raider-tools-users
  ├─ KMS                  alias/raider-tools/user-secrets
  ├─ Secrets Manager      raider-tools/embark/oauth
  ├─ SSM Parameter Store  /raider-tools/embark/manifest-id
  ├─ SSM Parameter Store  /raider-tools/embark/user-agent
  └─ S3                   Embark raw + normalized snapshots
  │
  ▼
Embark Auth + Embark API
```

## Access Model

### Authentication and gating

All Embark endpoints require a Raider Tools Cognito JWT. Embark-specific routes also require membership in the Cognito group:

```text
embark-auth
```

The group check is enforced in Lambda with `hasJwtGroup(...)`, not just in the client UI.

Implemented gating points:

- `infra/lambda/embark-link.ts`
- `infra/lambda/embark-inventory.ts`
- `infra/lambda/profile.ts` when switching `gameDataSource` to `embark`

### Embark is a linked account

Embark is not a Raider Tools sign-in provider. Users sign in to Raider Tools first, then link Embark under `/profile/embark`.

The client-side typed API is in:

- `src/shared/services/userApi.ts`

The profile UI and callback flow live in:

- `src/pages/profile/EmbarkSection.tsx`
- `src/pages/EmbarkCallback.tsx`

## Linking Flow

The link flow is implemented as a two-step PKCE OAuth flow handled entirely through Raider Tools backend routes.

### Start

Route:

```text
POST /me/links/embark/start
```

Handler:

- `infra/lambda/embark-link.ts`

Request body:

```ts
{
  provider: 'steam' | 'epic' | 'playstation' | 'xbox';
  returnUrl: string;
}
```

What the Lambda does:

1. Verifies the user is in `embark-auth`.
2. Validates the provider and `returnUrl`.
3. Generates a PKCE verifier/challenge pair.
4. Generates a random OAuth `state`.
5. Stores a pending auth row in DynamoDB with a 10-minute TTL.
6. Returns the Embark authorize URL plus the generated `state` and `supportId`.

Pending auth row shape:

```text
pk = USER#<sub>
sk = EMBARKAUTH#<state>
```

Stored fields include:

- `provider`
- `verifier`
- `redirectUri`
- `returnUrl`
- `supportId`
- `createdAt`
- `ttl`

The OAuth authorize URL is built in `infra/lambda/_lib/embark.ts` with:

- `client_id=embark-pioneer`
- PKCE `S256`
- `audience=https://pioneer.embark.net`
- `scope=pioneer openid offline`
- `tenancy=pioneer-live`
- `external_provider_name=<provider>`

### Complete

Route:

```text
POST /me/links/embark/complete
```

Handler:

- `infra/lambda/embark-link.ts`

Request body:

```ts
{
  code: string;
  state: string;
}
```

What the Lambda does:

1. Verifies the user is in `embark-auth`.
2. Loads `USER#<sub> / EMBARKAUTH#<state>`.
3. Rejects missing or expired pending state.
4. Exchanges the authorization code for an Embark token.
5. Fetches the Embark shared profile.
6. Envelope-encrypts the token JSON payload with KMS-backed helpers.
7. Stores the linked-account row in DynamoDB.
8. Updates the user profile so `gameDataSource = "embark"`.
9. Deletes the pending auth row.

The token exchange and profile request helpers live in:

- `infra/lambda/_lib/embark.ts`

## Token and Profile Storage

The linked Embark account is stored as:

```text
pk = USER#<sub>
sk = LINK#embark
```

The encrypted payload is the full Embark token JSON response, not only the access token string.

The row also stores unencrypted derived metadata used by the API and UI:

- `provider`
- `supportId`
- `expiresAt`
- `linkedAt`
- `profileFetchedAt`
- `cachedProfile`

`expiresAt` is derived from the access-token JWT `exp` claim where possible, with `expires_in` as fallback.

Embark link status is returned through:

```text
GET /me/links/embark
```

implemented in `infra/lambda/links.ts`.

Returned status shape:

```ts
type EmbarkLinkStatus =
  | { linked: false }
  | {
      linked: true;
      provider: string | null;
      supportId?: string | null;
      expiresAt: string | null;
      linkedAt: string | null;
      profileFetchedAt: string | null;
      expired: boolean;
      countdownMinutes?: number | null;
      profile: EmbarkProfileSummary | null;
    };
```

## Global Game-Data Source

The current active game-data source is stored on the `PROFILE` row as `gameDataSource`.

Handled by:

- `infra/lambda/profile.ts`

`GET /me` returns:

- `gameDataSource`
- `features.embarkEnabled`
- `links.embark`

`PATCH /me` allows:

```json
{ "gameDataSource": "embark" }
```

with these validations:

- `arctracker` is always accepted.
- `embark` requires `embark-auth`.
- `embark` requires an existing `LINK#embark` row.
- `embark` requires a non-expired token.

The effective `GET /me` response only returns `"embark"` as active when:

- the stored source is `embark`
- the link exists
- the user still has the `embark-auth` group

Otherwise it falls back to `"arctracker"` in the response layer.

## Inventory Sync API

The Embark inventory integration uses two authenticated routes:

```text
GET  /me/embark/inventory
POST /me/embark/inventory/sync
```

Handler:

- `infra/lambda/embark-inventory.ts`

### `GET /me/embark/inventory`

Behavior:

- Returns the latest normalized snapshot without calling Embark.
- Reads `USER#<sub> / EMBARK#INVENTORY#LATEST`.
- If the row contains an inline snapshot, returns it.
- If the row points to S3, loads the normalized snapshot from S3 and returns it.

Possible current errors:

- `404 { error: "not_synced" }`
- `404 { error: "snapshot_schema_unsupported" }`

### `POST /me/embark/inventory/sync`

Behavior:

1. Verifies `embark-auth`.
2. Loads `LINK#embark`.
3. Rejects missing link with `not_linked`.
4. Rejects expired tokens with `token_expired`.
5. Consumes the per-user token bucket.
6. Consumes the global token bucket.
7. Decrypts the stored token payload.
8. Loads request config (`manifestId`, `userAgent`) from env or SSM.
9. Calls `GET /v1/pioneer/inventory`.
10. Decodes the raw inventory into normalized Quartermaster data.
11. Stores raw and normalized snapshots in S3 when available.
12. Stores the latest-row metadata in DynamoDB.
13. Returns the normalized snapshot to the client.

The upstream request headers are built in `infra/lambda/_lib/embark.ts` and include:

- `Authorization: Bearer <access_token>`
- `User-Agent`
- `x-embark-manifest-id`

## Normalized Snapshot Shape

The normalized response shape is defined in:

- `infra/lambda/_lib/embarkInventoryDecode.ts`
- `src/shared/services/gameDataApi.ts`

Current top-level shape:

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

The decoder treats `/v1/pioneer/inventory` as a full owned-state graph, not as a flat stash list. The single response is decoded into:

- `stash`
- `loadout`
- `hideout`
- `blueprints`
- `diagnostics`

Unknown mappings do not abort the sync. They are collected into diagnostics so the UI can surface incomplete mapping coverage.

## Inventory Decoder and Mapping Artifact

The inventory decoder is implemented in:

- `infra/lambda/_lib/embarkInventoryDecode.ts`

It reads a generated mapping artifact:

- `infra/lambda/data/embark-inventory-mapping.json`

That artifact is generated by:

- `scripts/generate-embark-inventory-mapping.js`

and wired into:

- `package.json`
  - `npm run generate:embark-inventory-mapping`

### Generator inputs

The generator reads mapping and analysis data from the sibling repository:

```text
../embark-api/
```

Supported override:

```bash
EMBARK_API_ROOT=../embark-api npm run generate:embark-inventory-mapping
```

Current input set:

- `data/arctracker-items.json`
- `data/arctracker-items-unknown.json`
- `data/arctracker-structures.json`
- `data/arctracker-blueprints.json`
- `data/arctracker-benches.json`
- `data/arctracker-chambers.json`
- `data/arctracker-currencies.json`
- `arcraiders-api-mapping/augment-loadout-mapping.json`
- `arcraiders-api-mapping/blueprint-mapping.json`
- `arcraiders-api-mapping/hideout-mapping.json`
- `arcraiders-api-mapping/embark-constants.json`
- `public/data/quartermaster/items.json`

### Generated mapping contents

The generated JSON currently includes:

- `version`
- `generatedAt`
- `sourceRoot`
- `sources`
- `gameAssetIdToItemId`
- `gameAssetIdToItemName`
- `structureNames`
- `blueprintUnlocksByTokenAssetId`
- `hideoutBenchLevelsByGeneratorAssetId`
- `augmentLoadoutsByAugmentAssetId`
- `constants`

The generator fails on missing required files, unresolved required constants, conflicting mappings, or empty critical sections.

## Server-Side Storage

### DynamoDB latest-row metadata

The current latest inventory row is stored as:

```text
pk = USER#<sub>
sk = EMBARK#INVENTORY#LATEST
```

Stored metadata includes:

- `source`
- `syncedAt`
- `cachedAt`
- `manifestId`
- `schemaVersion`
- `rawSnapshotId`
- `rawSnapshotKey`
- `normalizedSnapshotKey`
- `snapshot` when S3 is unavailable
- `diagnostics`
- `updatedAt`

### S3 raw and normalized snapshots

Snapshot storage helper:

- `infra/lambda/_lib/embarkSnapshotStorage.ts`

Bucket:

- provisioned in `infra/lib/raider-tools-stack.ts`

Behavior:

- When `EMBARK_SNAPSHOT_BUCKET_NAME` is available and local-dev bypass is not active, the Lambda stores both raw and normalized JSON snapshots in S3.
- Objects are gzipped.
- Keys are written under:

```text
embark/inventory/<userId>/<yyyy/mm/dd>/<timestamp>-<snapshotId>...
```

- The bucket has a 14-day lifecycle expiration for the `embark/inventory/` prefix.

When the snapshot bucket is not configured, the latest-row still stores `rawSnapshotId` and keeps the normalized snapshot inline in DynamoDB.

## Throttling

Embark sync throttling is implemented in:

- `infra/lambda/_lib/embarkThrottle.ts`

Throttle state is persisted in DynamoDB, not process memory.

Current token buckets:

- per user:
  - `pk = USER#<sub>`
  - `sk = THROTTLE#embark#inventory`
- global:
  - `pk = GLOBAL#embark`
  - `sk = THROTTLE#inventory`

Default current configuration:

- user bucket capacity: `6`
- user refill interval: `300` seconds
- user refill tokens: `1`
- global bucket capacity: `120`
- global refill interval: `60` seconds
- global refill tokens: `20`

The implementation uses conditional writes so concurrent consumers do not overwrite each other silently.

Current 429 errors:

- `rate_limited_user`
- `rate_limited_global`

Both include:

- `retryAfterSeconds`
- `nextAllowedAt`
- `remainingTokens`

## Client Cache Integration

Quartermaster consumes Embark inventory through:

- `src/shared/services/gameDataApi.ts`

The normalized snapshot is persisted into the existing IndexedDB cache service:

- `src/shared/services/cacheService.ts`

Cache characteristics:

- database: `raiderToolsCache`
- object store: `arctracker`
- owner-aware by Cognito `sub`
- source-aware by `arctracker` or `embark`

On Embark sync or fetch, the client writes:

- `stash`
- `loadout`
- `hideout`
- `blueprints`
- `meta`

Each normalized object is marked with:

```ts
source: 'embark'
```

`meta` also records:

- `source: 'embark'`
- `embarkInventorySyncedAt`
- `embarkUnknownGameAssetIds`

The cache is cleared automatically when:

- the signed-in user changes
- the active cache source changes

## Quartermaster Consumption

Quartermaster uses the Embark-backed cache and sync client through:

- `src/apps/quartermaster/index.tsx`

Current behavior:

- `getMe()` determines the active `gameDataSource`.
- `getQuartermasterGameDataCache('embark')` loads the local Embark cache and falls back to `GET /me/embark/inventory` if no local normalized cache exists.
- `syncEmbarkInventory()` performs the server-side sync.
- A single Embark sync updates stash, loadout, hideout, and blueprints together.
- Embark diagnostics are surfaced in the stash view as unknown inventory entries.
- ArcTracker mode keeps separate sync controls; Embark mode uses the single bundled inventory sync.

Relevant files:

- `src/apps/quartermaster/index.tsx`
- `src/apps/quartermaster/components/GlobalHeader.tsx`
- `src/apps/quartermaster/components/views/StashView.tsx`

## Error Handling

Current stable or effectively stable Embark-specific error codes in the implementation include:

| Route | Status | Error |
|------|--------|-------|
| `/me/links/embark/start` | 403 | `not_enabled` |
| `/me/links/embark/complete` | 403 | `not_enabled` |
| `/me/embark/inventory` | 403 | `not_enabled` |
| `/me/embark/inventory` | 404 | `not_synced` |
| `/me/embark/inventory/sync` | 401 | `not_linked` |
| `/me/embark/inventory/sync` | 401 | `token_expired` |
| `/me/embark/inventory/sync` | 429 | `rate_limited_user` |
| `/me/embark/inventory/sync` | 429 | `rate_limited_global` |
| `/me/embark/inventory/sync` | 502 | `manifest_mismatch` |
| `/me/embark/inventory/sync` | 500 | `decode_failed` |
| `/me/embark/inventory/sync` | 500 | `embark_unavailable` |
| `/me` PATCH `gameDataSource=embark` | 403 | `not_enabled` |
| `/me` PATCH `gameDataSource=embark` | 400 | `not_linked` |
| `/me` PATCH `gameDataSource=embark` | 400 | `token_expired` |

`supportId` is used in the link flow for troubleshooting and is returned by the start/complete endpoints when relevant.

## Local Development

The local API server mirrors the production Embark routes in:

- `infra/local/server.ts`

Local defaults:

- `RAIDER_TOOLS_LOCAL_DEV=true`
- Production: `EMBARK_LOOPBACK_REDIRECT_URI=http://127.0.0.1:49174`
- Local development: `EMBARK_LOOPBACK_REDIRECT_URI=http://127.0.0.1:49176`
- `EMBARK_MANIFEST_ID=local-dev-manifest`
- `EMBARK_USER_AGENT=RaiderToolsLocalDev/0.1`

To simulate group gating locally, use:

```bash
LOCAL_COGNITO_GROUPS=embark-auth
```

When `RAIDER_TOOLS_LOCAL_DEV=true`, S3 snapshot persistence is skipped and the normalized snapshot stays inline on the latest DynamoDB row.

## Security Notes

Non-negotiable implemented rules:

1. The browser never calls Embark directly.
2. Embark access tokens are stored only as envelope-encrypted server-side linked-account data.
3. The SPA never receives the Embark token after linking.
4. Embark request configuration (`manifestId`, `userAgent`) is treated as operational config, not per-user data.
5. Cached client game-data snapshots remain subject to the existing sign-out wipe and owner/source cache isolation rules.

## File Map

| File | Purpose |
|------|---------|
| `infra/lambda/embark-link.ts` | Embark OAuth start/complete flow |
| `infra/lambda/embark-inventory.ts` | Embark inventory read/sync endpoints |
| `infra/lambda/links.ts` | Embark link status and unlink |
| `infra/lambda/profile.ts` | `gameDataSource` and feature gating on `/me` |
| `infra/lambda/_lib/embark.ts` | OAuth, profile, inventory, and request-config helpers |
| `infra/lambda/_lib/embarkInventoryDecode.ts` | Inventory decoder |
| `infra/lambda/_lib/embarkThrottle.ts` | Persisted token-bucket throttling |
| `infra/lambda/_lib/embarkSnapshotStorage.ts` | Raw/normalized S3 snapshot storage |
| `infra/lambda/data/embark-inventory-mapping.json` | Generated decoder mapping artifact |
| `scripts/generate-embark-inventory-mapping.js` | Mapping generator |
| `src/shared/services/userApi.ts` | Typed `/me` and Embark link client |
| `src/shared/services/gameDataApi.ts` | Embark game-data client and cache persistence |
| `src/shared/services/cacheService.ts` | IndexedDB cache owner/source isolation |
| `src/pages/profile/EmbarkSection.tsx` | Profile UI for linking and status |
| `src/pages/EmbarkCallback.tsx` | OAuth callback completion page |
| `src/apps/quartermaster/index.tsx` | Quartermaster consumer of Embark snapshots |
| `infra/lib/raider-tools-stack.ts` | CDK resources and route wiring |
