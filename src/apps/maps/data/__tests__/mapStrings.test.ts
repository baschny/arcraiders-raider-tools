import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapNames, mapString, mapStringLocales, NO_STRINGS } from '../mapStrings';
import { loadMapStrings } from '../useMapStrings';
import type { MapIndex } from '../types';

describe('mapStringLocales', () => {
  it('follows the site fallback chain without English', () => {
    expect(mapStringLocales('de')).toEqual(['de']);
    expect(mapStringLocales('pt-BR')).toEqual(['pt-BR', 'pt']);
    expect(mapStringLocales('zh-TW')).toEqual(['zh-TW']);
  });

  it('needs no file for English', () => {
    expect(mapStringLocales('en')).toEqual([]);
  });
});

describe('mapString', () => {
  const strings = { 'ST_Enemy/ID_ENEMY_WASP_NAME': 'Wespe', 'ST_Location/EMPTY': '' };

  it('translates a known key', () => {
    expect(mapString(strings, 'ST_Enemy/ID_ENEMY_WASP_NAME', 'Wasp')).toBe('Wespe');
  });

  it('falls back to English for a missing key, an empty translation or no key', () => {
    expect(mapString(strings, 'ST_Enemy/ID_ENEMY_HORNET_NAME', 'Hornet')).toBe('Hornet');
    expect(mapString(strings, 'ST_Location/EMPTY', 'Reinforced Bus')).toBe('Reinforced Bus');
    expect(mapString(strings, undefined, 'Normal')).toBe('Normal');
    expect(mapString(NO_STRINGS, 'ST_Enemy/ID_ENEMY_WASP_NAME', 'Wasp')).toBe('Wasp');
  });
});

describe('mapNames', () => {
  const index = {
    enemies: [{ key: 'DA_EnemyType_Wasp', name: 'Wasp', nameKey: 'ST_Enemy/WASP', fly: true }, { key: 'DA_EnemyType_X', name: 'X', fly: false }],
    conditions: [
      { key: 'NightRaid', name: 'Night Raid', nameKey: 'ST_MapCondition/NIGHTRAID', category: 'major' },
      { key: 'Default', name: 'Normal', category: 'normal' },
    ],
  } as unknown as MapIndex;
  const names = mapNames(index, { 'ST_Enemy/WASP': 'Wespe', 'ST_MapCondition/NIGHTRAID': 'Nacht-Raid', 'ST_Location/A': 'Alte Stadt' });

  it('translates maps, areas, POIs and enemies by their keys', () => {
    expect(names.of({ name: 'Old Town', nameKey: 'ST_Location/A' })).toBe('Alte Stadt');
    expect(names.poi({ title: 'Old Town', titleKey: 'ST_Location/A' })).toBe('Alte Stadt');
    expect(names.enemy(0)).toBe('Wespe');
    expect(names.enemy(1)).toBe('X');
    expect(names.enemy(7)).toBe('?');
  });

  it('translates conditions referenced by English name', () => {
    expect(names.condition('Night Raid')).toBe('Nacht-Raid');
    expect(names.condition('Normal')).toBe('Normal');
    expect(names.condition('Unknown')).toBe('Unknown');
  });

  it('translates names without a game string with the UI names', () => {
    const ui = mapNames(index, {}, { Normal: 'Normal (de)' });
    expect(ui.condition('Normal')).toBe('Normal (de)');
    expect(ui.of({ name: 'Normal' })).toBe('Normal (de)');
    expect(ui.of({ name: 'Normal', nameKey: 'ST_Location/A' })).toBe('Normal');
    expect(ui.condition('Night Raid')).toBe('Night Raid');
  });

  it('keeps English names for builds without a condition list', () => {
    const old = mapNames({ ...index, conditions: undefined }, { 'ST_MapCondition/NIGHTRAID': 'Nacht-Raid' });
    expect(old.condition('Night Raid')).toBe('Night Raid');
  });
});

describe('loadMapStrings', () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (files: Record<string, unknown>) => {
    const fetchMock = vi.fn(async (url: string) => {
      const name = url.split('/').pop()!;
      if (!(name in files)) return new Response('not found', { status: 404 });
      const body = files[name];
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('loads the locale file', async () => {
    serve({ 'map-strings.de.json': { k: 'de' } });
    expect(await loadMapStrings('de')).toEqual({ k: 'de' });
  });

  it('falls back from pt-BR to pt', async () => {
    const fetchMock = serve({ 'map-strings.pt.json': { k: 'pt' } });
    expect(await loadMapStrings('pt-BR')).toEqual({ k: 'pt' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/data/map-data/map-strings.pt-BR.json', '/data/map-data/map-strings.pt.json']);
  });

  it('falls back to English names when no file loads (missing, or the SPA page instead of JSON)', async () => {
    serve({ 'map-strings.ko-KR.json': '<!doctype html><html></html>' });
    expect(await loadMapStrings('ko-KR')).toBe(NO_STRINGS);
  });

  it('fetches nothing for English', async () => {
    const fetchMock = serve({});
    expect(await loadMapStrings('en')).toBe(NO_STRINGS);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
