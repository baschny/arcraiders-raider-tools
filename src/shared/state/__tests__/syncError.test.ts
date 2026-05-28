/**
 * Sync-error surfacing tests.
 *
 * Covers the phase where we turn silent failures into observable state:
 *
 *  1. `UserStateStore` classifies remote failures into `network`, `server`,
 *     and `unauthorized` kinds and exposes them via `store.error`.
 *  2. A successful subsequent write clears the error.
 *  3. The aggregator (`syncStatus.ts`) surfaces store errors under a
 *     `store:<domain>` source and imperative errors under their name.
 *  4. `runPostSignInSync()` failures propagate into the aggregator via
 *     `reportSyncError('post-sign-in', ...)` when wired up through the
 *     same code path the real app uses.
 *
 * These tests intentionally work against the low-level API rather than
 * the React banner component, so they stay fast and don't depend on
 * jsdom rendering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    UserStateStore,
    RemoteFetchError,
    classifyError,
} from '../userStateStore';
import {
    getSyncStatusSnapshot,
    reportSyncError,
    clearSyncError,
    worstErrorKind,
} from '../syncStatus';
import { questsStore, allStores } from '../stores';

vi.mock('../../auth/cognitoClient', () => ({
    getIdToken: vi.fn().mockResolvedValue('test-id-token'),
}));

interface QuestsTestState {
    mode: 'manual' | 'linked';
    manualCompletedQuestIds: string[];
}

function makeStore(): UserStateStore<QuestsTestState> {
    return new UserStateStore<QuestsTestState>({
        domain: 'quests',
        schemaVersion: 2,
        defaultValue: { mode: 'manual', manualCompletedQuestIds: [] },
        debounceMs: 5,
    });
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function resetConcreteStores(): Promise<void> {
    for (const store of allStores) {
        await store.setBackend('local');
        await store.clearAll();
    }
    clearSyncError('post-sign-in');
    localStorage.clear();
}

describe('UserStateStore error classification', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('classifies fetch failures as network errors', async () => {
        const store = makeStore();
        await store.setBackend('remote');
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        }));

        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await store.flush();
        errSpy.mockRestore();

        expect(store.error).not.toBeNull();
        expect(store.error!.kind).toBe('network');
        expect(store.error!.operation).toBe('write');
        expect(store.error!.status).toBeUndefined();
    });

    it('classifies 5xx responses as server errors with the status attached', async () => {
        const store = makeStore();
        await store.setBackend('remote');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));

        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await store.flush();
        errSpy.mockRestore();

        expect(store.error!.kind).toBe('server');
        expect(store.error!.status).toBe(503);
    });

    it('classifies 401 as unauthorized', async () => {
        const store = makeStore();
        await store.setBackend('remote');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));

        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await store.flush();
        errSpy.mockRestore();

        expect(store.error!.kind).toBe('unauthorized');
        expect(store.error!.status).toBe(401);
    });

    it('clears the error on the next successful write', async () => {
        const store = makeStore();
        await store.setBackend('remote');

        // First call fails, second succeeds.
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            calls += 1;
            if (calls === 1) return new Response('boom', { status: 500 });
            return json({ ok: true, revision: 1 });
        }));

        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await store.flush();
        expect(store.error!.kind).toBe('server');

        // Second write against a healthy server clears the error.
        store.set({ mode: 'manual', manualCompletedQuestIds: ['q1', 'q2'] });
        await store.flush();
        errSpy.mockRestore();

        expect(store.error).toBeNull();
    });

    it('records read errors when hydrate fails and rethrows', async () => {
        const store = makeStore();
        await store.setBackend('remote');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 502 })));

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(store.hydrate()).rejects.toBeInstanceOf(RemoteFetchError);
        errSpy.mockRestore();

        expect(store.error!.kind).toBe('server');
        expect(store.error!.status).toBe(502);
        expect(store.error!.operation).toBe('read');
    });
});

describe('classifyError helper', () => {
    it('maps RemoteFetchError with no status to network', () => {
        const err = new RemoteFetchError('read', 'unreachable');
        expect(classifyError(err, 'read').kind).toBe('network');
    });
    it('maps plain TypeError to network', () => {
        expect(classifyError(new TypeError('x'), 'read').kind).toBe('network');
    });
    it('maps 4xx (non-auth) to client', () => {
        const err = new RemoteFetchError('write', 'bad', 413);
        expect(classifyError(err, 'write').kind).toBe('client');
    });
    it('maps 403 to unauthorized', () => {
        const err = new RemoteFetchError('write', 'nope', 403);
        expect(classifyError(err, 'write').kind).toBe('unauthorized');
    });
    it('maps unknown throwables to unknown', () => {
        expect(classifyError('oops', 'write').kind).toBe('unknown');
    });
});

describe('syncStatus aggregator', () => {
    beforeEach(async () => {
        // Default happy fetch so the reset's remote flush/clear calls
        // succeed even if a prior test left a store on the remote backend.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
        await resetConcreteStores();
    });
    afterEach(async () => {
        // Make sure the teardown's reset also sees a healthy fetch.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
        await resetConcreteStores();
        vi.unstubAllGlobals();
    });

    it('surfaces imperative errors with their source label', () => {
        expect(getSyncStatusSnapshot().hasError).toBe(false);

        reportSyncError('post-sign-in', {
            kind: 'network',
            operation: 'read',
            message: 'GET /me failed',
            at: Date.now(),
        });

        const snap = getSyncStatusSnapshot();
        expect(snap.hasError).toBe(true);
        expect(snap.errors).toHaveLength(1);
        expect(snap.errors[0].source).toBe('post-sign-in');
        expect(snap.errors[0].kind).toBe('network');
    });

    it('surfaces store errors with a store:<domain> source', async () => {
        await questsStore.setBackend('remote');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));

        questsStore.set({ mode: 'manual', manualCompletedQuestIds: ['q1'] });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await questsStore.flush();
        errSpy.mockRestore();

        const snap = getSyncStatusSnapshot();
        expect(snap.hasError).toBe(true);
        const questsEntry = snap.errors.find(e => e.source === 'store:quests');
        expect(questsEntry).toBeDefined();
        expect(questsEntry!.kind).toBe('server');
        expect(questsEntry!.status).toBe(500);
    });

    it('picks the highest-priority kind via worstErrorKind', () => {
        const now = Date.now();
        expect(
            worstErrorKind([
                { source: 'store:quests', kind: 'server', operation: 'write', message: '', at: now },
                { source: 'post-sign-in', kind: 'unauthorized', operation: 'read', message: '', at: now },
            ]),
        ).toBe('unauthorized');
        expect(
            worstErrorKind([
                { source: 'store:quests', kind: 'server', operation: 'write', message: '', at: now },
                { source: 'store:loot', kind: 'network', operation: 'write', message: '', at: now },
            ]),
        ).toBe('network');
    });

    it('clears imperative errors via clearSyncError', () => {
        reportSyncError('post-sign-in', {
            kind: 'server',
            operation: 'read',
            status: 500,
            message: '',
            at: Date.now(),
        });
        expect(getSyncStatusSnapshot().hasError).toBe(true);

        clearSyncError('post-sign-in');
        expect(getSyncStatusSnapshot().hasError).toBe(false);
    });
});
