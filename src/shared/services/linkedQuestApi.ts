import { getCurrentSession, getIdToken } from '../auth/cognitoClient';
import { notifyArctrackerLinkInvalid } from '../auth/arctrackerLinkEvents';
import { migrateQuestId } from '../../apps/quests/data/questIdMigration';
import type {
  LinkedQuestEntry,
  LinkedQuestSnapshot,
} from '../types/linkedQuests';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'https://api.raider-tools.app';
const CACHE_KEY = 'rt_linked_quests_snapshot';

interface LinkedQuestCacheRecord {
  userSub: string;
  snapshot: LinkedQuestSnapshot;
}

interface ArctrackerQuestResponse {
  data: {
    quests: Array<{
      id: string;
      completed: boolean;
    }>;
  };
}

interface EmbarkQuestResponse extends LinkedQuestSnapshot {
  source: 'embark';
}

interface ErrorBody {
  error?: string;
  nextAllowedAt?: string;
}

export class LinkedQuestApiError extends Error {
  readonly status?: number;
  readonly nextAllowedAt?: string | null;
  readonly snapshot?: LinkedQuestSnapshot | null;

  constructor(
    message: string,
    status?: number,
    options: {
      nextAllowedAt?: string | null;
      snapshot?: LinkedQuestSnapshot | null;
    } = {},
  ) {
    super(message);
    this.name = 'LinkedQuestApiError';
    this.status = status;
    this.nextAllowedAt = options.nextAllowedAt;
    this.snapshot = options.snapshot;
  }
}

export async function getCachedLinkedQuestSnapshot(): Promise<LinkedQuestSnapshot | null> {
  const session = await getCurrentSession();
  return readCachedSnapshotForUser(session?.sub ?? null);
}

export async function clearLinkedQuestCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CACHE_KEY);
}

export function readCachedSnapshotForUser(userSub: string | null): LinkedQuestSnapshot | null {
  if (typeof window === 'undefined' || !userSub) return null;

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkedQuestCacheRecord;
    if (parsed.userSub !== userSub) return null;
    return parsed.snapshot ?? null;
  } catch {
    return null;
  }
}

export function buildEmbarkThrottledSnapshot(
  snapshot: LinkedQuestSnapshot | null,
  nextAllowedAt: string | null,
): LinkedQuestSnapshot | null {
  const nowIso = new Date().toISOString();
  if (snapshot && snapshot.source !== 'embark') return null;
  return {
    source: 'embark',
    syncedAt: snapshot?.source === 'embark' ? snapshot.syncedAt : nowIso,
    cachedAt: snapshot?.source === 'embark' ? snapshot.cachedAt : Date.now(),
    questsById: snapshot?.source === 'embark' ? snapshot.questsById : {},
    ...(snapshot?.source === 'embark'
      ? {
          etag: snapshot.etag,
          lastModified: snapshot.lastModified,
        }
      : {}),
    nextAllowedAt,
    lastCheckedAt: nowIso,
  };
}

export function normalizeArctrackerQuestSnapshot(
  payload: ArctrackerQuestResponse,
  headers: Headers,
): LinkedQuestSnapshot {
  const nowIso = new Date().toISOString();
  const lastModified = headers.get('Last-Modified');
  const etag = headers.get('ETag');
  const questsById: Record<string, LinkedQuestEntry> = {};

  for (const quest of payload.data.quests ?? []) {
    questsById[migrateQuestId(quest.id)] = {
      state: quest.completed ? 'completed' : 'unknown',
      completed: quest.completed,
    };
  }

  return {
    source: 'arctracker',
    syncedAt: nowIso,
    cachedAt: Date.now(),
    etag,
    lastModified,
    lastCheckedAt: nowIso,
    nextAllowedAt: null,
    questsById,
  };
}

export async function syncArctrackerQuestSnapshot(
  previous: LinkedQuestSnapshot | null,
): Promise<LinkedQuestSnapshot> {
  const session = await getCurrentSession();
  const userSub = session?.sub ?? null;
  if (!userSub) throw new LinkedQuestApiError('No authentication token available', 401);

  const headers = new Headers({ Accept: 'application/json' });
  if (previous?.source === 'arctracker' && previous.etag) {
    headers.set('If-None-Match', previous.etag);
  }
  if (previous?.source === 'arctracker' && previous.lastModified) {
    headers.set('If-Modified-Since', previous.lastModified);
  }

  const response = await authedFetch('/me/arctracker/v2/user/quests', { headers });
  if (response.status === 304 && previous?.source === 'arctracker') {
    const snapshot: LinkedQuestSnapshot = {
      ...previous,
      lastCheckedAt: new Date().toISOString(),
    };
    writeCachedSnapshot(userSub, snapshot);
    return snapshot;
  }

  if (response.status === 401 || response.status === 403) {
    notifyArctrackerLinkInvalid();
    throw await buildError(response);
  }

  if (!response.ok) {
    throw await buildError(response);
  }

  const payload = await response.json() as ArctrackerQuestResponse;
  const snapshot = normalizeArctrackerQuestSnapshot(payload, response.headers);
  writeCachedSnapshot(userSub, snapshot);
  return snapshot;
}

export async function getEmbarkQuestSnapshot(): Promise<LinkedQuestSnapshot | null> {
  const session = await getCurrentSession();
  const userSub = session?.sub ?? null;
  if (!userSub) throw new LinkedQuestApiError('No authentication token available', 401);

  const response = await authedFetch('/me/embark/quests');
  if (response.status === 404) return null;
  if (!response.ok) throw await buildError(response);

  const snapshot = await response.json();
  if (!isEmbarkSnapshot(snapshot)) {
    throw new LinkedQuestApiError('Invalid embark quest snapshot payload', 500);
  }
  const normalized = {
    ...snapshot,
    lastCheckedAt: new Date().toISOString(),
  } satisfies LinkedQuestSnapshot;
  writeCachedSnapshot(userSub, normalized);
  return normalized;
}

export async function syncEmbarkQuestSnapshot(
  previous: LinkedQuestSnapshot | null,
): Promise<LinkedQuestSnapshot> {
  const session = await getCurrentSession();
  const userSub = session?.sub ?? null;
  if (!userSub) throw new LinkedQuestApiError('No authentication token available', 401);

  const response = await authedFetch('/me/embark/quests/sync', { method: 'POST' });
  if (response.status === 429) {
    const error = await buildError(response);
    const snapshot = buildEmbarkThrottledSnapshot(previous, error.nextAllowedAt ?? null);
    if (snapshot) {
      writeCachedSnapshot(userSub, snapshot);
    }
    throw new LinkedQuestApiError(error.message, error.status, {
      nextAllowedAt: error.nextAllowedAt ?? null,
      snapshot,
    });
  }
  if (!response.ok) throw await buildError(response);

  const snapshot = await response.json();
  if (!isEmbarkSnapshot(snapshot)) {
    throw new LinkedQuestApiError('Invalid embark quest snapshot payload', 500);
  }
  const normalized = {
    ...snapshot,
    lastCheckedAt: new Date().toISOString(),
    nextAllowedAt: null,
  } satisfies LinkedQuestSnapshot;
  writeCachedSnapshot(userSub, normalized);
  return normalized;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new LinkedQuestApiError('No authentication token available', 401);

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
}

async function buildError(response: Response): Promise<LinkedQuestApiError> {
  let message = `${response.status} ${response.statusText}`;
  let nextAllowedAt: string | null = null;

  try {
    const body = await response.json() as ErrorBody;
    if (body.error) message = body.error;
    if (body.nextAllowedAt) nextAllowedAt = body.nextAllowedAt;
  } catch {
    // Ignore invalid error payloads.
  }

  return new LinkedQuestApiError(message, response.status, { nextAllowedAt });
}

function writeCachedSnapshot(userSub: string, snapshot: LinkedQuestSnapshot): void {
  if (typeof window === 'undefined') return;

  const record: LinkedQuestCacheRecord = { userSub, snapshot };
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(record));
}

function isEmbarkSnapshot(value: unknown): value is EmbarkQuestResponse {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<EmbarkQuestResponse>;
  return snapshot.source === 'embark'
    && typeof snapshot.syncedAt === 'string'
    && typeof snapshot.cachedAt === 'number'
    && !!snapshot.questsById
    && typeof snapshot.questsById === 'object'
    && !Array.isArray(snapshot.questsById);
}
