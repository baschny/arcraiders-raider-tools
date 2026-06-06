/**
 * Integration tests for the sign-in / sign-out state-sync orchestrator.
 *
 * These tests exercise the full flow across `userStateStore`, the three
 * concrete `stores`, and `hydration.ts` — with `fetch` mocked to simulate
 * the server — to prove:
 *
 *  - First login with local data pushes it to the server via /me/migrate,
 *    then swaps stores to the remote backend.
 *  - First login with no local data still swaps to remote and downloads.
 *  - A returning user on a new device has their stale local data replaced
 *    by the server copy (server-wins).
 *  - When two devices race the migration, the one that loses (409 from
 *    /me/migrate) falls through to server-wins too.
 *  - Sign-out wipes both the new `rt_state_*` keys and the legacy keys
 *    from before phase 2, and returns the stores to their defaults.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runPostSignInSync, runSignOutWipe } from '../hydration';
import {
    allStores,
    questsStore,
    lootStore,
    quartermasterStore,
} from '../stores';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------
vi.mock('../../auth/cognitoClient', () => ({
    getIdToken: vi.fn().mockResolvedValue('test-id-token'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type FetchInit = RequestInit | undefined;

interface ServerRow {
    schemaVersion: number;
    data: unknown;
    revision: number;
    updatedAt: string;
}

interface ServerState {
    me: { sub: string; dataMigrationCompleted: boolean };
    state: {
        quests?: ServerRow;
        loot?: ServerRow;
        quartermaster?: ServerRow;
    };
    migrateOutcome: 'ok' | '409';
    calls: Array<{ url: string; method: string; body?: unknown }>;
}

function installServerMock(server: ServerState): void {
    const fake = vi.fn(async (input: string, init: FetchInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        server.calls.push({ url: input, method, body });

        if (input.endsWith('/me') && method === 'GET') {
            return json(server.me);
        }
        if (input.endsWith('/me/migrate') && method === 'POST') {
            if (server.migrateOutcome === '409') {
                return json({ migrated: false, reason: 'already_migrated' }, 409);
            }
            // apply writes to server state, each row starts at revision 1.
            for (const [domain, payload] of Object.entries(body ?? {})) {
                const p = payload as { schemaVersion: number; data: unknown };
                (server.state as Record<string, ServerRow>)[domain] = {
                    schemaVersion: p.schemaVersion,
                    data: p.data,
                    revision: 1,
                    updatedAt: new Date().toISOString(),
                };
            }
            server.me.dataMigrationCompleted = true;
            return json({ migrated: true });
        }
        const match = /\/me\/state\/(quests|loot|quartermaster)$/.exec(input);
        if (match) {
            const domain = match[1] as keyof ServerState['state'];
            if (method === 'GET') {
                const entry = server.state[domain];
                if (!entry) return new Response(null, { status: 404 });
                return json(entry);
            }
            if (method === 'PUT') {
                const p = body as { schemaVersion: number; data: unknown; revision?: number };
                const existing = server.state[domain];
                if (existing) {
                    // Updating an existing row: require a matching revision.
                    if (typeof p.revision !== 'number' || p.revision !== existing.revision) {
                        return json({ error: 'revision_conflict', current: existing }, 409);
                    }
                    const next: ServerRow = {
                        schemaVersion: p.schemaVersion,
                        data: p.data,
                        revision: existing.revision + 1,
                        updatedAt: new Date().toISOString(),
                    };
                    server.state[domain] = next;
                    return json({ ok: true, revision: next.revision });
                }
                // New row: the caller must NOT supply a revision.
                if (typeof p.revision === 'number') {
                    return json({ error: 'revision_conflict', current: null }, 409);
                }
                server.state[domain] = {
                    schemaVersion: p.schemaVersion,
                    data: p.data,
                    revision: 1,
                    updatedAt: new Date().toISOString(),
                };
                return json({ ok: true, revision: 1 });
            }
            if (method === 'DELETE') {
                delete server.state[domain];
                return json({ ok: true });
            }
        }
        return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fake);
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function resetStoresToLocal(): Promise<void> {
    // Ensure each store is on the local backend and at its default, and
    // that localStorage is empty before each test.
    for (const store of allStores) {
        await store.setBackend('local');
        await store.clearAll();
    }
    localStorage.clear();
}

describe('state-sync integration: sign-in / sign-out', () => {
    let server: ServerState;

    beforeEach(async () => {
        server = {
            me: { sub: 'user-sub-1', dataMigrationCompleted: false },
            state: {},
            migrateOutcome: 'ok',
            calls: [],
        };
        installServerMock(server);
        await resetStoresToLocal();
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        await resetStoresToLocal();
    });

    // -----------------------------------------------------------------
    // First-sign-in migration
    // -----------------------------------------------------------------
    it('pushes local data to the server on first sign-in and swaps to remote', async () => {
        // Pre-populate local state on three domains.
        questsStore.set({ mode: 'manual', manualCompletedQuestIds: ['q1', 'q2'] });
        lootStore.set({
            goalItems: ['item_a'],
            disabledItems: [],
            stashItems: [],
            disabledStashItems: [],
            enabledTypes: null,
            enabledRarities: null,
            enabledLocations: null,
        });
        quartermasterStore.set({
            lists: [{ id: 'list_1', name: 'My List', type: 'user', isEnabled: true, items: [] }],
            hideoutToggles: { listEnabled: {}, itemEnabled: {} },
            projectToggles: { listEnabled: {}, itemEnabled: {} },
            questToggles: { listEnabled: {}, itemEnabled: {} },
            prioritizedItemIds: [],
            weaponBuilds: [],
        });
        await Promise.all(allStores.map(s => s.flush()));

        await runPostSignInSync();

        // All three stores should now be on remote.
        for (const store of allStores) {
            expect(store.backendKind).toBe('remote');
        }
        // /me/migrate must have been called with the full payload.
        const migrateCall = server.calls.find(c => c.url.endsWith('/me/migrate') && c.method === 'POST');
        expect(migrateCall).toBeDefined();
        expect(migrateCall!.body).toMatchObject({
            quests: {
                schemaVersion: 2,
                data: { mode: 'manual', manualCompletedQuestIds: ['q1', 'q2'] },
            },
            loot: { schemaVersion: 1, data: { goalItems: ['item_a'] } },
            quartermaster: { schemaVersion: 5, data: { weaponBuilds: [] } },
        });
        // Server now has the data.
        expect(server.state.quests?.data).toEqual({
            mode: 'manual',
            manualCompletedQuestIds: ['q1', 'q2'],
        });
        expect(server.state.quartermaster?.data).toMatchObject({ lists: [{ id: 'list_1' }] });
        // And the flag flipped.
        expect(server.me.dataMigrationCompleted).toBe(true);
    });

    it('skips migration when there is no local data and pulls from the server', async () => {
        server.me.dataMigrationCompleted = true;
        server.state.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['server-q-1'] },
            revision: 3,
            updatedAt: 'now',
        };

        await runPostSignInSync();

        for (const store of allStores) {
            expect(store.backendKind).toBe('remote');
        }
        // No /me/migrate call — straight to server-wins GETs.
        const migrateCall = server.calls.find(c => c.url.endsWith('/me/migrate'));
        expect(migrateCall).toBeUndefined();
        expect(questsStore.get()).toEqual({
            mode: 'manual',
            manualCompletedQuestIds: ['server-q-1'],
        });
    });

    it('treats linked quest mode as local quest data for migration purposes', async () => {
        questsStore.set({ mode: 'linked', manualCompletedQuestIds: [] });
        await questsStore.flush();

        await runPostSignInSync();

        const migrateCall = server.calls.find(c => c.url.endsWith('/me/migrate') && c.method === 'POST');
        expect(migrateCall).toBeDefined();
        expect(migrateCall!.body).toMatchObject({
            quests: {
                schemaVersion: 2,
                data: { mode: 'linked', manualCompletedQuestIds: [] },
            },
        });
    });

    // -----------------------------------------------------------------
    // Server-wins on returning devices
    // -----------------------------------------------------------------
    it('replaces stale local data on sign-in when the server already has the user migrated', async () => {
        // Device-local stale state:
        questsStore.set({ mode: 'manual', manualCompletedQuestIds: ['stale-q'] });
        await questsStore.flush();

        // Server has newer data and is already migrated:
        server.me.dataMigrationCompleted = true;
        server.state.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['fresh-q-1', 'fresh-q-2'] },
            revision: 7,
            updatedAt: 'now',
        };

        await runPostSignInSync();

        expect(questsStore.get()).toEqual({
            mode: 'manual',
            manualCompletedQuestIds: ['fresh-q-1', 'fresh-q-2'],
        });
        // Domains the server has no data for reset to their defaults.
        expect(lootStore.get().goalItems).toEqual([]);
    });

    it('falls through to server-wins when /me/migrate returns 409', async () => {
        questsStore.set({ mode: 'manual', manualCompletedQuestIds: ['local-only'] });
        await questsStore.flush();

        // Server response says "already migrated" via 409, even though the
        // `/me` lookup still reports false (race between two devices).
        server.migrateOutcome = '409';
        server.me.dataMigrationCompleted = false;
        server.state.quests = {
            schemaVersion: 2,
            data: { mode: 'manual', manualCompletedQuestIds: ['winner-from-other-device'] },
            revision: 1,
            updatedAt: 'now',
        };

        await runPostSignInSync();

        expect(questsStore.get()).toEqual({
            mode: 'manual',
            manualCompletedQuestIds: ['winner-from-other-device'],
        });
        for (const store of allStores) {
            expect(store.backendKind).toBe('remote');
        }
    });

    // -----------------------------------------------------------------
    // Sign-out wipe
    // -----------------------------------------------------------------
    it('clears new rt_state_* keys, legacy keys, and resets in-memory values', async () => {
        // Pretend we're signed in with remote stores populated.
        await questsStore.setBackend('remote');
        await lootStore.setBackend('remote');
        await quartermasterStore.setBackend('remote');
        await questsStore.setAuthoritative({ mode: 'manual', manualCompletedQuestIds: ['signed-in'] }, 2);

        // Legacy keys left over from before phase 2 — these must be wiped too.
        localStorage.setItem('arcraiders-quest-progress-reactflow', '["legacy-q"]');
        localStorage.setItem('quartermaster_lists', '[]');
        localStorage.setItem('what-to-loot-goal-items', '["legacy"]');

        await runSignOutWipe();

        // Stores swapped back to local, values back to defaults.
        for (const store of allStores) {
            expect(store.backendKind).toBe('local');
        }
        expect(questsStore.get()).toEqual({ mode: 'manual', manualCompletedQuestIds: [] });
        expect(lootStore.get().goalItems).toEqual([]);
        expect(quartermasterStore.get().lists).toEqual([]);

        // Local keys — both current and legacy — are gone.
        expect(localStorage.getItem('rt_state_quests')).toBeNull();
        expect(localStorage.getItem('rt_state_loot')).toBeNull();
        expect(localStorage.getItem('rt_state_quartermaster')).toBeNull();
        expect(localStorage.getItem('arcraiders-quest-progress-reactflow')).toBeNull();
        expect(localStorage.getItem('quartermaster_lists')).toBeNull();
        expect(localStorage.getItem('what-to-loot-goal-items')).toBeNull();
    });
});
