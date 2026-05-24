# Embark API Integration Concept
This document captures the agreed architecture for integrating direct Embark API data into Raider Tools. It is a planning and implementation guide for future work; it does not describe a fully implemented production feature yet.

For token storage, linked accounts, server-side user data, and sign-out behavior, also read `docs/User-Data.md`. For Raider Tools sign-in and Cognito behavior, read `docs/Authentication.md`.

## Goals
The Embark API should provide a richer alternative to ArcTracker-backed data. ArcTracker returns a limited facade of game data, while Embark exposes more detailed raw game state such as inventory hierarchy, unlocks, quest substeps, mastery objectives, and player statistics.

The integration must:
- Keep Embark tokens and Embark API calls server-side.
- Protect Raider Tools and Embark from accidental or abusive request volume.
- Cache raw and normalized data so tools can read snapshots without calling Embark.
- Make token expiry clear to users.
- Allow a controlled live rollout to selected users only.
- Keep application code simple by exposing normalized Raider Tools data shapes.

## Core Decisions
- The browser must never call Embark API endpoints directly.
- Embark is a linked account, not a Raider Tools identity provider.
- Users must sign in to Raider Tools before linking or using Embark data.
- Embark data access is gated by a Cognito group, initially `embark-preview`.
- The user's active game-data source is global: `arctracker` or `embark`.
- ArcTracker and Embark are not mixed at runtime. If Embark is active, apps use Embark-backed snapshots.
- Sync is explicit in phase 1. There is no background refresh or scheduled sync.
- Each resource has its own sync action. There is no combined "sync everything" endpoint.
- Raw Embark responses are stored for 14 days for analysis and debugging.
- Raw Embark snapshots are not part of user-facing data export in the initial concept.
- Unlinking Embark deletes the token only. Historical raw snapshots expire by lifecycle policy.
- Throttle state is persisted server-side, not held only in Lambda memory.
- Phase 1 uses normal Lambda outbound networking. Dedicated NAT egress can be added later if needed.

## Source Model
Raider Tools should maintain a global active game-data source on the user profile:

```ts
type GameDataSource = 'arctracker' | 'embark';
```

Recommended behavior:
- Anonymous users keep the existing local-only behavior where applicable.
- Signed-in users without Embark continue to use ArcTracker where supported.
- Signed-in users with Embark can select Embark as their active source.
- If the active source is Embark and the Embark token expires, the app prompts re-authentication and continues to show stale cached Embark data where available.
- The app does not silently fall back to ArcTracker when Embark expires. Source fallback should be a user decision.

The ArcTracker linking UI can remain visible. Embark support should not require an ArcTracker link.

## Phase 1 Scope: Quartermaster
The first application target is Quartermaster, because it is currently the only app that consumes linked game data from ArcTracker.

Phase 1 should make Quartermaster work from Embark inventory data. Required Quartermaster domains:
- Stash content.
- Loadout content.
- Hideout/chamber tiers.
- Blueprint unlocks.

The initial Embark endpoint for this work is:

```text
GET /v1/pioneer/inventory
```

This endpoint contains much more than "stash inventory". It also includes unlock-like state such as cosmetics, skin status, blueprint unlocks, crafting bench or chamber unlocks, and level unlocks. Many crafting rules depend on whether the user has specific unlocks, so the decoder must treat this endpoint as a broad owned-state graph rather than as a flat item list.

Analysis of `/v1/pioneer/inventory` should happen primarily in the sibling `../embark-api` project before Raider Tools implementation. That project already contains documentation, raw example data, and mapping files such as:
- `../embark-api/docs/Inventory-Structure.md`
- `../embark-api/data/arctracker-items.json`
- `../embark-api/data/arctracker-structures.json`
- `../embark-api/data/arctracker-blueprints.json`
- `../embark-api/data/arctracker-projects.json`

The output of that analysis should be a documented mapping from raw inventory nodes and `gameAssetId`s to the four Quartermaster domains above.

## Future Embark Resources
The broader architecture should support additional resources later:
- `GET /v1/pioneer/quests` for quest state and quest substeps.
- `GET /v1/pioneer/mastery/objectives` for trial and mastery objective status.
- `POST /v1/pioneer/stats/player-v2` for current season, current window, and lifetime player stats.
- Rounds data, if needed later. This endpoint returns the full rounds list, so it is intentionally out of phase 1.

Each resource should be integrated independently with its own sync endpoint, cache metadata, throttle bucket, decoder, and UI entry point.

## Server-Side Access Pattern
All Embark calls should go through Raider Tools authenticated API routes.

The request flow should be:
1. SPA calls a Raider Tools `/me/embark/...` endpoint with the Cognito ID token.
2. API Gateway validates the Raider Tools JWT.
3. Lambda verifies the user belongs to the Embark preview Cognito group.
4. Lambda loads the user's encrypted `LINK#embark` token row.
5. Lambda rejects expired tokens before calling Embark.
6. Lambda checks the persisted throttle bucket for the requested resource.
7. Lambda calls Embark only if the request is allowed.
8. Lambda stores the raw response, updates normalized snapshots, and returns the normalized result or current cache metadata.

The SPA should only receive normalized data and operational metadata. It should not receive the Embark access token.

## Token Lifecycle
Embark access tokens expire every 24 hours. Refresh is not available in the current design, so re-authentication is required at least once per day.

Token expiry should be treated as normal product state:
- Show active, expiring soon, and expired states clearly.
- Display the expiry time where helpful.
- Provide a direct action to reconnect Embark.
- Keep stale cached data visible when safe, but label it with its last synced time.
- Do not show generic "sync failed" messaging for token expiry.

Server responses should distinguish `token_expired` from general Embark errors.

## Caching And Storage
The integration needs two cache layers:

1. Raw Embark snapshots.
2. Normalized Raider Tools snapshots.

### Raw Snapshots
Raw Embark JSON responses should be stored in S3, compressed, with a 14-day lifecycle expiration.

Recommended metadata:
- Cognito user id.
- Resource name, such as `inventory`.
- Embark endpoint.
- Fetch time.
- Token expiry at fetch time.
- Manifest id used.
- Response hash.
- S3 key.
- Decode status.
- Error status if normalization failed.

Raw snapshots can contain personally identifying or sensitive account information. Operator access should be limited to trusted maintainers and used for debugging, decoder work, and mapping research.

Raw snapshots are not included in user-facing export flows for the initial implementation. Unlinking Embark deletes only the token; raw snapshots age out through the 14-day S3 lifecycle policy.

### Normalized Snapshots
Normalized snapshots are the app-facing cache. They should hide Embark API shape complexity from React apps.

Quartermaster should receive data in existing or near-existing ArcTracker-like concepts:
- `CachedStash`
- `CachedLoadout`
- `CachedHideout`
- `CachedBlueprints`

The normalized format should include:
- `source: 'embark'`
- `syncedAt`
- `manifestId`
- `schemaVersion`
- `unknownGameAssetIds` or equivalent diagnostics
- Enough provenance to debug incorrect mappings

Unknown `gameAssetId`s should not block the whole sync. They should appear as unknown items or unknown unlocks where the UI needs to show them.

## Throttling
Embark sync needs token-bucket throttling so normal user bursts are possible but abuse and accidental loops are contained.

Throttle state must be persisted, for example in DynamoDB, because Lambda memory is not reliable across cold starts or concurrent executions.

Use separate buckets for:
- Per user and resource.
- Global Raider Tools Embark traffic.
- Potentially per endpoint weight, because inventory and rounds are heavier than profile-like calls.

Phase 1 should prioritize user-triggered inventory sync. Example starting policy, to be tuned after observing real usage:
- Inventory bucket burst capacity: enough for a short stash-cleanup burst.
- Inventory refill: roughly aligned with expected 15-minute online refresh cadence.
- One in-flight sync per user/resource.
- No background sync consumption.
- Global emergency cap to protect the site if many preview users sync at once.

When a request is throttled, return a machine-readable `429` with:
- `error: 'rate_limited_user'` or `error: 'rate_limited_global'`
- `retryAfterSeconds`
- `nextAllowedAt`
- current cached snapshot metadata, if available

The UI should explain that cached data is still being shown and when the next sync is possible.

## Error Taxonomy
Embark-backed endpoints should return stable error codes so app UI can respond meaningfully.

Recommended codes:
- `not_enabled`: user is not in the Embark preview Cognito group.
- `not_linked`: no Embark token is linked.
- `token_expired`: token is expired and the user must re-authenticate.
- `manifest_mismatch`: configured manifest id no longer works for the API call.
- `rate_limited_user`: user's resource bucket is empty.
- `rate_limited_global`: Raider Tools global Embark budget is exhausted.
- `embark_unavailable`: network timeout, 5xx, or other temporary upstream problem.
- `decode_failed`: raw response was stored but normalization failed.
- `mapping_incomplete`: normalization succeeded with unknown game asset ids.

`decode_failed` should not discard raw data. The raw snapshot is valuable for fixing the decoder.

## Manifest And Request Configuration
Embark API calls require operational request configuration such as:
- `x-embark-manifest-id`
- `User-Agent`

These values are not per-user state. They should remain operational config, backed by SSM Parameter Store as described in `docs/User-Data.md`.

If the manifest id changes, affected sync endpoints should fail with `manifest_mismatch` and preserve the previous cache. The UI should explain that live Embark sync is temporarily unavailable, not that the user did something wrong.

## Network Egress
Phase 1 uses normal Lambda outbound networking. This means outbound IP addresses are AWS-managed and not stable or directly controllable.

This is accepted for the first rollout because traffic is limited by:
- Cognito group gate.
- Server-only Embark access.
- Explicit user sync only.
- Persisted throttling.
- Cache-first app reads.
- CLI/operator monitoring.

If Embark starts blocking traffic, unexplained 403/rate-limit responses appear, or fixed outbound identity becomes operationally necessary, move Embark Lambdas into a VPC with private subnets and NAT Gateway egress using Elastic IPs.

IP rotation is not the abuse mitigation strategy. Rate limits, caching, and feature gating are the mitigation strategy. Changing egress IPs should be an operator action after investigation.

## Admin And Operations
Phase 1 does not need an admin UI. CLI/reporting is enough.

Operator tooling should eventually answer:
- Which users are in the Embark preview group.
- Current manifest id and configured User-Agent.
- Recent Embark sync counts by resource.
- User and global throttle bucket state.
- Recent upstream error rates.
- Recent `decode_failed` and `mapping_incomplete` snapshots.
- S3 raw snapshot counts and lifecycle health.

The implementation should log enough structured metadata to support these reports without logging plaintext tokens.

## Security And Privacy
Non-negotiable rules:
- Never store Embark tokens in plaintext.
- Never expose Embark tokens to the SPA after linking.
- Never call Embark directly from browser code.
- Restrict raw snapshot access to trusted operators.
- Treat raw snapshots as sensitive user data because they may include account identifiers and detailed game state.
- Keep sign-out wipe behavior in mind for any new client-side per-user caches.

## Implementation Phases
### Phase 0: Documentation And Inventory Analysis
- Document this architecture.
- Analyze `/v1/pioneer/inventory` in `../embark-api`.
- Produce a mapping document for Quartermaster stash, loadout, hideout tiers, and blueprint unlocks.

### Phase 1: Quartermaster Inventory Source
- Add server-side source selection on the user profile.
- Add Embark preview group enforcement on Embark data endpoints.
- Add explicit inventory sync endpoint.
- Store raw inventory snapshots in compressed S3 with 14-day retention.
- Persist per-user/resource throttle buckets in DynamoDB.
- Normalize inventory into Quartermaster cache shapes.
- Update Quartermaster to consume the active global source.
- Show unknown game asset ids as unknown items.
- Show clear token-expired and rate-limited states.

Quartermaster functional changes must follow the specification-first workflow in `docs/specifications/quartermaster/` before implementation.

### Phase 2: Additional Resources
- Add quests with substep status.
- Add mastery objectives/trials.
- Add player stats.
- Revisit rounds only when there is a concrete product need.

### Phase 3: Operational Hardening
- Add CLI reports.
- Tune throttle numbers from observed preview usage.
- Add static egress only if operational evidence justifies it.
- Consider background sync only after explicit sync behavior is stable.

## Open Follow-Up Work
- Choose exact throttle bucket numbers for phase 1.
- Define S3 key layout and metadata table shape.
- Define normalized Quartermaster Embark cache schemas.
- Write the `../embark-api` inventory mapping document.
- Decide exact Cognito group name and deployment process for preview users.
