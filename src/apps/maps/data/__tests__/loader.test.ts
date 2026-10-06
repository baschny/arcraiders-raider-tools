import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAP_SCHEMA_VERSION } from '../schema';
import { loadIndex, loadMap, MapLoadError, reloadMapData } from '../useMapData';
import { TINY_INDEX } from './fixtures/tinyMap';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mockFetch = (...responses: (Response | Error)[]) => {
  const fn = vi.fn();
  for (const r of responses) fn.mockImplementationOnce(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)));
  vi.stubGlobal('fetch', fn);
  return fn;
};
const kind = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof MapLoadError ? e.kind : `other: ${String(e)}`));

describe('loadIndex', () => {
  afterEach(() => {
    reloadMapData();
    vi.unstubAllGlobals();
  });

  it('classifies failures', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    expect(await kind(loadIndex())).toBe('network');
    mockFetch(json({}, 500));
    expect(await kind(loadIndex())).toBe('network');
    mockFetch(json({}, 404));
    expect(await kind(loadIndex())).toBe('missing');
    // SPA fallback: index.html with status 200.
    mockFetch(new Response('<!doctype html>', { status: 200 }));
    expect(await kind(loadIndex())).toBe('missing');
    mockFetch(json({ ...TINY_INDEX, schemaVersion: MAP_SCHEMA_VERSION + 1 }));
    expect(await kind(loadIndex())).toBe('schema');
  });

  it('fetches again after a failure, and caches a success', async () => {
    const fetch = mockFetch(new TypeError('offline'), json(TINY_INDEX));
    expect(await kind(loadIndex())).toBe('network');
    expect(await loadIndex()).toEqual(TINY_INDEX);
    await loadIndex();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('revalidates after a reload', async () => {
    const fetch = mockFetch(json(TINY_INDEX));
    reloadMapData();
    await loadIndex();
    expect(fetch).toHaveBeenCalledWith('/data/map-data/index.json', { cache: 'no-cache' });
  });
});

describe('loadMap', () => {
  afterEach(() => {
    reloadMapData();
    vi.unstubAllGlobals();
  });

  const index = { ...TINY_INDEX, maps: [{ map: 'A', name: 'A', difficulty: 1, file: 'maps/A.json', image: { tiles: 't', size: 1, levels: 1 } }] };

  it('reports a missing map file with its map key, and retries it next time', async () => {
    const fetch = mockFetch(json({}, 404), json({ map: 'A' }));
    const err = await loadMap(index, 'A').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MapLoadError);
    expect(err).toMatchObject({ kind: 'missing', map: 'A' });
    expect(await loadMap(index, 'A')).toEqual({ map: 'A' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects maps the index does not list', async () => {
    expect(await kind(loadMap(index, 'B'))).toBe('missing');
  });
});
