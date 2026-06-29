import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARCTRACKER_SYNC_REQUIRED_ERROR_MESSAGE,
  syncLoadout,
  syncStashAllPages,
} from '../arctrackerApi';
import { cacheSet } from '../cacheService';

vi.mock('../../auth/cognitoClient', () => ({
  getCurrentSession: vi.fn().mockResolvedValue({ sub: 'user-sub-1' }),
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('../../auth/arctrackerLinkEvents', () => ({
  notifyArctrackerLinkInvalid: vi.fn(),
}));

vi.mock('../cacheService', () => ({
  cacheSet: vi.fn().mockResolvedValue(undefined),
  getCachedProfile: vi.fn(),
  getCachedStash: vi.fn(),
  getCachedLoadout: vi.fn(),
  getCachedHideout: vi.fn(),
  getCachedBlueprints: vi.fn(),
  getCachedProjects: vi.fn(),
  updateCacheMeta: vi.fn().mockResolvedValue(undefined),
  setCacheOwner: vi.fn().mockResolvedValue(undefined),
  setCacheSource: vi.fn().mockResolvedValue(undefined),
}));

function installTestLocalStorage(): void {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

describe('arctrackerApi', () => {
  beforeEach(() => {
    vi.mocked(cacheSet).mockClear();
    installTestLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects stash responses that have not been synced in ArcTracker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        items: [],
        currencies: { credits: 0, cred: 0, raiderTokens: 0, xp: 0 },
        slots: { used: 0, max: 160 },
        pagination: { page: 1, perPage: 500, total: 0, totalPages: 0 },
        syncedAt: null,
      },
      meta: { requestId: 'stash-missing' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(syncStashAllPages()).rejects.toMatchObject({
      message: ARCTRACKER_SYNC_REQUIRED_ERROR_MESSAGE,
      status: 409,
      isRetryable: false,
    });
    expect(cacheSet).not.toHaveBeenCalledWith('stash', expect.anything());
  });

  it('rejects loadout responses that have not been synced in ArcTracker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        loadout: null,
        syncedAt: null,
      },
      meta: { requestId: 'loadout-missing' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(syncLoadout()).rejects.toMatchObject({
      message: ARCTRACKER_SYNC_REQUIRED_ERROR_MESSAGE,
      status: 409,
      isRetryable: false,
    });
    expect(cacheSet).not.toHaveBeenCalledWith('loadout', expect.anything());
  });
});
