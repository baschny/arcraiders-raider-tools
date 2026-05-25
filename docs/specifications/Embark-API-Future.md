# Embark API Future Work

This document collects Embark integration work that is not implemented yet, only partially implemented, or intentionally deferred. It is the follow-up backlog for the current implementation described in `docs/specifications/Embark-API.md`.

## Incomplete Or Deferred Behavior

### Source-selection behavior cleanup

The original concept expected older users with an existing Embark link to remain on ArcTracker until they explicitly switched sources. The current implementation in `infra/lambda/embark-link.ts` sets:

```text
PROFILE.gameDataSource = "embark"
```

immediately after a successful link completion.

If that behavior should change, the link flow and user-profile behavior need to be updated together.

### Richer sync error taxonomy

The concept work proposed additional stable error handling that is not fully implemented yet, including:

- `mapping_incomplete`
- richer `manifest_mismatch` detection semantics
- returning current cached snapshot metadata alongside `429` throttling errors
- broader distinction between upstream temporary failures and decoder-specific failures

Current endpoints mostly return the implemented error set from `infra/lambda/embark-inventory.ts`.

### In-flight sync locking

The concept proposed one in-flight sync per user/resource. The current implementation has persisted token buckets, but it does not implement a separate sync lock row or in-flight deduplication mechanism for inventory sync requests.

### Raw snapshot metadata index

The concept described richer raw-snapshot metadata such as explicit decode status and response-hash indexing. The current implementation stores raw and normalized artifacts in S3 plus latest-row references in DynamoDB, but it does not maintain a dedicated snapshot index or reporting table.

### Token refresh

Embark refresh-token handling is intentionally not implemented. The code treats Embark tokens as expiring credentials and requires re-authentication after expiry.

Revisit after upstream Embark refresh behavior is known to work reliably.

## Additional Embark Resources

Only the Quartermaster phase-1 inventory source is implemented today.

The following resource integrations are still future work:

- `GET /v1/pioneer/quests`
  - quest state and substeps
- `GET /v1/pioneer/mastery/objectives`
  - mastery and trial objective status
- `POST /v1/pioneer/stats/player-v2`
  - current season, current window, and lifetime stats
- rounds history endpoints

Each additional resource should get its own:

- backend route shape
- sync trigger
- throttle bucket
- normalization layer
- cache metadata
- consuming app integration

They should not be folded into the Quartermaster inventory sync path.

## Admin And Operational Tooling

The implementation currently relies on logs, AWS resources, and operator knowledge. There is no dedicated admin UI or reporting workflow yet.

Still-needed operator tooling includes:

- list which users have `embark-auth`
- inspect current Embark manifest ID and User-Agent configuration
- inspect recent Embark sync counts by resource
- inspect user/global throttle state
- inspect recent upstream failure rates
- inspect recent decode failures and mapping gaps
- inspect raw snapshot volume and lifecycle health

This can start as CLI/reporting automation before any admin UI exists.

## Decoder And Mapping Follow-Up

The decoder already tolerates unknown `gameAssetId` values and returns diagnostics, but the follow-up work is still open:

- expand mapping coverage so fewer inventory nodes land in diagnostics
- define when mapping gaps should graduate from diagnostics-only to explicit API error semantics
- improve provenance/debug fields for mis-decoded inventory state
- review whether additional normalized fields are needed by future Quartermaster features

## Manifest And Upstream Change Management

The concept work called out manifest drift as an operational concern. Follow-up work still needed:

- make manifest-mismatch detection more explicit and less dependent on generic upstream failures
- document and automate operator rotation steps when the manifest changes
- add verification tooling for request-config health

## Network Egress

Phase 1 intentionally uses normal Lambda outbound networking. No VPC/NAT/EIP setup exists for Embark traffic today.

This remains future work if Embark access starts requiring fixed outbound egress identity or if upstream blocking makes that operationally necessary.

## Potential Documentation Follow-Up

When the next Embark phase is implemented, update these documents together:

- `docs/specifications/Embark-API.md`
- `docs/specifications/Embark-API-Future.md`
- `docs/User-Data.md`
- any app-specific specification that starts consuming the new resource
