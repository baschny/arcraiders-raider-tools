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
    mode: 'manual' | 'linked';
    manualCompletedQuestIds: string[];
}

const QUESTS_LOCAL_KEY = 'rt_state_quests';

function makeStore(opts?: Partial<ConstructorParameters<typeof UserStateStore<QuestsTestState>>[0]>) {
    return new UserStateStore<QuestsTestState>({
        domain: 'quests',
        schemaVersion: 2,
        defaultValue: { mode: 'manual', manualCompletedQuestIds: [] },
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
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: [] });
    });

    it('hydrates from a well-formed local entry', async () => {
        localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['q1', 'q2'] },
        }));
        const store = makeStore();
        await store.hydrate();
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: ['q1', 'q2'] });
    });

    it('falls back to default on a corrupt local entry', async () => {
        localStorage.setItem(QUESTS_LOCAL_KEY, 'not-json');
        const store = makeStore();
        await store.hydrate();
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: [] });
    });

    it('runs migrate() when the stored schemaVersion is older than current', async () => {
        localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
            schemaVersion: 1,
            data: { completedQuestIds: ['ss1'] }, // legacy id
        }));
        const migrate = vi.fn((raw: unknown) => ({
            mode: 'manual',
            manualCompletedQuestIds: ['picking_up_the_pieces'],
            __migratedFromRaw: raw,
        } as unknown as QuestsTestState));
        const store = new UserStateStore<QuestsTestState>({
            domain: 'quests',
            schemaVersion: 2,
            defaultValue: { mode: 'manual', manualCompletedQuestIds: [] },
            migrate,
        });
        await store.hydrate();
        expect(migrate).toHaveBeenCalledOnce();
        expect(store.get().manualCompletedQuestIds).toContain('picking_up_the_pieces');
    });

    it('preserves newer-than-current stored values as-is with a warning', async () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
            schemaVersion: 99,
            data: { mode: 'manual', manualCompletedQuestIds: ['q-future'] },
        }));
        const store = makeStore();
        await store.hydrate();
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: ['q-future'] });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('notifies subscribers on set()', () => {
        const store = makeStore();
        const fn = vi.fn();
        const unsubscribe = store.subscribe(fn);
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a'] });
        expect(fn).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a', 'b'] });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('debounces local persistence and serializes the same envelope shape', async () => {
        const store = makeStore({ debounceMs: 50 });
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a'] });
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a', 'b'] });
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a', 'b', 'c'] });
        // Nothing has hit localStorage yet.
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        await vi.advanceTimersByTimeAsync(60);

        const raw = localStorage.getItem(QUESTS_LOCAL_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.schemaVersion).toBe(2);
        expect(parsed.data.manualCompletedQuestIds).toEqual(['a', 'b', 'c']);
        expect(parsed.data.mode).toBe('manual');
    });

    it('flush() forces a persist before the debounce timer fires', async () => {
        const store = makeStore({ debounceMs: 10_000 });
        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        await store.flush();

        const raw = localStorage.getItem(QUESTS_LOCAL_KEY);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!).data.manualCompletedQuestIds).toEqual(['q1']);
    });

    it('setBackend() flushes pending writes before swapping', async () => {
        const store = makeStore({ debounceMs: 10_000 });
        store.set({ mode: 'manual', manualCompletedQuestIds: ['pending'] });
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();

        const fetchSpy = vi.fn(async () => {
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
        expect(JSON.parse(raw!).data.manualCompletedQuestIds).toEqual(['pending']);
        // No network write was triggered by the swap itself.
        expect(fetchSpy).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });

    it('clearAll() wipes the active backend and resets to default', async () => {
        const store = makeStore();
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a'] });
        await store.flush();
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).not.toBeNull();

        await store.clearAll();
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: [] });
        expect(localStorage.getItem(QUESTS_LOCAL_KEY)).toBeNull();
    });

    it('clearLocal() wipes localStorage even when running the remote backend', async () => {
        const store = makeStore();
        store.set({ mode: 'manual', manualCompletedQuestIds: ['a'] });
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

        await store.setAuthoritative({ mode: 'manual', manualCompletedQuestIds: ['server-says'] }, 2);

        const writes = calls.filter(c => c.url.endsWith('/me/state/quests'));
        expect(writes).toHaveLength(1);
        // First write on a brand-new row — no revision sent.
        expect(writes[0].body).toEqual({
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['server-says'] },
        });
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: ['server-says'] });
        // Revision captured from server response.
        expect(store.revision).toBe(1);

        vi.unstubAllGlobals();
    });
});
