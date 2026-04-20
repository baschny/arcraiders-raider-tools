/**
 * Generic per-user state store.
 *
 * Each domain (quests / loot / quartermaster) has one store instance that
 * keeps the authoritative value in memory, exposes synchronous read/write,
 * and persists writes through a swappable backend:
 *
 *   - `localBackend`  : single-key localStorage entry, synchronous.
 *   - `remoteBackend` : API-backed, debounced PUT /me/state/{domain}.
 *
 * The backend is chosen by the sign-in state (set via `setBackend`) and can
 * switch at runtime (sign-in / sign-out). Consumers do not need to know
 * which backend is active.
 *
 * Writes are debounced per-store (DEFAULT_DEBOUNCE_MS). An immediate flush
 * runs on `visibilitychange`→hidden, `pagehide`, and when callers invoke
 * `flush()` explicitly (e.g. at sign-out).
 */

import { getIdToken } from '../auth/cognitoClient';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    'https://api.raider-tools.app';

const DEFAULT_DEBOUNCE_MS = 1500;

export type DomainName = 'quests' | 'loot' | 'quartermaster';

export interface DomainEnvelope<T> {
    schemaVersion: number;
    data: T;
    /**
     * Optimistic-concurrency revision from the server. `null` on the
     * local backend and before the first read/write on the remote one.
     */
    revision: number | null;
}

/**
 * Thrown by the remote backend when a write is rejected because its
 * `revision` does not match the server. The payload contains the
 * server's current view so the caller can reconcile without an extra GET.
 */
export class ConflictError<T> extends Error {
    readonly current: DomainEnvelope<T> | null;
    constructor(current: DomainEnvelope<T> | null) {
        super('revision_conflict');
        this.name = 'ConflictError';
        this.current = current;
    }
}

export interface WriteResult {
    /** New revision assigned by the server (local backend returns null). */
    revision: number | null;
}

export interface Backend<T> {
    read(): Promise<DomainEnvelope<T> | null>;
    /**
     * Write the envelope. The envelope's `revision` field is interpreted
     * as the *expected* revision for optimistic concurrency by the
     * remote backend; the local backend ignores it. Returns the new
     * revision (remote backend) or null (local).
     * Throws `ConflictError` when the remote backend observes a
     * revision mismatch.
     */
    write(value: DomainEnvelope<T>): Promise<WriteResult>;
    clear(): Promise<void>;
    /** Display name for diagnostics. */
    readonly kind: 'local' | 'remote';
}

export interface StoreOptions<T> {
    /** The stable domain name this store represents. */
    domain: DomainName;
    /** Schema version emitted by this build. */
    schemaVersion: number;
    /** Produced when nothing has ever been written. */
    defaultValue: T;
    /**
     * Hook to upgrade older schemas to the current one. Called on any
     * envelope whose `schemaVersion` is less than the current. The default
     * is identity (accept the stored value as-is).
     */
    migrate?: (raw: unknown, fromVersion: number) => T;
    /** How long to wait after the last `set` before flushing (default 1.5 s). */
    debounceMs?: number;
}

/**
 * A single domain store. One instance per domain, lived-for the life of
 * the browser tab.
 */
export class UserStateStore<T> {
    private current: T;
    private subscribers = new Set<() => void>();
    private backend: Backend<T>;
    private dirty = false;
    private debounceMs: number;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingWrite: Promise<void> = Promise.resolve();
    /**
     * Last revision observed from the server. `null` means the remote
     * row has never been seen (or we are currently on the local backend,
     * which has no concept of revisions).
     */
    private currentRevision: number | null = null;
    /**
     * Tracks the most recent conflict detected by the remote backend, so
     * the UI / callers can surface it if desired. Cleared on the next
     * successful write or hydrate.
     */
    private lastConflict: DomainEnvelope<T> | null = null;
    private readonly opts: StoreOptions<T>;

    constructor(opts: StoreOptions<T>) {
        this.opts = opts;
        this.current = opts.defaultValue;
        this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
        // Always start on the local backend; the sign-in orchestrator may
        // switch to the remote one later.
        this.backend = new LocalBackend<T>(opts);
    }

    get domain(): DomainName { return this.opts.domain; }
    get schemaVersion(): number { return this.opts.schemaVersion; }
    get backendKind(): 'local' | 'remote' { return this.backend.kind; }
    get revision(): number | null { return this.currentRevision; }
    /** The most recent server snapshot adopted after a revision conflict. */
    get conflict(): DomainEnvelope<T> | null { return this.lastConflict; }

    /** Current snapshot (in-memory). Safe to call synchronously. */
    get(): T {
        return this.current;
    }

    /** Replace the current value. Triggers a debounced persistence write. */
    set(next: T): void {
        this.current = next;
        this.dirty = true;
        this.scheduleFlush();
        this.notify();
    }

    /**
     * Subscribe to value changes. Returns an unsubscribe function. Useful
     * with React's `useSyncExternalStore`.
     */
    subscribe(listener: () => void): () => void {
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
    }

    /**
     * Load the current value from the active backend and set it as the
     * in-memory snapshot. Called during app boot and after backend swaps.
     */
    async hydrate(): Promise<void> {
        const stored = await this.backend.read();
        if (!stored) {
            this.current = this.opts.defaultValue;
            this.currentRevision = null;
        } else if (stored.schemaVersion === this.opts.schemaVersion) {
            this.current = stored.data;
            this.currentRevision = stored.revision;
        } else if (stored.schemaVersion < this.opts.schemaVersion && this.opts.migrate) {
            this.current = this.opts.migrate(stored.data, stored.schemaVersion);
            this.currentRevision = stored.revision;
        } else {
            // Newer version than we understand; keep it as-is and hope for
            // the best. Logging, not crashing, is the right move for a
            // client that's a bit behind.
            console.warn(
                `[userStateStore:${this.opts.domain}] stored schemaVersion ${stored.schemaVersion} > current ${this.opts.schemaVersion}; using raw value`,
            );
            this.current = stored.data as T;
            this.currentRevision = stored.revision;
        }
        this.dirty = false;
        this.lastConflict = null;
        this.notify();
    }

    /**
     * Replace the snapshot with a freshly-supplied value (e.g. returned by
     * the server) and persist via the current backend without debouncing.
     * Used by sign-in orchestration when the server is authoritative.
     */
    async setAuthoritative(next: T, schemaVersion: number): Promise<void> {
        // If the incoming payload carries an older version, run migrate.
        if (schemaVersion < this.opts.schemaVersion && this.opts.migrate) {
            this.current = this.opts.migrate(next, schemaVersion);
        } else {
            this.current = next;
        }
        this.dirty = false;
        this.lastConflict = null;
        this.notify();
        // Write through immediately to the active backend so local cache
        // and server stay consistent. The backend may return a new
        // revision (remote backend) which we capture.
        const result = await this.backend.write({
            schemaVersion: this.opts.schemaVersion,
            data: this.current,
            revision: this.currentRevision,
        });
        if (result.revision !== null) {
            this.currentRevision = result.revision;
        }
    }

    /**
     * Swap the underlying backend (local ↔ remote). Any pending debounced
     * write on the old backend is flushed first so no data is lost.
     */
    async setBackend(kind: 'local' | 'remote'): Promise<void> {
        if (this.backend.kind === kind) return;
        await this.flush();
        this.backend = kind === 'remote'
            ? new RemoteBackend<T>(this.opts)
            : new LocalBackend<T>(this.opts);
    }

    /** Force-persist any dirty value through the current backend. */
    async flush(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (!this.dirty) {
            await this.pendingWrite;
            return;
        }
        this.dirty = false;
        const envelope: DomainEnvelope<T> = {
            schemaVersion: this.opts.schemaVersion,
            data: this.current,
            revision: this.currentRevision,
        };
        this.pendingWrite = this.backend.write(envelope)
            .then(result => {
                if (result.revision !== null) {
                    this.currentRevision = result.revision;
                }
                this.lastConflict = null;
            })
            .catch(async err => {
                if (err instanceof ConflictError) {
                    // Another device beat us to it. Adopt the server
                    // snapshot (D5: server wins), remember the conflict
                    // so the UI can notice, and drop the pending write.
                    const conflict = err.current as DomainEnvelope<T> | null;
                    if (conflict) {
                        this.current = conflict.data;
                        this.currentRevision = conflict.revision;
                        this.lastConflict = conflict;
                    } else {
                        this.current = this.opts.defaultValue;
                        this.currentRevision = null;
                        this.lastConflict = null;
                    }
                    this.notify();
                    console.warn(
                        `[userStateStore:${this.opts.domain}] revision conflict; adopted server state (revision=${this.currentRevision})`,
                    );
                    return;
                }
                console.error(`[userStateStore:${this.opts.domain}] write failed`, err);
                this.dirty = true;
            });
        await this.pendingWrite;
    }

    /**
     * Clear the value in the active backend and reset the in-memory
     * snapshot to the default. Used at sign-out (for the three domains we
     * want to wipe on sign-out).
     */
    async clearAll(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.dirty = false;
        this.current = this.opts.defaultValue;
        this.currentRevision = null;
        this.lastConflict = null;
        await this.backend.clear();
        this.notify();
    }

    /**
     * Delete the value from `localStorage` regardless of current backend.
     * Used at sign-out to guarantee the device has no leftover local state.
     */
    async clearLocal(): Promise<void> {
        await new LocalBackend<T>(this.opts).clear();
    }

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------
    private scheduleFlush(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.flush();
        }, this.debounceMs);
    }

    private notify(): void {
        for (const listener of this.subscribers) listener();
    }
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------
class LocalBackend<T> implements Backend<T> {
    readonly kind = 'local' as const;
    private readonly key: string;
    constructor(opts: StoreOptions<T>) {
        this.key = `rt_state_${opts.domain}`;
    }
    async read(): Promise<DomainEnvelope<T> | null> {
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<DomainEnvelope<T>>;
            if (!parsed || typeof parsed.schemaVersion !== 'number') return null;
            return {
                schemaVersion: parsed.schemaVersion,
                data: parsed.data as T,
                // Legacy entries written before phase-2.5 did not carry a
                // revision; treat them as unknown so the first remote
                // write creates a fresh row.
                revision: typeof parsed.revision === 'number' ? parsed.revision : null,
            };
        } catch (err) {
            console.warn(`[userStateStore:${this.key}] corrupt local entry`, err);
            return null;
        }
    }
    async write(envelope: DomainEnvelope<T>): Promise<WriteResult> {
        try {
            localStorage.setItem(this.key, JSON.stringify(envelope));
        } catch (err) {
            console.warn(`[userStateStore:${this.key}] localStorage write failed`, err);
        }
        // Local storage has no server-assigned revision.
        return { revision: null };
    }
    async clear(): Promise<void> {
        localStorage.removeItem(this.key);
    }
}

class RemoteBackend<T> implements Backend<T> {
    readonly kind = 'remote' as const;
    private readonly opts: StoreOptions<T>;
    constructor(opts: StoreOptions<T>) {
        this.opts = opts;
    }
    async read(): Promise<DomainEnvelope<T> | null> {
        const token = await getIdToken();
        if (!token) throw new Error('Not signed in');
        const resp = await fetch(`${API_BASE}/me/state/${this.opts.domain}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error(`GET /me/state/${this.opts.domain} failed: ${resp.status}`);
        const json = await resp.json() as { schemaVersion: number; data: T; revision?: number };
        return {
            schemaVersion: json.schemaVersion,
            data: json.data,
            revision: typeof json.revision === 'number' ? json.revision : null,
        };
    }
    async write(envelope: DomainEnvelope<T>): Promise<WriteResult> {
        const token = await getIdToken();
        if (!token) throw new Error('Not signed in');
        // The PUT body echoes our last-seen revision so the server can
        // reject the write when it has moved on. A null `revision` means
        // "I've never seen this row before"; the server will create it
        // with revision 1 (`attribute_not_exists(pk)` check).
        const putBody: Record<string, unknown> = {
            schemaVersion: envelope.schemaVersion,
            data: envelope.data,
        };
        if (envelope.revision !== null) {
            putBody.revision = envelope.revision;
        }
        const resp = await fetch(`${API_BASE}/me/state/${this.opts.domain}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(putBody),
            keepalive: true,
        });
        if (resp.status === 409) {
            const body = await resp.json().catch(() => ({})) as {
                current?: { schemaVersion: number; data: T; revision?: number };
            };
            const current = body.current
                ? {
                    schemaVersion: body.current.schemaVersion,
                    data: body.current.data,
                    revision: typeof body.current.revision === 'number' ? body.current.revision : null,
                }
                : null;
            throw new ConflictError<T>(current);
        }
        if (!resp.ok) throw new Error(`PUT /me/state/${this.opts.domain} failed: ${resp.status}`);
        const okBody = await resp.json().catch(() => ({})) as { revision?: number };
        return { revision: typeof okBody.revision === 'number' ? okBody.revision : null };
    }
    async clear(): Promise<void> {
        const token = await getIdToken();
        if (!token) throw new Error('Not signed in');
        const resp = await fetch(`${API_BASE}/me/state/${this.opts.domain}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok && resp.status !== 404) {
            throw new Error(`DELETE /me/state/${this.opts.domain} failed: ${resp.status}`);
        }
    }
}

