# Change-04: ARC Tracker Sync-Now — Transparent Game Sync Before Data Fetch

## Status
Proposed

## Summary
Add a new server-side proxy endpoint `POST /me/arctracker/sync-now` that calls ARC Tracker's private `/api/v2/sync-now` endpoint on behalf of the user, and a client-side shared utility `syncNowService.ts` that transparently calls it before each data sync (subject to per-domain 30s cooldown and subscription gating). All ArcTracker-mode sync buttons across quartermaster, craft-calculator, and quests apps are affected.

## Motivation
Users currently must go to arctracker.io and manually sync from Embark before their Raider Tools data is fresh. Sync-now automates that step: when the user clicks any sync button, Raider Tools triggers an ARC Tracker sync first, then reads the fresh data — no tab switching required.

---

## Requirements

### R1 — Server-side endpoint: `POST /me/arctracker/sync-now`

**File(s)**: `infra/lambda/arctracker-user-proxy.ts`, `infra/lambda/_lib/arctrackerRelay.ts`, `infra/lib/raider-tools-stack.ts`, `infra/local/routes.ts`, `infra/local/server.ts`

**Change type**: addition

**Detail**:

Add POST handling to `arctracker-user-proxy.ts` for the specific path `/me/arctracker/sync-now`. When the method is `POST` and the raw path ends with `/sync-now`:

1. Validate the user has a linked ARC Tracker token (same decrypt flow as GET handler).
2. Parse the request body as `{ "targets": string[] }`.
3. Call `forwardArcTrackerSyncNow(bearerToken, targets)` on `arctrackerRelay.ts`.
4. Return the sync-now result to the client.

Add a new exported function `forwardArcTrackerSyncNow` to `arctrackerRelay.ts`:

```typescript
export async function forwardArcTrackerSyncNow(
    bearerToken: string,
    targets: string[],
): Promise<APIGatewayProxyResultV2>
```

- POST to `https://arctracker.io/api/v2/sync-now`
- Headers: `X-App-Key` (via `getAppKey()`), `Authorization: Bearer {bearerToken}`, `X-Sync-Secret: raidertools123`, `Content-Type: application/json`
- Body: `{ targets }` (omit targets key entirely if array is empty)
- Return: passthrough of ARC Tracker's response (status, body, content-type)
- `X-Sync-Secret` is hardcoded as a constant in the file
- No pass-through of `If-None-Match` / `If-Modified-Since` (sync-now is a POST, not conditional)

Update `infra/lib/raider-tools-stack.ts` — add `POST` to the methods array for the `/me/arctracker/{proxy+}` route:

```typescript
this.httpApi.addRoutes({
    path: "/me/arctracker/{proxy+}",
    methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
    integration: arctrackerUserProxyIntegration,
    authorizer: jwtAuthorizer,
});
```

Update `infra/local/routes.ts` — allow POST method for `/me/arctracker/{proxy+}` route:

```typescript
if (pathname.startsWith("/me/arctracker/") && (method === "GET" || method === "POST")) {
    return { key: "arctrackerUserProxy", pathParameters: {}, requiresDevAuth: true };
}
```

No changes needed to `infra/local/server.ts` explicitly — it already routes to `arctrackerUserProxy.handler` for the `arctrackerUserProxy` key.

---

### R2 — Client-side type for sync-now response

**File(s)**: `src/shared/services/arctrackerApi.ts` (or new file `src/shared/types/syncNow.ts`)

**Change type**: addition

**Detail**:

Add types for the sync-now response:

```typescript
interface SyncNowResponse {
    data: {
        ok: boolean;
        synced: Record<string, boolean>;
        errors: string[];
    };
    meta: {
        requestId: string;
        syncedAt: string;
    };
}
```

---

### R3 — Client-side shared utility: `syncNowService.ts`

**File(s)**: `src/shared/services/syncNowService.ts`

**Change type**: new file

**Detail**:

A new module exporting:

```typescript
export async function withSyncNow<T>(
    domain: SyncNowDomain,
    fetchFn: () => Promise<T>,
): Promise<T>
```

Supporting types:

```typescript
type SyncNowDomain = 'stash' | 'loadout' | 'blueprints' | 'hideout' | 'projects' | 'quests' | 'rounds' | 'stats';
```

Internal state:
- In-memory `Map<SyncNowDomain, number>` tracking last sync-now attempt (epoch ms) per domain.
- Per-domain cooldown: 30_000 ms.

Domain-to-target mapping in the service:

```typescript
const DOMAIN_TO_TARGET: Record<string, string | null> = {
    stash: 'inventory',
    loadout: null,         // unmapped — no sync-now for loadout
    blueprints: 'blueprints',
    hideout: 'hideout',
    projects: 'projects',
    quests: 'quests',
    rounds: 'rounds',
    stats: 'stats',
};
```

Logic:
1. Look up `target = DOMAIN_TO_TARGET[domain]`. If `null`, skip sync-now entirely.
2. Check cooldown: if `lastSyncTime.get(domain) + 30000 > Date.now()`, skip sync-now.
3. Check `isSubscribed` from cached profile (IndexedDB `cacheService.getCachedProfile()`). If profile is missing or `isSubscribed` is falsy, skip sync-now.
4. If all checks pass, call `POST /me/arctracker/sync-now` via the API base with the user's ID token. Send `{ targets: [target] }`. Set `lastSyncTime.set(domain, Date.now())`.
5. If sync-now call fails for any reason, log a warning — do NOT throw. The fetch function runs regardless.
6. Call and return `fetchFn()`.

The service should import:
- `getIdToken()` from `../auth/cognitoClient`
- `getCachedProfile()` from `./cacheService`
- API base URL from the same pattern as `arctrackerApi.ts`

---

### R4 — Integrate `withSyncNow` into quartermaster sync handlers

**File(s)**: `src/apps/quartermaster/index.tsx`

**Change type**: modification

**Detail**:

Wrap the data-fetch calls inside existing sync handlers with `withSyncNow`:

- `handleSyncMyItems`: wrap `syncStashAllPages()` with `withSyncNow('stash', ...)`. Do NOT wrap `syncLoadout()` (loadout is unmapped per R3).
- `handleSyncHideout`: wrap `syncHideout()` with `withSyncNow('hideout', ...)`.
- `handleSyncBlueprints`: wrap `syncBlueprints()` with `withSyncNow('blueprints', ...)`.
- `handleSyncProjects` (ArcTracker branch): wrap `syncProjects()` with `withSyncNow('projects', ...)`.
- `handleSyncQuests` (ArcTracker branch): wrap `syncArctrackerQuestSnapshot()` with `withSyncNow('quests', ...)`.

Handler pattern:

```typescript
// Before
const stash = await syncStashAllPages();
// After
const stash = await withSyncNow('stash', () => syncStashAllPages());
```

Import `withSyncNow` from `../../shared/services/syncNowService`.

---

### R5 — Integrate `withSyncNow` into craft-calculator sync handler

**File(s)**: `src/apps/craft-calculator/index.tsx` (or wherever the sync handler lives)

**Change type**: modification

**Detail**:

Find the ArcTracker sync handler (likely `handleSync` or similar). Wrap the stash/items fetch calls with `withSyncNow('stash', ...)`. Loadout fetch remains unwrapped.

---

### R6 — Integrate `withSyncNow` into quests app sync handler

**File(s)**: `src/apps/quests/components/QuestTracker.tsx`

**Change type**: modification

**Detail**:

Find the ArcTracker quest sync path. Wrap the quest snapshot fetch with `withSyncNow('quests', ...)`.

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/shared/services/syncNowService.ts` | Shared utility wrapping sync-now call with cooldown, subscription gating, and silent fallthrough |

### Modified Files

| File | Change |
|------|--------|
| `infra/lambda/_lib/arctrackerRelay.ts` | Add `forwardArcTrackerSyncNow()` function |
| `infra/lambda/arctracker-user-proxy.ts` | Add POST handler for `/sync-now` path |
| `infra/lib/raider-tools-stack.ts` | Add `POST` to `/me/arctracker/{proxy+}` route methods |
| `infra/local/routes.ts` | Allow `POST` for `/me/arctracker/*` route matching |
| `src/apps/quartermaster/index.tsx` | Wrap data fetches with `withSyncNow` in 5 sync handlers |
| `src/apps/craft-calculator/index.tsx` | Wrap stash fetch with `withSyncNow` |
| `src/apps/quests/components/QuestTracker.tsx` | Wrap quest fetch with `withSyncNow` |

### Deleted Files

None.

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|------------------|
| No `isSubscribed` flag in cached profile | Sync-now skipped; data fetch proceeds normally |
| Cached profile not yet fetched | `getCachedProfile()` returns undefined; sync-now skipped |
| Loadout sync button clicked | `withSyncNow('loadout', fn)` — DOMAIN_TO_TARGET returns null; sync-now skipped, loadout fetch runs normally |
| 30s cooldown active for domain | Sync-now skipped; data fetch proceeds normally |
| sync-now returns `ok: false` with `["Token expired"]` | Logged as warning; data fetch proceeds (ARC Tracker's data is stale but readable) |
| sync-now returns HTTP 429 (rate limited) | Logged as warning; data fetch proceeds |
| sync-now returns HTTP 403 (subscription_required) | Should not occur because of `isSubscribed` gating, but if it does: logged as warning; data fetch proceeds |
| sync-now network error (timeout, DNS failure) | Logged as warning; data fetch proceeds |
| User clicks "Sync My Items" twice rapidly | First call begins sync-now and sets cooldown. Second call sees active cooldown for `stash` domain, skips sync-now, still runs data fetch |
| User clicks "Sync My Items" then immediately "Sync Blueprints" | Independent cooldowns: stash's cooldown doesn't affect blueprints' cooldown; both sync-now calls fire if their respective cooldowns are cold |
| Page refreshed mid-sync | Cooldown map resets; next sync button click starts fresh |
| Embark data source mode | Sync handlers that delegate to `handleSyncEmbarkInventory` are unaffected; only ArcTracker paths get wrapped |

---

## Rollout Strategy

1. **Phase 1**: Implement `arctrackerRelay.ts` — add `forwardArcTrackerSyncNow()`. Implement `arctracker-user-proxy.ts` — add POST handler. Update CDK stack and local routes to allow POST.

2. **Phase 2**: Implement `syncNowService.ts` — the shared utility with domain mapping, cooldown, subscription gating, and the `withSyncNow` wrapper.

3. **Phase 3**: Integrate into quartermaster sync handlers.

4. **Phase 4**: Integrate into craft-calculator and quests sync handlers.

5. **Phase 5**: Verify build succeeds and test flows.
