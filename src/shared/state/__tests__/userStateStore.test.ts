/**
 * Unit + integration tests for the generic `UserStateStore`.
 *
 * We test behaviour the rest of the state-sync system relies on:
 *  - debounced local persistence via localStorage,
 *  - hydrate() applies stored values (respecting schemaVersion + migrate),
 *  - subscribers are notified on every change,
 *  - backend swaps flush pending writes first,
 *  - setAuthoritative writes immediately (used by sign-in hydrate),
 *  - clearAll / clearLocal wipe state through the right backend.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserStateStore } from '../userStateStore';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------
// `getIdToken` is the only external dependency the RemoteBackend uses; most
// tests here run on the local backend, but we still need the import to
// resolve for tests that swap to remote.
vi.mock('../../auth/cognitoClient', () => ({
    getIdToken: vi.fn().mockResolvedValue('test-id-token'),
}));

interface QuestsTestState {
    completedQuestIds: string[];
}

const QUESTS_LOCAL_KEY = 'rt_state_quests';

function makeStore(opts?: Partial<ConstructorParameters<typeof UserStateStore<QuestsTestState>>[0]>) {
    return new UserStateStore<QuestsTestState>({
        domain: 'quests',
        schemaVersion: 1,
        defaultValue: { completedQuestIds: [] },
        debounceMs: 20,
        ...opts,
    });
}

describe('UserStateStore', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the default value before hydrate', () => {
        const store = makeStore();
        expect(store.get()).toEqual({ completedQuestIds: [] });
    });

    it('hydrates from a well-formed local entry', async () => {
        localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
            schemaVersion: 1,
            data: { completedQuestIds: ['q1', 'q2'] },
        }));
        const store = makeStore();
        await store.hydrate();
        expect(store.get()).toEqual({ completedQuestIds: ['q1', 'q2'] });
    });

    it('falls back to default on a corrupt local entry', async () => {
        localStorage.setItem(QUESTS_LOCAL_KEY, 'not-json');
        const store = makeStore();
        await store.hydrate();
        expect(store.get()).toEqual({ completedQuestIds: [] });
    });

    it('runs migrate() when the stored schemaVersion is older than current', async () => {
        localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
            schemaVersion: 1,
            data: { completedQuestIds: ['ss1'] }, // legacy id
        }));
        const migrate = vi.fn((raw: unknown) => ({
            completedQuestIds: ['picking_up_the_pieces'],
            __migratedFromRaw: raw,
        } as unknown as QuestsTestState));
        const store = new UserStateStore<QuestsTestState>({
            domain: 'quests',
            schemaVersion: 2,
            defaultValue: { completedQuestIds: [] },
            migrate,
        });
        await store.hydrate();
        expect(migrate).toHaveBeenCalledOnce();
        expect(store.get().completedQuestIds).toContain('picking_up_the_pieces');
    });

    it('preserves newer-than-current stored values as-is with a warning', async () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
            schemaVersion: 99,
            data: { completedQuestIds: ['q-future'] },
        }));
        const store = makeStore();
        await store.hydrate();
        expect(store.get()).toEqual({ completedQuestIds: ['q-future'] });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('notifies subscribers on set()', () => {
        const store = makeStore();
        const fn = vi.fn();
        const unsubscribe = store.subscribe(fn);
        store.set({ completedQuestIds: ['a'] });
        expect(fn).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.set({ completedQuestIds: ['a', 'b'] });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('debounces local persistence and serializes the same envelope shape', async () => {
        const store = makeStore({ debounceMs: 50 });
        store.set({ completedQuestIds: ['a'] });
        store.set({ completedQuestIds: ['a', 'b'] });
        store.set({ completedQuestIds: ['a', 'b', 'c'] });
        // Nothing has hit localStorage yet.
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        await vi.advanceTimersByTimeAsync(60);

        const raw = localStorage.getItem(QUESTS_LOCAL_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.schemaVersion).toBe(1);
        expect(parsed.data.completedQuestIds).toEqual(['a', 'b', 'c']);
    });

    it('flush() forces a persist before the debounce timer fires', async () => {
        const store = makeStore({ debounceMs: 10_000 });
        store.set({ completedQuestIds: ['q1'] });
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        await store.flush();

        const raw = localStorage.getItem(QUESTS_LOCAL_KEY);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!).data.completedQuestIds).toEqual(['q1']);
    });

    it('setBackend() flushes pending writes before swapping', async () => {
        const store = makeStore({ debounceMs: 10_000 });
        store.set({ completedQuestIds: ['pending'] });
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => {
            return new Response(JSON.stringify({ ok: true, revision: 1 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchSpy);

        await store.setBackend('remote');

        // The pending value should have made it into localStorage via the
        // old (local) backend before the swap.
        const raw = localStorage.getItem(QUESTS_LOCAL_KEY);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!).data.completedQuestIds).toEqual(['pending']);
        // No network write was triggered by the swap itself.
        expect(fetchSpy).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });

    it('clearAll() wipes the active backend and resets to default', async () => {
        const store = makeStore();
        store.set({ completedQuestIds: ['a'] });
        await store.flush();
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).not.toBeNull();

        await store.clearAll();
        expect(store.get()).toEqual({ completedQuestIds: [] });
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();
    });

    it('clearLocal() wipes localStorage even when running the remote backend', async () => {
        const store = makeStore();
        store.set({ completedQuestIds: ['a'] });
        await store.flush();

        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ ok: true, revision: 1 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )));
        await store.setBackend('remote');
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).not.toBeNull();

        await store.clearLocal();
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        vi.unstubAllGlobals();
    });

    it('setAuthoritative() writes through immediately on the current backend', async () => {
        const store = makeStore({ debounceMs: 10_000 });

        const calls: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
            return new Response(
                JSON.stringify({ ok: true, revision: 1 }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
        }));
        await store.setBackend('remote');

        await store.setAuthoritative({ completedQuestIds: ['server-says'] }, 1);

        const writes = calls.filter(c => c.url.endsWith('/me/state/quests'));
        expect(writes).toHaveLength(1);
        // First write on a brand-new row — no revision sent.
        expect(writes[0].body).toEqual({
            schemaVersion: 1,
            data: { completedQuestIds: ['server-says'] },
        });
        expect(store.get()).toEqual({ completedQuestIds: ['server-says'] });
        // Revision captured from server response.
        expect(store.revision).toBe(1);

        vi.unstubAllGlobals();
    });
});
