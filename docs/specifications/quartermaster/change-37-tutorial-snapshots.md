# Change 37 — Quartermaster Tutorial Snapshots

**Status:** Implemented

## Summary

Add an operator-only **Snapshots** section to Profile for preparing Quartermaster
tutorial screencasts. The authorized user can store the currently cached
ArcTracker gameplay situation, browse up to 100 named server-side snapshots,
restore one as the active Quartermaster situation, and delete obsolete
snapshots.

Snapshots are a Raider Tools replay mechanism. They never write data back to
ArcTracker. Restored data deliberately looks like freshly synced live data in
Quartermaster so recorded screencasts remain visually pristine.

## Decisions

- The feature is available only to the Cognito user whose normalized JWT email
  matches the configured server-side `SNAPSHOT_ALLOWED_EMAIL` value.
- The Profile UI obtains its visibility capability from the authenticated
  Profile API; the API independently enforces authorization for every
  snapshot operation.
- Snapshot creation and restoration are available only for the ArcTracker game
  data source.
- Creation captures the current cached state and never starts an automatic
  ArcTracker sync.
- Inventory, loadout, blueprints, hideout, quests, and projects must all be
  present and ArcTracker-backed before a snapshot can be stored.
- ArcTracker profile data is optional and contributes only the player level.
- The Quartermaster portion includes user lists, hideout/project/quest toggle
  state, and prioritized items.
- Weapon builds are not captured and are preserved when a snapshot is restored.
- Restore replaces the current state without optimistic-concurrency conflict
  handling. A confirmation warning is the intentional protection against data
  loss.
- Restore never writes upstream to ArcTracker.
- Restore switches the active game data source to ArcTracker.
- Restored gameplay `syncedAt`, `cachedAt`, and equivalent last-checked
  timestamps are rewritten to the restore time.
- Quartermaster shows no replay badge, banner, or other indication that a
  snapshot is active.
- After restore, Profile remains on the Snapshots section and shows a brief
  success message.
- Snapshot name is required and limited to 80 characters.
- Description is optional and limited to 500 characters.
- Duplicate names are allowed; the opaque snapshot ID is the identity.
- Snapshots are listed newest first.
- At most 100 snapshots may exist. They do not expire automatically.
- When the limit is reached, creation is blocked until a snapshot is deleted.
- Delete requires confirmation. Rename and description editing are out of scope.

---

## 1. Snapshot Scope

### 1.1 Gameplay Payload

Every stored snapshot contains a versioned, normalized copy of:

- `CachedStash`
- `CachedLoadout`
- `CachedBlueprints`
- `CachedHideout`
- `LinkedQuestSnapshot`
- `CachedProjects`

The linked quest snapshot must have `source: "arctracker"`. Every IndexedDB
gameplay record must either explicitly have `source: "arctracker"` or be a
legacy ArcTracker record whose source field is absent.

The cache owner metadata and Cognito identity are not stored inside the replay
payload. Ownership comes exclusively from the authenticated Cognito `sub`.

### 1.2 Quartermaster Payload

The snapshot stores these fields from `quartermasterStore`:

- `lists`
- `hideoutToggles`
- `projectToggles`
- `questToggles`
- `prioritizedItemIds`

The snapshot does not store `weaponBuilds`. On restore, the server reads the
current `STATE#quartermaster` row and combines its current `weaponBuilds` with
the restored fields.

### 1.3 Optional Player Level

If a cached ArcTracker profile exists when the snapshot is created, store its
`playerLevel` as snapshot metadata. Absence of a profile or player level does
not block creation.

### 1.4 Completeness Validation

The Store Snapshot form must read the current local cache without synchronizing.
Creation is disabled and explains the missing domains unless all six required
gameplay domains are available:

1. inventory
2. loadout
3. blueprints
4. hideout
5. quests
6. projects

The form shows the available sync time for each domain so the user can decide
whether to sync elsewhere before capture.

The API repeats structural and source validation. Client validation is UX, not
an authorization or integrity boundary.

---

## 2. Server-Side Storage

### 2.1 DynamoDB Metadata

Extend the existing `raider-tools-users` single-table model with:

| pk | sk | purpose |
|---|---|---|
| `USER#<sub>` | `QM_SNAPSHOT#<time-sortable-id>` | tutorial snapshot metadata and compact summary inputs |

Each metadata row contains at least:

```ts
interface QuartermasterSnapshotMetadata {
  snapshotId: string;
  snapshotSchemaVersion: number;
  source: "arctracker";
  name: string;
  description: string | null;
  createdAt: string;
  playerLevel: number | null;
  payloadKey: string;
  ownedItemQuantities: Record<string, number>;
  hideoutModules: Array<{
    moduleId: string;
    currentLevel: number;
    maxLevel: number;
  }>;
  completedQuestIds: string[];
}
```

`ownedItemQuantities` uses the same canonical owned-item rules as Quartermaster:
stash and loadout roots plus nested attachments, excluding null/unknown IDs and
non-positive quantities.

The time-sortable ID makes a partition query with `ScanIndexForward: false`
return newest-first rows while still providing an opaque route identifier.

The API enforces the 100-snapshot maximum server-side before writing. Because
this is a deliberately single-user operator feature, a query/count check is
sufficient; no separate distributed quota counter is required.

### 2.2 S3 Payload

Create a dedicated private S3 bucket for tutorial snapshot payloads:

- block all public access
- enforce TLS
- server-side encryption
- `RemovalPolicy.RETAIN`
- no automatic expiration
- no public or presigned browser access

Payload key:

```text
quartermaster/tutorial-snapshots/<sub>/<snapshotId>.json.gz
```

The Lambda gzips and writes the versioned JSON payload. Only the snapshot Lambda
has bucket read/write/delete permission.

The full payload is kept out of DynamoDB because inventory/loadout state can
grow beyond the existing 64 KB state-domain cap. A conservative API payload
size cap must be applied below API Gateway's hard request limit and return a
clear validation error when exceeded.

### 2.3 Schema Versioning

The snapshot envelope has its own `snapshotSchemaVersion`; it is independent of
the Quartermaster `UserStateStore` schema version. Restore validates this
version before changing current state.

Future changes to any captured cache shape must add a snapshot migration or
explicitly reject unsupported old versions with a non-destructive error. A
failed compatibility check must not alter the current Quartermaster state or
browser cache.

---

## 3. Authenticated Snapshot API

Add a dedicated JWT-protected Lambda and routes:

```text
GET    /me/quartermaster/snapshots
POST   /me/quartermaster/snapshots
POST   /me/quartermaster/snapshots/{snapshotId}/restore
DELETE /me/quartermaster/snapshots/{snapshotId}
```

All client calls go through typed functions in
`src/shared/services/userApi.ts` and obtain a fresh ID token through
`getIdToken()`.

### 3.1 Authorization

Every route must:

1. trust identity only from the API Gateway JWT authorizer
2. require a Cognito `sub`
3. normalize the JWT email with `trim().toLowerCase()`
4. compare it to the configured `SNAPSHOT_ALLOWED_EMAIL` allowlisted email
5. return `403` for every other user

The allowlisted email is configured on the Lambda environment rather than
accepted from a request. The local API must support the same check through its
existing dev JWT email claim.

### 3.2 List

`GET` returns metadata only, newest first. It never downloads all S3 payloads.
The compact owned-quantity, hideout-module, and completed-quest inputs are
included so the browser can calculate localized summaries using the latest
static game datasets.

### 3.3 Create

`POST` accepts:

- name
- optional description
- versioned gameplay payload
- versioned restorable Quartermaster fields
- optional player level

The Lambda:

1. validates authorization, source, fields, payload size, and completeness
2. enforces the 100-snapshot limit
3. derives summary inputs from the validated payload
4. writes the gzipped payload to S3
5. writes the metadata row to DynamoDB
6. removes the S3 object if the metadata write fails

No upstream ArcTracker call occurs.

### 3.4 Restore

`POST .../{snapshotId}/restore`:

1. authorizes the user and resolves only a snapshot owned by that Cognito `sub`
2. reads and validates metadata and the S3 payload
3. reads the current `STATE#quartermaster` row
4. merges the current `weaponBuilds` into the stored restorable state
5. unconditionally replaces `STATE#quartermaster`, incrementing its revision
6. updates the Profile row to `gameDataSource: "arctracker"`
7. returns the gameplay payload plus the new Quartermaster state envelope

The state/profile server writes should be one DynamoDB transaction. They do not
use the caller's current revision and intentionally implement last-write-wins
for this operator-only action.

The Lambda never calls or writes to ArcTracker.

After the server succeeds, the client:

1. rewrites all gameplay freshness timestamps to one restore-time instant
2. replaces stash, loadout, blueprints, hideout, and projects in one IndexedDB
   read/write transaction
3. replaces the owner-scoped linked quest snapshot in local storage
4. updates cache metadata to the signed-in user and ArcTracker source
5. hydrates/adopts the server-returned Quartermaster state and new revision
6. refreshes shared Profile/game-source state

The rewritten fields include every applicable `syncedAt`, `cachedAt`,
`lastCheckedAt`, and cache-meta freshness field, including nested project
progress timestamps. The snapshot's immutable `createdAt` is not rewritten.

If local cache application fails after the server write, show a recoverable
error and allow Restore to be retried. Do not silently claim success.

### 3.5 Delete

`DELETE` removes the user's metadata and S3 payload. It must not affect the
currently loaded Quartermaster state, even if that state came from the deleted
snapshot.

Missing snapshot IDs return `404`. Access is always scoped by Cognito `sub`.

---

## 4. Profile User Experience

### 4.1 Section Registration

Add a nested Profile route and sidebar entry:

```text
/profile/snapshots
```

Use a Lucide icon. The entry is present only when the signed-in Cognito email,
is authorized by the Profile API. The API remains the authority for every
snapshot operation, including direct navigation.

The API remains the authoritative security control.

### 4.2 Store Snapshot Form

The section begins with:

- required Name input, 1–80 trimmed characters
- optional Description textarea, at most 500 characters
- completeness/source status for all captured domains
- **Store Snapshot** action

The action captures current state only. It must not call any sync API.

On success, clear the form and prepend/reload the new row. At the 100-snapshot
limit, disable storage and instruct the user to delete an existing snapshot.

### 4.3 Snapshot List

Each row/card shows:

- name
- description when present
- stored timestamp
- player level when present
- dynamically calculated owned item value
- dynamically calculated quest completion
- compact unlocked-hideout-bench chips
- Restore action
- Delete action

Duplicate names are valid.

#### Owned Item Value

Calculate with the latest localized Quartermaster item dataset:

```text
sum(current item value × stored owned quantity)
```

Use the same number formatting and item-value semantics as the My Items/Stash
view. Include stash and loadout, including nested attachments. Exclude
currencies and item IDs absent from the current dataset. Label the value
**Owned item value**.

#### Quest Completion

Calculate from the snapshot's completed quest IDs and the latest quest
definitions whenever the list renders:

- exclude map nodes (`trader === "Map"`)
- ignore stored IDs absent from the latest definitions
- show completed count, current total count, and a whole-number percentage

The result intentionally changes if the current quest dataset adds or removes
quests.

#### Hideout Summary

Match stored module IDs to the latest localized hideout definitions. Exclude the
stash module and modules with `currentLevel <= 0`. Render compact chips:

```text
Weapon Bench T3
Refiner T2
Medical Lab T1
```

Unknown module IDs are omitted from the display but remain in the replay
payload.

### 4.4 Restore Confirmation

Restore always presents one general confirmation explaining that it will:

- replace current inventory, loadout, blueprint, hideout, quest, and project
  cache data
- replace current Quartermaster lists, generated-list toggles, and priorities
- preserve weapon builds
- switch the active source to ArcTracker
- not change anything in ArcTracker itself
- be undoable only by restoring another snapshot or by having stored the
  current situation first

No typed-name confirmation or revision-conflict dialog is required.

After success, remain on `/profile/snapshots` and show a brief success message.
Do not navigate to Quartermaster.

### 4.5 Replay Presentation

Quartermaster must render restored data exactly like ordinary current
ArcTracker data:

- no snapshot/replay badge
- no banner
- no altered labels
- no disabled sync controls
- no persistent snapshot name in Quartermaster UI

Subsequent explicit ArcTracker sync actions work normally and may replace the
corresponding restored cache domains.

---

## 5. Local API Parity

Register all snapshot routes in:

- `infra/local/routes.ts`
- `infra/local/server.ts`

Local development uses the same Lambda handler, a local payload-storage fallback
under a narrowly scoped local data directory, and the email claim from
`Authorization: Bearer dev.<sub>.<email>`.

Local route tests must verify method/path matching and authentication.

---

## 6. Localization and Styling

- Add all new UI keys to `src/shared/i18n/locales/en.json`.
- Do not modify any non-English locale file.
- Do not change values of existing English keys.
- Use the existing Profile/settings SCSS architecture.
- Add new styles in SCSS; do not introduce inline styles.
- Reuse existing settings controls, confirmation modal patterns, status/error
  patterns, and Lucide icons.

---

## 7. Documentation Updates Before Implementation

After this change request is approved, implementation must begin by updating:

1. `docs/specifications/quartermaster/specification-quartermaster.md`
   - add tutorial snapshot scope and behavior
   - add the Profile UX and replay rules
   - add validation scenarios and explicit non-goals
2. `docs/User-Data.md`
   - add the DynamoDB snapshot row family
   - add the S3 payload store
   - document routes, limits, ownership, restore semantics, and sign-out/cache
     behavior
3. `docs/Local-Development.md`
   - document the local snapshot storage fallback and authorized dev email

Only after those final/reference documents are updated may application and
infrastructure implementation begin.

---

## 8. Implementation Plan

### Phase 1 — Final Specifications

- Apply the documentation updates in section 7.
- Define the snapshot envelope and API contracts in the final specification.

### Phase 2 — Server and Infrastructure

- Add the private retained tutorial-snapshot S3 bucket.
- Add the snapshot Lambda with list/create/restore/delete operations.
- Add DynamoDB and S3 IAM grants.
- Add JWT-protected API Gateway routes.
- Add local route parity and local storage fallback.
- Update the User Data row-family documentation.

### Phase 3 — Shared Client Services and Cache Operations

- Add snapshot request/response types and typed API functions.
- Add an atomic IndexedDB gameplay-cache replacement helper.
- Add an owner-scoped linked-quest snapshot write helper.
- Add restore-time timestamp normalization.
- Add canonical snapshot summary-input aggregation.
- Ensure restored remote Quartermaster state adopts the new server revision
  without issuing a second conflicting write.

### Phase 4 — Profile UI

- Register the authorized-only Profile section and route.
- Implement the capture form, completeness display, 100-item limit state, and
  create flow.
- Implement localized dynamic summaries from current static datasets.
- Implement restore/delete confirmations and success/error feedback.
- Add Profile SCSS and English-only translation keys.

### Phase 5 — Verification

- Run focused unit and integration tests.
- Run the full test suite.
- Run `npm run build`.
- Do not start the development server or perform browser testing.

---

## 9. Test and Acceptance Matrix

### Authorization

1. Authorized email sees the Profile section.
2. Other emails do not see it and direct UI navigation is rejected.
3. Every API operation returns `403` for a non-allowlisted JWT email.
4. Snapshot ownership is always scoped by Cognito `sub`.

### Creation

5. Creation captures current cache without triggering a sync.
6. Missing any required domain blocks creation and identifies the domain.
7. Missing player profile/level does not block creation.
8. Embark-active or Embark-backed data blocks creation.
9. Name/description limits are validated client- and server-side.
10. Duplicate names are accepted.
11. Snapshot 100 is accepted; snapshot 101 is rejected until one is deleted.
12. Full payload is gzipped in private S3 and metadata is stored in DynamoDB.

### Listing and Summaries

13. Rows are newest first and list metadata does not download S3 payloads.
14. Owned value matches current My Items semantics for stash, loadout, and
    attachments.
15. Unknown current item IDs and currencies do not affect owned value.
16. Quest completion uses current non-map definitions and stored completion
    state.
17. Adding/removing current quest definitions changes the displayed percentage.
18. Hideout chips use current localized names, show unlocked tiers, and omit
    stash/locked/unknown modules.
19. Player level is shown only when captured.

### Restore

20. Confirmation describes every destructive effect before restore.
21. Restore replaces all six gameplay domains.
22. Restore replaces lists/toggles/priorities and preserves current weapon
    builds.
23. Restore is last-write-wins and does not show a revision-conflict flow.
24. Restore switches profile source to ArcTracker.
25. Restore never calls ArcTracker.
26. Restored freshness timestamps equal the restore time, including nested
    project and quest timestamps.
27. Cache owner/source metadata remains bound to the signed-in user.
28. Quartermaster renders restored state without any replay indicator.
29. Profile remains on the snapshot section and reports success.
30. A later normal sync can replace restored data.
31. Unsupported/corrupt snapshots fail before changing current state.

### Delete and Lifecycle

32. Delete requires confirmation and removes metadata plus payload.
33. Delete does not change currently loaded state.
34. Sign-out wipes restored browser caches through the existing user-data wipe.
35. Local development routes and authorized dev-email behavior match production.

---

## 10. Explicit Non-Goals

- Writing restored data back to ArcTracker
- Supporting Embark snapshot creation
- Making snapshots available to other users
- Sharing snapshots by URL
- Snapshot rename or description editing
- Automatic retention expiry
- Snapshot diffing
- A replay badge or other Quartermaster disclosure
- Restoring weapon builds
- Per-field or revision-conflict merging
- Automatic ArcTracker synchronization before capture
