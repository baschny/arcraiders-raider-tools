# Change 34 - ArcTracker Missing Sync Handling

## Status
Implemented

## Problem

ArcTracker may return successful HTTP responses for linked accounts whose inventory
data is not currently synced in ArcTracker:

- stash responses with empty items and `syncedAt: null`
- loadout responses with `loadout: null` and `syncedAt: null`

Quartermaster previously treated these as usable snapshots. The loadout path could
then crash while reading slot properties from `null`.

## Required Behavior

When ArcTracker returns `syncedAt: null` for stash or loadout sync, Quartermaster
must treat the response as missing upstream ArcTracker data, not as an empty
valid inventory.

Rules:

- Do not cache the missing-data response.
- Do not clear any previously cached stash or loadout data.
- Show an actionable error telling the user to sync successfully in ArcTracker first.
- Link the action to `https://arctracker.io/apps/arctracker-sync`.
- Loadout and owned-inventory aggregation must tolerate legacy cached records with
  a null loadout and return no loadout-owned rows instead of throwing.

## Acceptance Criteria

1. Stash sync with `syncedAt: null` fails with the ArcTracker sync-required message.
2. Loadout sync with `loadout: null` or `syncedAt: null` fails with the same message.
3. Failed missing-data sync does not write the missing response to cache.
4. The Quartermaster sync error banner links to the ArcTracker Sync page.
5. A legacy null cached loadout does not crash owned inventory aggregation.
