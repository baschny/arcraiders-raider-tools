/**
 * Global sync-status aggregator.
 *
 * The three `UserStateStore`s already track their own `error` alongside
 * the in-memory snapshot. This module listens to all of them and also
 * accepts imperative `reportSyncError()` calls from places that don't
 * belong to a specific store (most importantly the post-sign-in sync in
 * `CognitoAuthContext`).
 *
 * The aggregated state feeds `SyncErrorBanner` so the user/dev sees a
 * single banner whenever any part of the backend isn't doing its job.
 *
 * Implemented as a module-level singleton with a subscribe/snapshot API
 * (consumable via `useSyncExternalStore`). This avoids an extra React
 * context layer and lets non-React code (`hydration.ts`,
 * `CognitoAuthContext`) report errors as easily as the UI consumes them.
 */

import { useSyncExternalStore } from 'react';
import { allStores } from './stores';
import type { SyncError, SyncErrorKind } from './userStateStore';

/** Non-store source for sync errors. */
export type NonStoreSource = 'post-sign-in';

/** All the places that can contribute an error to the aggregator. */
export type SyncErrorSource = `store:${string}` | NonStoreSource;

export interface SyncErrorEntry extends SyncError {
    source: SyncErrorSource;
}

export interface SyncStatusSnapshot {
    /** All currently-active errors (store errors + imperative ones). */
    errors: SyncErrorEntry[];
    /** Convenience flag: `errors.length > 0`. */
    hasError: boolean;
}

type RetryHandler = () => Promise<void> | void;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Imperative (non-store) errors. Keyed by source so repeated reports
 * from the same source replace the previous entry rather than piling up.
 */
const imperativeErrors = new Map<NonStoreSource, SyncError>();

const listeners = new Set<() => void>();
let retryHandler: RetryHandler | null = null;

// Cached snapshot so `useSyncExternalStore` sees referential equality
// across React renders when nothing has changed.
let cachedSnapshot: SyncStatusSnapshot = { errors: [], hasError: false };

// Guards the one-shot dev hint so we don't spam the console on every
// retry attempt while the API server stays down.
let devHintFired = false;

function computeSnapshot(): SyncStatusSnapshot {
    const errors: SyncErrorEntry[] = [];
    for (const store of allStores) {
        const err = store.error;
        if (err) {
            errors.push({ ...err, source: `store:${store.domain}` });
        }
    }
    for (const [source, err] of imperativeErrors) {
        errors.push({ ...err, source });
    }
    return { errors, hasError: errors.length > 0 };
}

function recompute(): void {
    const next = computeSnapshot();
    // Cheap structural check: if neither list changed shape/order, skip
    // the notify (useSyncExternalStore is happy either way but this
    // avoids pointless re-renders).
    if (
        next.hasError === cachedSnapshot.hasError &&
        next.errors.length === cachedSnapshot.errors.length &&
        next.errors.every((e, i) => {
            const prev = cachedSnapshot.errors[i];
            return prev &&
                prev.source === e.source &&
                prev.kind === e.kind &&
                prev.status === e.status &&
                prev.at === e.at;
        })
    ) {
        return;
    }
    cachedSnapshot = next;
    maybeFireDevHint(next);
    for (const l of listeners) l();
}

function maybeFireDevHint(snap: SyncStatusSnapshot): void {
    if (devHintFired) return;
    if (!import.meta.env.DEV) return;
    if (!snap.errors.some(e => e.kind === 'network')) return;
    devHintFired = true;
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
        'https://api.raider-tools.app';
    console.error(
        `[raider-tools sync] Backend is unreachable (VITE_API_BASE_URL=${apiBase}). ` +
        `If you're developing locally, make sure the local API server is running — see docs/Local-Development.md.`,
    );
}

// Subscribe to every store once at module load. Stores call `notify()`
// after any state change (including error changes), so this gives us a
// reactive feed of store errors without each store knowing about us.
for (const store of allStores) {
    store.subscribe(() => recompute());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Record an error from a non-store source (e.g. the post-sign-in flow). */
export function reportSyncError(source: NonStoreSource, error: SyncError): void {
    imperativeErrors.set(source, error);
    recompute();
}

/** Clear the imperative error entry for a given source. */
export function clearSyncError(source: NonStoreSource): void {
    if (imperativeErrors.delete(source)) {
        recompute();
    }
}

/** Register the retry handler used by `retrySync()`. Last one wins. */
export function setRetryHandler(handler: RetryHandler | null): void {
    retryHandler = handler;
}

/**
 * Re-run the post-sign-in sync (if a handler is registered) and flush
 * every dirty store. Errors during retry are re-reported via the usual
 * paths (store catch blocks / `reportSyncError`), so the banner updates
 * automatically.
 */
export async function retrySync(): Promise<void> {
    // Clear the post-sign-in entry optimistically; if the retry fails,
    // the handler will re-populate it.
    clearSyncError('post-sign-in');
    const handler = retryHandler;
    if (handler) {
        try {
            await handler();
        } catch (err) {
            // The handler is expected to report its own error via
            // reportSyncError, but defend against ones that don't.
            console.error('[raider-tools sync] retry handler threw', err);
        }
    }
    // Flush any dirty store so write failures get a second chance.
    for (const store of allStores) {
        try {
            await store.flush();
        } catch {
            /* flush already records errors through the store's own path */
        }
    }
}

/** Synchronous snapshot read (for `useSyncExternalStore`). */
export function getSyncStatusSnapshot(): SyncStatusSnapshot {
    return cachedSnapshot;
}

/** Subscribe to snapshot changes. */
export function subscribeSyncStatus(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Picks the most urgent error kind for UI copy selection. */
export function worstErrorKind(errors: SyncErrorEntry[]): SyncErrorKind | null {
    if (errors.length === 0) return null;
    // Priority order: unauthorized > network > server > client > unknown.
    // Rationale: an expired session is the only kind the user can
    // immediately fix themselves, so we surface it first.
    const priority: SyncErrorKind[] = ['unauthorized', 'network', 'server', 'client', 'unknown'];
    for (const kind of priority) {
        if (errors.some(e => e.kind === kind)) return kind;
    }
    return 'unknown';
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------
export function useSyncStatus(): SyncStatusSnapshot & { retry: () => Promise<void> } {
    const snap = useSyncExternalStore(
        subscribeSyncStatus,
        getSyncStatusSnapshot,
        getSyncStatusSnapshot,
    );
    return { ...snap, retry: retrySync };
}
