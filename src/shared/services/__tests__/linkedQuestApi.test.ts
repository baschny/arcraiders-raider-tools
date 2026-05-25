import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEmbarkThrottledSnapshot,
  normalizeArctrackerQuestSnapshot,
  syncArctrackerQuestSnapshot,
} from '../linkedQuestApi';
import type { LinkedQuestSnapshot } from '../../types/linkedQuests';

vi.mock('../../auth/cognitoClient', () => ({
  getCurrentSession: vi.fn().mockResolvedValue({ sub: 'user-sub-1' }),
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('../../auth/arctrackerLinkEvents', () => ({
  notifyArctrackerLinkInvalid: vi.fn(),
}));

describe('linkedQuestApi', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes ArcTracker quest responses with cache validators', () => {
    const headers = new Headers({
      ETag: '"quests-v1"',
      'Last-Modified': 'Mon, 25 May 2026 10:00:00 GMT',
    });
    const snapshot = normalizeArctrackerQuestSnapshot({
      data: {
        quests: [
          { id: 'cold_storage', completed: true },
          { id: 'in_my_image', completed: false },
        ],
      },
    }, headers, null);

    expect(snapshot.source).toBe('arctracker');
    expect(snapshot.etag).toBe('"quests-v1"');
    expect(snapshot.lastModified).toBe('Mon, 25 May 2026 10:00:00 GMT');
    expect(snapshot.questsById.cold_storage.completed).toBe(true);
    expect(snapshot.questsById.in_my_image.state).toBe('unknown');
  });

  it('sends If-None-Match and If-Modified-Since validators on sync', async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('If-None-Match')).toBe('"quests-v1"');
      expect(headers.get('If-Modified-Since')).toBe('Mon, 25 May 2026 10:00:00 GMT');
      return new Response(JSON.stringify({
        data: {
          quests: [
            { id: 'cold_storage', completed: true },
          ],
        },
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"quests-v2"',
          'Last-Modified': 'Tue, 26 May 2026 12:00:00 GMT',
        },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const previous: LinkedQuestSnapshot = {
      source: 'arctracker',
      syncedAt: 'Mon, 25 May 2026 10:00:00 GMT',
      cachedAt: 1,
      etag: '"quests-v1"',
      lastModified: 'Mon, 25 May 2026 10:00:00 GMT',
      questsById: {},
    };
    const snapshot = await syncArctrackerQuestSnapshot(previous);

    expect(snapshot.etag).toBe('"quests-v2"');
    expect(snapshot.lastModified).toBe('Tue, 26 May 2026 12:00:00 GMT');
    expect(snapshot.questsById.cold_storage.completed).toBe(true);
  });

  it('keeps the cached snapshot on 304 checks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 304 })));

    const previous: LinkedQuestSnapshot = {
      source: 'arctracker',
      syncedAt: 'Mon, 25 May 2026 10:00:00 GMT',
      cachedAt: 1,
      etag: '"quests-v1"',
      lastModified: 'Mon, 25 May 2026 10:00:00 GMT',
      questsById: {
        cold_storage: { state: 'completed', completed: true },
      },
    };
    const snapshot = await syncArctrackerQuestSnapshot(previous);

    expect(snapshot.questsById).toEqual(previous.questsById);
    expect(snapshot.syncedAt).toBe(previous.syncedAt);
    expect(snapshot.lastCheckedAt).toBeTruthy();
  });

  it('applies embark throttle metadata without losing cached progress', () => {
    const snapshot = buildEmbarkThrottledSnapshot({
      source: 'embark',
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      questsById: {
        cold_storage: { state: 'completed', completed: true },
      },
    }, '2026-05-25T11:00:00.000Z');

    expect(snapshot?.nextAllowedAt).toBe('2026-05-25T11:00:00.000Z');
    expect(snapshot?.questsById.cold_storage.completed).toBe(true);
  });
});
