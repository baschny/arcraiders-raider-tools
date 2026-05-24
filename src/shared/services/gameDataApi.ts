import { getCurrentSession, getIdToken } from '../auth/cognitoClient';
import type {
  ApiError,
  CachedBlueprints,
  CachedHideout,
  CachedLoadout,
  CachedStash,
} from '../types/arctracker';
import {
  cacheSet,
  getCachedBlueprints,
  getCachedHideout,
  getCachedLoadout,
  getCachedStash,
  setCacheOwner,
  setCacheSource,
  updateCacheMeta,
} from './cacheService';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'https://api.raider-tools.app';

export type GameDataSource = 'arctracker' | 'embark';

export interface EmbarkInventoryDiagnostics {
  unknownGameAssetIds: number[];
  unknownItemInstances: Array<{
    gameAssetId: number;
    instanceId?: string;
    amount?: number;
    context: 'stash' | 'loadout' | 'blueprint' | 'hideout' | 'other';
  }>;
  mappingVersion: number;
}

export interface EmbarkInventorySnapshot {
  source: 'embark';
  syncedAt: string;
  cachedAt: number;
  manifestId: string;
  schemaVersion: 1;
  rawSnapshotId: string;
  stash: CachedStash;
  loadout: CachedLoadout;
  hideout: CachedHideout;
  blueprints: CachedBlueprints;
  diagnostics: EmbarkInventoryDiagnostics;
}

export interface QuartermasterGameDataCache {
  stash: CachedStash | undefined;
  loadout: CachedLoadout | undefined;
  hideout: CachedHideout | undefined;
  blueprints: CachedBlueprints | undefined;
}

function createApiError(message: string, status?: number, isRetryable = false): ApiError {
  return { message, status, isRetryable };
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw createApiError('No authentication token available', 401, false);
  const session = await getCurrentSession();
  await setCacheOwner(session?.sub ?? null);

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let error = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as {
        error?: string;
        retryAfterSeconds?: number;
        nextAllowedAt?: string;
      };
      if (body.error) error = body.error;
      if (typeof body.retryAfterSeconds === 'number') error = `${error}: retry after ${body.retryAfterSeconds}s`;
      if (body.nextAllowedAt) {
        error = `${error}: ${body.nextAllowedAt}`;
      }
    } catch { /* ignore */ }
    throw createApiError(error, response.status, response.status >= 500 || response.status === 429);
  }
  return response.json() as Promise<T>;
}

export async function syncEmbarkInventory(): Promise<EmbarkInventorySnapshot> {
  await setCacheSource('embark');
  const snapshot = await readJson<EmbarkInventorySnapshot>(
    await authedFetch('/me/embark/inventory/sync', { method: 'POST' }),
  );
  await persistEmbarkSnapshot(snapshot);
  return snapshot;
}

export async function getEmbarkInventory(): Promise<EmbarkInventorySnapshot | null> {
  await setCacheSource('embark');
  const response = await authedFetch('/me/embark/inventory');
  if (response.status === 404) return null;
  const snapshot = await readJson<EmbarkInventorySnapshot>(response);
  await persistEmbarkSnapshot(snapshot);
  return snapshot;
}

export async function getQuartermasterGameDataCache(
  source: GameDataSource,
): Promise<QuartermasterGameDataCache> {
  const session = await getCurrentSession();
  await setCacheOwner(session?.sub ?? null);
  await setCacheSource(source);
  return {
    stash: await getCachedStash(),
    loadout: await getCachedLoadout(),
    hideout: await getCachedHideout(),
    blueprints: await getCachedBlueprints(),
  };
}

async function persistEmbarkSnapshot(snapshot: EmbarkInventorySnapshot): Promise<void> {
  const stash: CachedStash = { ...snapshot.stash, source: 'embark' };
  const loadout: CachedLoadout = { ...snapshot.loadout, source: 'embark' };
  const hideout: CachedHideout = { ...snapshot.hideout, source: 'embark' };
  const blueprints: CachedBlueprints = { ...snapshot.blueprints, source: 'embark' };

  await cacheSet('stash', stash);
  await cacheSet('loadout', loadout);
  await cacheSet('hideout', hideout);
  await cacheSet('blueprints', blueprints);
  await updateCacheMeta({
    lastSyncedAt: Date.now(),
    source: 'embark',
    embarkInventorySyncedAt: snapshot.syncedAt,
    embarkUnknownGameAssetIds: snapshot.diagnostics.unknownGameAssetIds,
  });
}
