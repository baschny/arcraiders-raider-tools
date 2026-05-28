/**
 * Optimistic-concurrency tests (phase 2.5).
 *
 * The goal is to prove:
 *  1. A PUT sent with a stale revision is rejected with 409 and the
 *     store adopts the server's current state.
 *  2. After a successful first PUT, the store's revision is updated so
 *     a subsequent same-tab edit keeps writing cleanly.
 *  3. "Two tabs" — simulated as two independent `UserStateStore`
 *     instances sharing the same in-memory server mock — cannot
 *     silently overwrite each other; the one writing with a stale
 *     revision loses its uncommitted edit and sees the winner's state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserStateStore } from '../userStateStore';

vi.mock('../../auth/cognitoClient', () => ({
    getIdToken: vi.fn().mockResolvedValue('test-id-token'),
}));

interface QuestsTestState {
    mode: 'manual' | 'linked';
    manualCompletedQuestIds: string[];
}

// ---------------------------------------------------------------------------
// A tiny in-memory server that mimics state.ts's optimistic-concurrency rules.
// ---------------------------------------------------------------------------
interface ServerRow {
    schemaVersion: number;
    data: QuestsTestState;
    revision: number;
}

interface Server {
    quests: ServerRow | null;
    calls: Array<{ method: string; body: unknown }>;
}

function installServer(server: Server): void {
    const fake = vi.fn(async (input: string, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        server.calls.push({ method, body });

        if (!input.endsWith('/me/state/quests')) {
            return new Response(null, { status: 404 });
        }

        if (method === 'GET') {
            if (!server.quests) return new Response(null, { status: 404 });
            return json(server.quests);
        }
        if (method === 'PUT') {
            const p = body as { schemaVersion: number; data: QuestsTestState; revision?: number };
            if (server.quests) {
                if (typeof p.revision !== 'number' || p.revision !== server.quests.revision) {
                    return json({ error: 'revision_conflict', current: server.quests }, 409);
                }
                server.quests = {
                    schemaVersion: p.schemaVersion,
                    data: p.data,
                    revision: server.quests.revision + 1,
                };
                return json({ ok: true, revision: server.quests.revision });
            }
            if (typeof p.revision === 'number') {
                return json({ error: 'revision_conflict', current: null }, 409);
            }
            server.quests = {
                schemaVersion: p.schemaVersion,
                data: p.data,
                revision: 1,
            };
            return json({ ok: true, revision: 1 });
        }
        if (method === 'DELETE') {
            server.quests = null;
            return json({ ok: true });
        }
        return new Response(null, { status: 405 });
    });
    vi.stubGlobal('fetch', fake);
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeStore(): UserStateStore<QuestsTestState> {
    return new UserStateStore<QuestsTestState>({
        domain: 'quests',
        schemaVersion: 2,
        defaultValue: { mode: 'manual', manualCompletedQuestIds: [] },
        debounceMs: 5,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('optimistic concurrency', () => {
    let server: Server;

    beforeEach(() => {
        server = { quests: null, calls: [] };
        installServer(server);
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends no revision on the first write and captures the assigned one', async () => {
        const store = makeStore();
        await store.setBackend('remote');
        expect(store.revision).toBeNull();

        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        await store.flush();

        expect(server.quests).toEqual({
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['q1'] },
            revision: 1,
        });
        expect(store.revision).toBe(1);

        // First PUT body must NOT include a revision (new-row semantics).
        const firstPut = server.calls.find(c => c.method === 'PUT')!;
        expect(firstPut.body).toEqual({
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['q1'] },
        });
    });

    it('increments the revision on each successful subsequent write', async () => {
        const store = makeStore();
        await store.setBackend('remote');

        store.set({ mode: 'manual', manualCompletedQuestIds: ['a'] });
        await store.flush();
        expect(store.revision).toBe(1);

        store.set({ mode: 'manual', manualCompletedQuestIds: ['a', 'b'] });
        await store.flush();
        expect(store.revision).toBe(2);

        store.set({ mode: 'manual', manualCompletedQuestIds: ['a', 'b', 'c'] });
        await store.flush();
        expect(store.revision).toBe(3);

        // Last two PUTs included revisions 1 and 2 respectively.
        const puts = server.calls.filter(c => c.method === 'PUT');
        expect(puts[1].body).toMatchObject({ revision: 1 });
        expect(puts[2].body).toMatchObject({ revision: 2 });
    });

    it('adopts the server state when a PUT is rejected with 409', async () => {
        // Seed the server with a row at revision 4.
        server.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['server-q'] },
            revision: 4,
        };

        // Store thinks the row is at revision 1 (stale). This simulates
        // a tab that was out of date.
        const store = makeStore();
        await store.setBackend('remote');
        // Force the known revision to something stale by going through
        // setAuthoritative, which captures any revision-less result. A
        // cleaner way here: hydrate first to observe rev 4, then
        // manually contrive the conflict by reaching into set() after
        // a different device has bumped the server. We take the
        // "manual contrivance" path by pre-hydrating then mutating the
        // server row to simulate someone else's write.
        await store.hydrate();
        expect(store.revision).toBe(4);

        // Another device writes and bumps the server to revision 5
        // WITHOUT our store knowing.
        server.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['other-device-wins'] },
            revision: 5,
        };

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Our store makes a local edit and flushes with the stale rev 4.
        store.set({ mode: 'manual', manualCompletedQuestIds: ['our-attempt'] });
        await store.flush();

        // Server is unchanged (the write was rejected).
        expect(server.quests.data).toEqual({ mode: 'manual', manualCompletedQuestIds: ['other-device-wins'] });
        expect(server.quests.revision).toBe(5);
        // Store adopted the winner's state + revision.
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: ['other-device-wins'] });
        expect(store.revision).toBe(5);
        // Conflict was surfaced.
        expect(store.conflict?.data).toEqual({ mode: 'manual', manualCompletedQuestIds: ['other-device-wins'] });
        expect(warn).toHaveBeenCalled();

        warn.mockRestore();
    });

    it('two stores racing the same server row: one wins, the other adopts', async () => {
        // Both stores hydrate from an initial server state.
        server.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['shared'] },
            revision: 1,
        };

        const storeA = makeStore();
        const storeB = makeStore();
        await storeA.setBackend('remote');
        await storeB.setBackend('remote');
        await storeA.hydrate();
        await storeB.hydrate();
        expect(storeA.revision).toBe(1);
        expect(storeB.revision).toBe(1);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Both tabs make concurrent edits.
        storeA.set({ mode: 'manual', manualCompletedQuestIds: ['shared', 'from-A'] });
        storeB.set({ mode: 'manual', manualCompletedQuestIds: ['shared', 'from-B'] });

        // Tab A flushes first — it wins.
        await storeA.flush();
        expect(server.quests.data).toEqual({ mode: 'manual', manualCompletedQuestIds: ['shared', 'from-A'] });
        expect(server.quests.revision).toBe(2);
        expect(storeA.revision).toBe(2);

        // Tab B flushes next with its stale rev 1 — gets 409, adopts A's state.
        await storeB.flush();
        expect(server.quests.data).toEqual({ mode: 'manual', manualCompletedQuestIds: ['shared', 'from-A'] });
        expect(storeB.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: ['shared', 'from-A'] });
        expect(storeB.revision).toBe(2);
        expect(storeB.conflict).not.toBeNull();

        warn.mockRestore();
    });

    it('after a conflict the store can write again cleanly with the new revision', async () => {
        server.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['initial'] },
            revision: 1,
        };
        const store = makeStore();
        await store.setBackend('remote');
        await store.hydrate();

        // Another device bumps.
        server.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['winner'] },
            revision: 2,
        };

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Trigger a conflict.
        store.set({ mode: 'manual', manualCompletedQuestIds: ['doomed'] });
        await store.flush();
        expect(store.revision).toBe(2);
        expect(store.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: ['winner'] });

        // New edit now writes successfully on top of the server state.
        store.set({ mode: 'manual', manualCompletedQuestIds: ['winner', 'added-after-conflict'] });
        await store.flush();
        expect(server.quests?.data).toEqual({
            mode: 'manual',
            manualCompletedQuestIds: ['winner', 'added-after-conflict'],
        });
        expect(server.quests?.revision).toBe(3);
        expect(store.revision).toBe(3);
        expect(store.conflict).toBeNull();

        warn.mockRestore();
    });
});
