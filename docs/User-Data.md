# User Data
This document is the single entry point for future AI agents (and humans) working on anything that **stores data on behalf of a user** on the server, syncs per-user client state across devices, or manages externally-held tokens (ArcTracker, Embark, …) attached to a user account.

For anything about **how users sign in** (Cognito, Discord bridge, custom-auth triggers, custom domain, session lifecycle), read `docs/Authentication.md` instead. The two documents are intentionally split. They reference each other where the concerns overlap — e.g. `signOut()` in the auth layer triggers the sign-out wipe in this layer.

For iterating on the server-backed state flow **offline** (DynamoDB Local + `/me*` handlers + fake sign-in), read `docs/Local-Development.md`.

This document covers:
- The DynamoDB single-table model (`raider-tools-users`) and all row families.
- KMS envelope encryption for linked-account tokens.
- Optimistic concurrency (`revision` numbers) on per-user state rows.
- The client-side `UserStateStore` abstraction every piece of user-authored data must go through.
- Sign-in hydration (first-time migration + server-wins) and sign-out wipe.
- Recipes for adding a new per-user state domain or a new linked-account token.
- Restrictions and caveats for anything touching user data.

For the current direct Embark API integration, including source selection, raw snapshot storage, throttling, caching, and the Quartermaster inventory rollout, read `docs/specifications/Embark-API.md` before designing new Embark-backed endpoints. For deferred work and additional planned Embark resources, read `docs/specifications/Embark-API-Future.md`.

---
## 1. High-level architecture
```
Browser SPA                                            API Gateway HTTP API
  │                                                        (api.raider-tools.app)
  │                                                                 │
  │  UserStateStore<T>                              JWT authorizer  │
  │   ├─ LocalBackend   (localStorage rt_state_<domain>)            │
  │   └─ RemoteBackend  (fetch + Bearer id_token)                   │
  │                                                                 ▼
  │                                                   ┌─────────────────────────────┐
  │   GET /me                ──────────────────────►  │ ProfileFn    (profile.ts)   │
  │   PATCH /me              ──────────────────────►  │  • PROFILE row              │
  │                                                   │  • dataMigrationCompleted   │
  │   GET|PUT|DELETE /me/links/{provider} ─────────►  │ LinksFn      (links.ts)     │
  │                                                   │  • envelope enc/dec         │
  │                                                   │  • ArcTracker + Embark      │
  │   POST /me/links/embark/start          ─────────► │ EmbarkLinkFn (embark-link.ts)
  │   POST /me/links/embark/complete       ─────────► │  • PKCE state/verifier      │
  │                                                   │  • token exchange           │
  │                                                   │  • cached profile fetch     │
  │   GET /me/arctracker/{proxy+}        ───────────►  │ ArcTracker user proxy       │
  │                                                   │  • decrypt linked token     │
  │                                                   │  • call relay server-side   │
  │   GET|PUT|DELETE /me/state/{domain}   ─────────►  │ StateFn      (state.ts)     │
  │   POST /me/migrate                    ─────────►  │  • revision concurrency     │
  │                                                   └──────────────┬──────────────┘
  │                                                                  │
  ▼                                                                  ▼
 localStorage                                          DynamoDB raider-tools-users
 • rt_state_<domain>                                   • KMS CMK encrypted at rest
 • Cognito SDK tokens (managed by auth layer)          • PITR on
                                                       • TTL attribute: "ttl"
                                                                 │
                                                                 ▼
                                            KMS CMK alias/raider-tools/user-secrets
                                            • envelope-encrypts LINK#<provider> tokens
                                            • EncryptionContext binds to {userId, purpose, provider}
```
The server-side Lambdas + DynamoDB table are provisioned by `RaiderToolsStack` (eu-central-1) in `infra/lib/raider-tools-stack.ts`. The SPA-side abstractions live under `src/shared/state/`.

---
## 2. Server-side storage model
### 2.1 The single-table `raider-tools-users`
Keys: `pk` (S), `sk` (S). TTL attribute: `ttl` (only populated on `NONCE#*` rows, which are auth-concerns documented in `docs/Authentication.md`). Point-in-time recovery enabled. Encryption at rest uses a customer-managed KMS CMK (alias `alias/raider-tools/user-secrets`).

Row families (all others are reserved — do not invent new `pk` prefixes without updating this doc):

| pk | sk | purpose | owner Lambda |
|----|----|---------|---------------|
| `USER#<sub>` | `PROFILE` | display name, locale, signupProvider, `dataMigrationCompleted` flag | `ProfileFn` |
| `USER#<sub>` | `LINK#arctracker` | envelope-encrypted ArcTracker token | `LinksFn` |
| `USER#<sub>` | `LINK#embark` | envelope-encrypted Embark token payload + derived metadata (`provider`, `supportId`, `expiresAt`, cached profile snapshot) | `EmbarkLinkFn` / `LinksFn` / `ProfileFn` |
| `USER#<sub>` | `EMBARK#INVENTORY#LATEST` | latest normalized Embark inventory snapshot metadata/cache for shared game-data consumers | `EmbarkInventoryFn` |
| `USER#<sub>` | `THROTTLE#embark#inventory` | per-user persisted token bucket for Embark inventory sync | `EmbarkInventoryFn` |
| `GLOBAL#embark` | `THROTTLE#inventory` | optional global persisted token bucket for Embark inventory sync | `EmbarkInventoryFn` |
| `USER#<sub>` | `STATE#quests` | sync'd quest progress | `StateFn` |
| `USER#<sub>` | `STATE#loot` | sync'd loot-helper selections | `StateFn` |
| `USER#<sub>` | `STATE#quartermaster` | sync'd quartermaster lists + hideout toggles | `StateFn` |
| `IDP#<provider>#<external_id>` | `USER` | auth-layer concern (see `docs/Authentication.md`) | `DiscordAuthFn` |
| `NONCE#<hex>` | `NONCE` | auth-layer concern (see `docs/Authentication.md`) | `DiscordAuthFn` + `VerifyAuthFn` |

The `<sub>` in `USER#<sub>` is the Cognito user id (`sub` claim); this is the only identifier we use for ownership — email/username/etc. are mutable, `sub` is not.

### 2.2 Envelope encryption for linked-account tokens
Implemented in `infra/lambda/_lib/envelope.ts`. Used for any external-service token (ArcTracker, Embark, future providers).

Write path:
1. `GenerateDataKey(AES_256)` against the CMK, with `EncryptionContext = { userId, purpose: "link", provider }`.
2. AES-256-GCM encrypt the plaintext token with the returned data key in-process.
3. Persist `{ alg: "AES-256-GCM", ciphertext, iv, tag, encryptedDataKey, createdAt }`.
4. Zero-fill the plaintext data key in memory (`Uint8Array.fill(0)`).

Read path:
1. `Decrypt(encryptedDataKey)` against the CMK **with the same `EncryptionContext`**.
2. AES-GCM decrypt the ciphertext.
3. Zero-fill the plaintext data key.

`EncryptionContext` binds ciphertext to the user — a record moved to a different user's row fails to decrypt. CloudTrail records every `Decrypt` with the full context, giving audit trails for "who accessed whose token".

**Rule**: never store sensitive external tokens (OAuth refresh tokens, API keys, etc.) anywhere unencrypted. Always go through `encryptToken()` / `decryptToken()`.

### 2.3 Migration flag on `PROFILE`
The `PROFILE` row carries `dataMigrationCompleted: boolean`. `POST /me/migrate` flips it atomically using a `TransactWriteCommand` with
```
ConditionExpression: attribute_not_exists(dataMigrationCompleted) OR dataMigrationCompleted = :false
```
so **exactly one device** can ever trigger the first-time local→server migration for a given user. All other devices fall through to the server-wins download path (see §4.2).

### 2.4 Optimistic concurrency (`revision`) on `STATE#*` rows
Each `STATE#<domain>` row carries a monotonic integer `revision`. Every `PUT /me/state/<domain>`:
- Must supply `revision` equal to the current server value. The server conditionally writes with `SET #rev = :expected` and increments to `expected + 1` on success.
- For the **very first write** (row doesn't exist), the caller must **omit** `revision`. The server creates the row at `revision = 1` using `attribute_not_exists(pk)`.
- Returns `409 { error: "revision_conflict", current: { schemaVersion, data, revision, updatedAt } }` on mismatch. The full current row is included so the client reconciles without an extra GET.

`POST /me/migrate` initializes every migrated `STATE#*` row at `revision = 1`.

### 2.5 Request/response shapes
```
GET /me
  → 200 {
      sub, email, displayName, locale, signupProvider,
      dataMigrationCompleted, gameDataSource,
      links: {
        arctracker: { linked: true, validatedUsername, validatedAt } | { linked: false },
        embark:     { linked: false }
                  | { linked: true, provider, supportId, expiresAt, linkedAt, profileFetchedAt,
                      expired, countdownMinutes, profile }
      }
    }
PATCH /me  { displayName?, locale? }     → 200 { ok: true, updates }
PATCH /me  { gameDataSource? }            → 200 { ok: true, updates }
GET    /me/links/arctracker               → 200 { linked, validatedUsername?, validatedAt? }
PUT    /me/links/arctracker  { token }    → 200 { linked: true, validatedUsername, validatedAt }
DELETE /me/links/arctracker               → 200 { linked: false }
GET    /me/links/embark                   → 200 { linked: false }
                                          | 200 { linked: true, provider, supportId, expiresAt, linkedAt,
                                                  profileFetchedAt, expired, countdownMinutes,
                                                  profile }
DELETE /me/links/embark                   → 200 { linked: false }
POST   /me/links/embark/start { provider, returnUrl }
                                          → 200 { authUrl, state, provider, supportId }
POST   /me/links/embark/complete { code, state }
                                          → 200 { linked: true, provider, supportId, expiresAt, linkedAt,
                                                  profileFetchedAt, expired, profile }
GET    /me/embark/inventory               → 200 { source, syncedAt, stash, loadout, hideout, blueprints, diagnostics }
                                          | 404 { error: "not_synced" }
POST   /me/embark/inventory/sync          → 200 { source, syncedAt, stash, loadout, hideout, blueprints, diagnostics }
                                          | 401/403/429/5xx { error, ...details }
GET    /me/arctracker/<path>              → ArcTracker response via stored linked token
GET    /me/state/<domain>                 → 200 { schemaVersion, data, revision, updatedAt } | 404
PUT    /me/state/<domain>  { schemaVersion, data, revision? }
                                          → 200 { ok: true, revision }
                                          | 409 { error: "revision_conflict", current }
DELETE /me/state/<domain>                 → 200 { ok: true }
POST   /me/migrate  { quests?, loot?, quartermaster? }
                                          → 200 { migrated: true }
                                          | 409 { migrated: false, reason: "already_migrated" }
```

`gameDataSource` defaults to `arctracker` until the user explicitly selects
Embark or completes the Embark linking flow, which stores `embark` on the
profile. Existing Embark link rows do not auto-promote the user into Embark
mode by themselves.

### 2.6 CORS, JWT, and size caps
- All routes live behind the shared `HttpJwtAuthorizer` bound to the User Pool + User Pool Client. API Gateway validates JWTs; Lambdas trust `event.requestContext.authorizer.jwt.claims`.
- `ALLOWED_ORIGINS` env var (comma-separated) drives per-Lambda CORS. See `infra/lambda/_lib/http.ts::pickAllowedOrigin`.
- `PUT /me/state/<domain>` body is capped at **64 KB** (`MAX_DATA_BYTES` in `state.ts`). Bigger payloads must use a different primitive (S3 + presigned URL).
- DynamoDB item limit is 400 KB — the 64 KB cap leaves headroom. Add compression/pagination *before* approaching the limit.

---
## 3. Client-side abstractions
### 3.0 Linked-account status and expiration display
Linked-account status shown in global UI should come from the shared client
linked-account state (`src/shared/context/LinkedAccountsContext.ts` and
`src/shared/context/LinkedAccountsProvider.tsx`) instead of each component
fetching or caching its own copy. This keeps header badges, profile pages, and
unlink/re-authenticate actions in sync.

Any UI that displays token or session expiration must use the shared expiration
helpers in `src/shared/utils/expiration.ts`. The standard display is:
- expired credentials: `Expired`
- less than one hour remaining: minute precision, e.g. `42m left`
- one hour or more remaining: compact hour buckets, e.g. `>1h left`, `>5h left`
- missing or unparsable expiration: omit the timeout or show the local
  "unknown" label when a value is required

The standard warning threshold is one hour or less remaining. Header and menu
status colors should use green for valid/connected, yellow for warning or known
invalid credentials, red for disconnected/expired credentials, and gray for
services that are simply not configured.

### 3.1 `UserStateStore<T>` (`src/shared/state/userStateStore.ts`)
The generic, backend-swappable store every piece of per-user client state goes through. One instance per domain.

Key properties:
- In-memory snapshot (`.get()`), reactive subscribers (`.subscribe()`), synchronous reads.
- Debounced persistence via `.set()` (default 1.5 s; configurable per store).
- Explicit `flush()` drains the debouncer; it is called automatically on tab lifecycle events (`pagehide` + `visibilitychange → hidden`).
- `setBackend('local' | 'remote')` swaps the persistence target at runtime; pending writes on the old backend are flushed first.
- `setAuthoritative(value, schemaVersion)` writes through immediately, bypassing debounce — used by sign-in hydration when the server is the source of truth.
- Tracks `currentRevision` and exposes it via `.revision`. On a 409 (`ConflictError`), it adopts the server envelope (`ConflictError.current`), updates `.conflict`, notifies subscribers, and drops the pending write. D5 rule: server wins.
- `clearAll()` wipes the active backend + resets the in-memory value to the default.
- `clearLocal()` wipes `localStorage` regardless of the current backend (used at sign-out).

Two concrete `Backend<T>` implementations live in the same file:
- `LocalBackend<T>` — single JSON entry in `localStorage` under `rt_state_<domain>`.
- `RemoteBackend<T>` — `GET|PUT|DELETE /me/state/<domain>` via `fetch`, attaches `Authorization: Bearer <idToken>`, translates HTTP 409 into `ConflictError` with the parsed `current` envelope.

### 3.2 Concrete stores + registry (`src/shared/state/stores.ts`)
Module-level singletons:
- `questsStore` — `{ completedQuestIds: string[] }`.
- `lootStore` — goal items, disabled items, stash items, filter prefs.
- `quartermasterStore` — stored lists + hideout toggle state.

All three are exported via `allStores` (tuple) for orchestration. A `useStore(store)` React hook wraps them with `useSyncExternalStore` for ergonomic use.

`installGlobalFlushHooks()` (called once from `CognitoAuthProvider`) wires `pagehide` and `visibilitychange → hidden` so every store flushes before the tab disappears.

### 3.3 Storage facades in each app
Each app preserves its pre-phase-2 storage API (e.g. `loadGoalItems()`, `saveStoredLists(...)`) so components do not need to change. Under the hood those functions now call `store.get()` / `store.set(next)`.

Files to touch when changing domain schemas:
- `src/apps/quests/components/QuestTracker.tsx` (completed-quests read/write).
- `src/apps/loot-helper/utils/storage.ts`.
- `src/apps/quartermaster/utils/storage.ts`.
- `src/apps/quartermaster/utils/hideoutStorage.ts`.

If you change the shape of a store's `data`, bump its `schemaVersion` in `stores.ts` and add a `migrate()` function that forward-migrates older payloads.

### 3.4 Typed API client (`src/shared/services/userApi.ts`)
All `/me` + `/me/links/*` calls go through this module. It attaches the Cognito ID token automatically (via `getIdToken()` from the auth layer) and coerces server error bodies into `Error.message`. ArcTracker data sync calls use `src/shared/services/arctrackerApi.ts`, which calls `/me/arctracker/*` when a Cognito/dev session is active so linked tokens stay server-side. Use these typed clients instead of writing ad-hoc `fetch` calls.

ArcTracker profile data is not available in anonymous mode. Users must be signed in to Raider Tools before linking an ArcTracker token or syncing ArcTracker-backed inventory/loadout/hideout data. The SPA must never store or reuse an ArcTracker `arc_u1_*` token in `localStorage`; token validation during linking is the only browser flow that handles the submitted token directly, and persistence happens server-side via `LinksFn`.

### 3.5 `SignInNudge` (`src/shared/components/SignInNudge.tsx`)
Dismissible banner rendered inside the three stateful apps for anonymous users. Hidden when `cognito.user` is present or when `cognito.available` is false. Dismissal persisted in `localStorage['rt_signin_nudge_dismissed']`. Add it to any new app that stores user progress behind the `UserStateStore` so users understand the anonymous/signed-in distinction (see §4.3 for the copy the user sees).

---
## 4. Hydration + sign-out orchestration
Implemented in `src/shared/state/hydration.ts` and driven from `CognitoAuthContext`.

### 4.1 Boot (always)
`hydrateAllLocal()` reads every domain from `localStorage` synchronously so the UI renders with the correct data even before any Cognito session check runs.

### 4.2 `runPostSignInSync()` (on sign-in)
Runs exactly once per Cognito `sub` per tab:
1. `GET /me` → reads `dataMigrationCompleted`.
2. If `false` **and** the device has any local state for at least one domain:
   - `POST /me/migrate { quests?, loot?, quartermaster? }`.
   - On 200 → swap every store to `remote` and **hydrate** each one so it captures its server-assigned `revision = 1`. Done.
   - On 409 → another device already migrated; fall through to step 3.
3. Swap every store to `remote`, then `hydrate()` each one so the in-memory snapshot + revision match the server. Missing domains reset to their default value.

This implements the decisions we committed to during phase-2 design:
- **Strict scope** — only quests, loot, quartermaster sync. UI prefs (locale, sidebar) stay device-local.
- **One-shot first migration** — detected server-side; never happens twice for the same user.
- **Server wins** on every subsequent sign-in, no merging client-side.
- **Silent** — no confirmation dialogs; the `SignInNudge` banner pre-warns the user.

### 4.3 `runSignOutWipe()` (on sign-out)
Runs *before* Cognito tokens are cleared so any pending writes can still authenticate:
1. Best-effort `flush()` every store.
2. `setBackend('local')` on every store.
3. `clearAll()` on every store → clears the `rt_state_*` localStorage keys and resets to defaults.
4. Iterates `LEGACY_KEYS` (pre-phase-2 key names: `arcraiders-quest-progress-reactflow`, `quartermaster_lists`, `what-to-loot-*`, etc.) and removes them too.
5. Clears the ArcTracker IndexedDB cache (`raiderToolsCache`) and drops the active cache owner so stash/loadout/hideout/blueprint data from one signed-in user cannot be shown to another user.

UI prefs (locale, sidebar open/closed) and the sign-in-nudge dismissal flag intentionally survive sign-out; they are device-level prefs, not user data.

If you add new per-user client caches (IndexedDB, service workers, cookies), **extend `runSignOutWipe()` to clear them** — this is the single choke point.

---
## 5. Recipes
### 5.1 Adding a new per-user state domain (most common case)
Use this when a new app needs to sync user-authored data.

1. **Add the domain name to the allowlist** in `infra/lambda/state.ts`:
   ```ts path=null start=null
   const ALLOWED_DOMAINS = new Set(['quests', 'loot', 'quartermaster', 'my_new_domain']);
   ```
   Also extend the `MigrateBody` interface in the same file.

2. **Define the TypeScript shape + store instance** in `src/shared/state/stores.ts`:
   ```ts path=null start=null
   export interface MyNewDomainState { /* … */ }
   export const myNewDomainStore = new UserStateStore<MyNewDomainState>({
     domain: 'my_new_domain',
     schemaVersion: 1,
     defaultValue: { /* … */ },
     // migrate: (raw, fromVersion) => { /* … */ },   // only if schema ever changes
   });
   ```
   Add it to `allStores`.

3. **Update the `DomainName` union** in `src/shared/state/userStateStore.ts` to include the new domain key.

4. **Update `runPostSignInSync()`** in `src/shared/state/hydration.ts`:
   - Extend `anyLocalDataPresent()` to include the new domain.
   - Extend `tryMigrateLocalToServer()`'s body to include the new domain when present.
   - `swapAllToRemote()` and `pullAllFromServer()` iterate `allStores` automatically — no change needed.

5. **Update `LEGACY_KEYS`** in `hydration.ts` to include any pre-phase-2 localStorage keys that must be wiped on sign-out.

6. **Refactor the app's storage module** — expose the same sync API as before, but read/write via `myNewDomainStore.get()` / `.set()`. Components stay unchanged.

7. **Render `<SignInNudge />`** once inside the app so anonymous users see the sync notice.

8. **Respect the 64 KB cap** — if the domain payload can grow large, design it to be sparse (only store user decisions, not derived data).

9. **Ship + test** — `npm test` exercises the sync flow; add a focused test if the domain has complex edge cases (see §7).

### 5.2 Adding a new linked-account token (external-service token on behalf of the user)
Use this when the SPA (or a background Lambda) needs to call a third-party API on behalf of the user — Embark game API, a future Twitch API call, etc. This is about **storing the token**, not about adding a new way to sign in. The latter is in `docs/Authentication.md` §5.

If the provider also acts as an identity provider (sign-in mechanism), do §5 in `docs/Authentication.md` **first**, then this recipe to persist the refresh token.

Embark is the concrete example in the current codebase, but it intentionally does **not** act as a Raider Tools identity provider. Users sign in with Cognito first, then run a separate linked-account OAuth flow under `/me/links/embark/*`.

1. **Extend the `LinksFn` handler** in `infra/lambda/links.ts`:
   - Add a new `handle<Provider>Get/Put/Delete` branch under the `/me/links/{provider}` route.
   - For writes, validate the incoming token against the external service if possible (see `handleArctrackerPut` calling the ArcTracker relay).
   - Always persist via `encryptToken(plaintext, { userId: sub, purpose: 'link', provider: '<name>' })`. Never write the plaintext token anywhere.
   - If the provider needs a browser-based OAuth dance rather than a user-pasted token, create a companion JWT-protected Lambda (Embark uses `infra/lambda/embark-link.ts`) for `start` / `complete` while still exposing status and unlink via `LinksFn`.
2. **Surface the linked status** on `GET /me` — update `profile.ts` so `links.<provider>` appears in the response.
3. **Add a typed client** in `src/shared/services/userApi.ts` (`getXLink`, `putXLink`, `deleteXLink`).
4. **UI** — add controls in the Profile area under a new section; follow the ArcTracker / Embark section layout in `src/pages/profile/`.
5. **KMS grants** — `linksFn` already has `grantEncryptDecrypt` on the CMK. If a *new* Lambda (e.g. a background sync job) needs to read these tokens, explicitly grant it in `infra/lib/raider-tools-stack.ts` and use the same `EncryptionContext`.
6. **Background refresh** (optional) — if the token needs periodic refresh (OAuth refresh tokens), create an EventBridge-scheduled Lambda that reads the encrypted row, performs the refresh against the provider, and writes the new ciphertext back. Reuse `encryptToken` / `decryptToken` — never decrypt outside a Lambda that needs the plaintext.

Embark-specific notes:
- The stored ciphertext is the **raw token JSON response** from Embark, not just the access token string.
- The `LINK#embark` row also stores unencrypted derived metadata needed for UI, support, and scheduling: `provider`, `supportId`, `expiresAt`, `linkedAt`, `profileFetchedAt`, and `cachedProfile`.
- Embark request headers (`User-Agent`, `x-embark-manifest-id`) are operational config stored outside DynamoDB in SSM Parameter Store; they are not per-user state.
- Direct Embark API data access is a server-side, cache-first integration documented in `docs/specifications/Embark-API.md`. Do not add browser-side Embark calls or app-specific Embark fetches outside that architecture.
- Embark refresh handling is intentionally **not implemented**. The Embark auth server is currently broken for refresh-token use, even though the flow asks for `offline`. Treat stored Embark tokens as expiring credentials and require re-authentication when they expire. Revisit this after June 2026, once the upstream auth behavior can be checked again.
- The production Embark redirect URI is the extension loopback URL (`http://127.0.0.1:49174`). Local development keeps `http://127.0.0.1:49176`. If the extension is not installed or not detected, users may still continue and manually rewrite the callback URL domain/host using operator-provided instructions. Do not disable the flow solely because extension detection fails.

### 5.3 Adding fields to an existing state domain
- Add the field to the domain's `State` interface in `stores.ts`.
- If the field is optional at rest, you can leave `schemaVersion` alone and make the field optional in the type.
- If the field is required and old records lack it, bump `schemaVersion` and provide a `migrate()` that fills in a default.
- Update the app's storage facade to expose the field.
- Respect the 64 KB cap — don't add serialized caches.

---
## 6. Restrictions and caveats (non-negotiable)
- **Never read/write `localStorage` directly from an app for user-authored state.** Go through a `UserStateStore`. UI prefs that deliberately do not sync (locale, sidebar state) are fine.
- **Never store linked-account tokens in plaintext** in DynamoDB, `localStorage`, `IndexedDB`, or cookies. Always use `encryptToken`/`decryptToken` with a correct `EncryptionContext`.
- **Never support anonymous ArcTracker profile usage.** ArcTracker-backed data sync must go through `/me/arctracker/*` with a signed-in Raider Tools user and a server-side linked token.
- **Never add a new `pk` prefix to the user table** without updating §2.1 and the relevant IAM grants. The KMS `EncryptionContext` is keyed on `{userId, purpose, provider}` — changing its shape after the fact invalidates prior ciphertexts.
- **IAM grants for new Lambdas that read linked-account tokens** must be added in `infra/lib/raider-tools-stack.ts` (`grantEncryptDecrypt` on `kmsKey`, `grantReadWriteData` on `userTable`). The two-stack split no longer exists, so all grants live in one place.
- **Never skip the `revision` field** when writing to an existing `STATE` row. Omitting `revision` is reserved for the very first write on a brand-new row and will 409 otherwise.
- **Never merge client-side.** On 409, the store adopts the server snapshot (server wins); the conflict is surfaced via `store.conflict` for the UI to notice. Do not add per-field merging — that was explicitly rejected during design (D5).
- **Keep `STATE` payloads small.** 64 KB hard cap server-side. For anything larger use S3 + presigned URLs, not DynamoDB.
- **Anonymous mode must keep working.** Every `UserStateStore` starts on `LocalBackend` at boot; nothing that exists in the signed-out state should silently break when Cognito is unavailable.
- **Validate external tokens before persisting.** `handleArctrackerPut` calls the relay's `/v2/user/profile` with the submitted token and only encrypts + stores on success. Mirror this for any new provider — never store a token you couldn't verify.
- **EncryptionContext must include `userId`.** Dropping the user from the context would let a misbehaving caller decrypt someone else's token. Keep the `{ userId, purpose, provider }` triple intact.
- **DynamoDB removal policy is RETAIN.** The table, the KMS key, and the Cognito user pool all keep customer data on stack deletion. Do not change this without an explicit migration plan.
- **Extend `runSignOutWipe()` when adding new per-user caches.** Every per-user client state must be wiped on sign-out. Don't leave orphaned data behind.
- **Revision conflicts warn, not error.** Don't swallow the `console.warn` without also surfacing something to the user (at minimum a subscriber reaction), or you'll mask real data-loss behavior.

---
## 7. Testing
Test runner: `vitest` with `jsdom`. Run locally: `npm test`.

Relevant test files:
- `src/shared/state/__tests__/userStateStore.test.ts` — store mechanics (12 tests).
- `src/shared/state/__tests__/hydration.test.ts` — first-sign-in migration, server-wins hydrate, sign-out wipe (5 tests).
- `src/shared/state/__tests__/conflict.test.ts` — optimistic concurrency, two-tab race (5 tests).

When you add a new domain, add at least:
1. A boot-from-localStorage hydrate test.
2. A migrate-then-downloads test via the hydration fetch mock.
3. A revision-conflict test (mirror `conflict.test.ts`).

The `installServerMock` helper in `hydration.test.ts` is the authoritative reference for the server's optimistic-concurrency semantics — keep it in sync if `state.ts` changes.

---
## 8. Deployment
Any change to Lambdas, the DynamoDB table, the KMS CMK, or anything under API Gateway goes through CDK:
```bash
cd infra
AWS_PROFILE=baschny npx cdk diff
AWS_PROFILE=baschny npx cdk deploy --all --require-approval never
```
All runtime resources live in a single eu-central-1 stack (`RaiderToolsStack`). The only cross-region dependency is the ACM cert for the Cognito custom domain, which has to live in us-east-1 and is therefore kept in its own stack (`RaiderToolsAuthCertStack`). Always use `cdk deploy --all` — deploying a single stack is fine for iteration but can silently miss cross-region changes.

SPA changes ship via Amplify on push to `main`. SPA env vars that gate the remote backend:
- `VITE_COGNITO_USER_POOL_ID` — auth concern, but required for the SPA to ever switch to `remote` backend.
- `VITE_COGNITO_CLIENT_ID` — same.
- `VITE_API_BASE_URL=https://api.raider-tools.app` — base URL for all `/me*` calls.

Without these the SPA runs in anonymous mode permanently and only the `LocalBackend` is ever used.

---
## 9. File map (user-data cheat sheet)
Server / infra:
- `infra/lib/raider-tools-stack.ts` — unified eu-central-1 stack: HTTP API + custom domain, Cognito user pool, DynamoDB table, KMS CMK, schedule + relay + Discord + `/me*` Lambdas, and every API Gateway route.
- `infra/lib/raider-tools-auth-cert-stack.ts` — us-east-1 ACM cert for `auth.raider-tools.app` (Cognito custom domain requirement).
- `infra/lambda/profile.ts` — `/me` handler (profile + migration flag).
- `infra/lambda/links.ts` — `/me/links/{provider}` handler (linked-account tokens).
- `infra/lambda/embark-link.ts` — JWT-protected Embark OAuth start/complete flow.
- `infra/lambda/state.ts` — `/me/state/{domain}` + `/me/migrate` (per-user app state + optimistic concurrency).
- `infra/lambda/_lib/envelope.ts` — KMS envelope encrypt/decrypt helpers.
- `infra/lambda/_lib/embark.ts` — Embark OAuth exchange, `/v1/shared/profile`, and SSM-backed request-config helpers.
- `infra/lambda/_lib/http.ts` — shared JSON/CORS helpers used by all three handlers.

Client:
- `src/shared/state/userStateStore.ts` — generic per-user store + `ConflictError`.
- `src/shared/state/stores.ts` — concrete domain stores + registry + flush hooks + `useStore` hook.
- `src/shared/state/hydration.ts` — `runPostSignInSync()`, `runSignOutWipe()`, `LEGACY_KEYS`.
- `src/shared/services/userApi.ts` — typed client for `/me` and `/me/links/*`.
- `src/shared/hooks/useEmbarkLinkStatus.ts` — Embark link-status loader with optional polling.
- `src/shared/auth/tokenLink.ts` — local/remote backends for the ArcTracker integration.
- `src/shared/context/AuthContext.tsx` — ArcTracker *link* context, backed by `tokenLink.ts`.
- `src/shared/components/SignInNudge.tsx` — anonymous-mode banner.
- `src/pages/profile/ArcTrackerSection.tsx`, `src/pages/profile/EmbarkSection.tsx` — linked-account controls.

For anything about how the user authenticates, including `CognitoAuthContext`, the Discord bridge, custom-auth triggers, or the `IDP#*` / `NONCE#*` rows, go to `docs/Authentication.md`. When in doubt: check the tests in `src/shared/state/__tests__/` — they are the canonical examples of expected behavior.
