/**
 * Sign-in hydration orchestrator.
 *
 * Runs once per sign-in session in `CognitoAuthContext`:
 *
 *  1. Hydrate all stores from `localStorage` synchronously so the UI has
 *     something to render (done at app boot, before sign-in, too).
 *  2. On sign-in success (Cognito session present):
 *     a. Ask `/me` for the `dataMigrationCompleted` flag.
 *     b. If false and local has data → `POST /me/migrate` with the
 *        union of all three domains. On 200, clear local, swap all stores
 *        to the remote backend, done.
 *     c. Otherwise (flag already true, or 409 from b): swap stores to
 *        remote backend, call `hydrate()` to pull each domain from the
 *        server, overwrite local cache. Missing domains on the server
 *        reset to the default value.
 *  3. On sign-out:
 *     a. Flush any pending remote writes.
 *     b. Swap all stores back to the local backend.
 *     c. Clear local `rt_state_*` keys + reset in-memory values.
 *     d. Also clear the legacy localStorage keys used by the apps before
 *        phase 2, so a signed-out user starts from a clean slate.
 */

import { getIdToken } from '../auth/cognitoClient';
import {
    allStores,
    questsStore,
    lootStore,
    quartermasterStore,
} from './stores';
import { RemoteFetchError } from './userStateStore';
import { cacheClear, setCacheOwner } from '../services/cacheService';
import { clearLinkedQuestCache } from '../services/linkedQuestApi';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    'https://api.raider-tools.app';

/** Legacy `localStorage` keys from before phase 2 — wiped on sign-out. */
const LEGACY_KEYS = [
    // quests
    'arcraiders-quest-progress-reactflow',
    // loot-helper
    'what-to-loot-goal-items',
    'what-to-loot-disabled-items',
    'what-to-loot-stash-items',
    'what-to-loot-disabled-stash-items',
    'what-to-loot-enabled-types',
    'what-to-loot-enabled-rarities',
    'what-to-loot-enabled-locations',
    // quartermaster
    'quartermaster_lists',
    'quartermaster_hideout_toggles',
];

interface MeResponseShape {
    sub: string;
    dataMigrationCompleted: boolean;
}

/**
 * Hydrate every store from its current (local) backend. Called at boot
 * before any sign-in check.
 */
export async function hydrateAllLocal(): Promise<void> {
    await Promise.all(allStores.map(s => s.hydrate()));
}

/**
 * Run the post-sign-in flow. Returns once all stores are backed by and
 * synced with the server.
 */
export async function runPostSignInSync(): Promise<void> {
    // 1. Read the migration flag.
    const me = await fetchMe();
    const needsMigration = !me.dataMigrationCompleted && anyLocalDataPresent();

    if (needsMigration) {
        const migrated = await tryMigrateLocalToServer();
        if (migrated) {
            await swapAllToRemote();
            // Hydrate so every store picks up its fresh server-assigned
            // revision (1); otherwise the next local edit would write
            // without a revision and trigger an unnecessary conflict.
            await pullAllFromServer();
            return;
        }
        // Fell through — another device beat us. Fall into server-wins.
    }

    // 2. Server wins: swap to remote backend, download each domain,
    //    overwrite local cache.
    await swapAllToRemote();
    await pullAllFromServer();
}

/**
 * Flush, swap to local, and wipe every domain's local state. Called from
 * `CognitoAuthContext.signOut()` before the Cognito tokens themselves are
 * cleared.
 */
export async function runSignOutWipe(): Promise<void> {
    // Flush any pending remote writes first so we don't race with the
    // token being cleared.
    for (const store of allStores) {
        try { await store.flush(); } catch { /* best effort */ }
    }
    // Swap back to local so future writes go somewhere sane.
    for (const store of allStores) await store.setBackend('local');
    // Wipe both the new keys and the legacy ones.
    for (const store of allStores) await store.clearAll();
    for (const key of LEGACY_KEYS) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
    try { await cacheClear(); } catch { /* best effort */ }
    try { await setCacheOwner(null); } catch { /* best effort */ }
    try { await clearLinkedQuestCache(); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
async function fetchMe(): Promise<MeResponseShape> {
    const token = await getIdToken();
    if (!token) throw new RemoteFetchError('read', 'Not signed in', 401);
    let resp: Response;
    try {
        resp = await fetch(`${API_BASE}/me`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
    } catch (err) {
        throw new RemoteFetchError(
            'read',
            `GET /me failed to reach server: ${(err as Error)?.message ?? 'unknown'}`,
            undefined,
            err,
        );
    }
    if (!resp.ok) {
        throw new RemoteFetchError('read', `GET /me returned HTTP ${resp.status}`, resp.status);
    }
    return resp.json() as Promise<MeResponseShape>;
}

function anyLocalDataPresent(): boolean {
    const q = questsStore.get();
    const l = lootStore.get();
    const qm = quartermasterStore.get();

    const hasQuests = q.mode !== 'manual' || q.manualCompletedQuestIds.length > 0;
    const hasLoot = (l.goalItems.length + l.disabledItems.length + l.stashItems.length
        + l.disabledStashItems.length) > 0
        || (l.enabledTypes !== null && l.enabledTypes.length > 0)
        || (l.enabledRarities !== null && l.enabledRarities.length > 0)
        || (l.enabledLocations !== null && l.enabledLocations.length > 0);
    const hasQm = qm.lists.length > 0
        || Object.keys(qm.hideoutToggles.listEnabled).length > 0
        || Object.keys(qm.hideoutToggles.itemEnabled).length > 0
        || Object.keys(qm.projectToggles.listEnabled).length > 0
        || Object.keys(qm.projectToggles.itemEnabled).length > 0
        || Object.keys(qm.questToggles.listEnabled).length > 0
        || Object.keys(qm.questToggles.itemEnabled).length > 0
        || qm.prioritizedItemIds.length > 0;

    return hasQuests || hasLoot || hasQm;
}

async function tryMigrateLocalToServer(): Promise<boolean> {
    const token = await getIdToken();
    if (!token) return false;

    const body: Record<string, { schemaVersion: number; data: unknown }> = {};
    const q = questsStore.get();
    if (q.mode !== 'manual' || q.manualCompletedQuestIds.length > 0) {
        body.quests = { schemaVersion: questsStore.schemaVersion, data: q };
    }
    const l = lootStore.get();
    body.loot = { schemaVersion: lootStore.schemaVersion, data: l };
    const qm = quartermasterStore.get();
    body.quartermaster = { schemaVersion: quartermasterStore.schemaVersion, data: qm };

    let resp: Response;
    try {
        resp = await fetch(`${API_BASE}/me/migrate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        throw new RemoteFetchError(
            'write',
            `POST /me/migrate failed to reach server: ${(err as Error)?.message ?? 'unknown'}`,
            undefined,
            err,
        );
    }
    if (resp.status === 200) return true;
    if (resp.status === 409) return false; // another device migrated first
    throw new RemoteFetchError('write', `POST /me/migrate returned HTTP ${resp.status}`, resp.status);
}

async function swapAllToRemote(): Promise<void> {
    for (const store of allStores) await store.setBackend('remote');
}

async function pullAllFromServer(): Promise<void> {
    // On the remote backend, hydrate() hits GET /me/state/{domain} and
    // replaces the in-memory snapshot. Missing domains leave the store at
    // its default value. We intentionally do NOT mirror server content
    // into local storage; local wipe on sign-out must remain total.
    for (const store of allStores) await store.hydrate();
}

export { LEGACY_KEYS };
