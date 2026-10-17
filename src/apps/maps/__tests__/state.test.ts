import { afterEach, describe, expect, it, vi } from 'vitest';
import { TINY_INDEX, TINY_MAP } from '../data/__tests__/fixtures/tinyMap';
import type { ItemsMap } from '../../loot-helper/types/item';
import type { MapData, MapIndex } from '../data/types';
import { condIndex, DEFAULT_PREFS, defaultLayer, loadPrefs, mapPath, parseState, pathMap, PREFS_KEY, sanitizeState, serializeState, type MapState } from '../state';

const parse = (q: string, map?: string) => parseState(new URLSearchParams(q), map, 'dam-battleground');

describe('parseState', () => {
  it('falls back to the defaults', () => {
    expect(parse('')).toEqual({
      mode: 'loot', map: 'dam-battleground', cond: 'Default', setup: null, layer: null, item: null, show: new Set(), enemies: new Set(),
    });
  });

  it('reads the map of the path and every param', () => {
    expect(parse('mode=arc&cond=Night&setup=2&layer=1&item=lemon&show=t:Industrial.Lockers,Lemon&enemies=3,0', 'the-spaceport')).toEqual({
      mode: 'arc', map: 'the-spaceport', cond: 'Night', setup: 2, layer: 1, item: 'lemon', show: new Set(['t:Industrial.Lockers', 'Lemon']), enemies: new Set([3, 0]),
    });
  });

  it('treats unknown modes as Loot and ignores empty list entries', () => {
    const s = parse('mode=quests&show=,Lemon,,&enemies=,2,');
    expect(s.mode).toBe('loot');
    expect(s.show).toEqual(new Set(['Lemon']));
    expect(s.enemies).toEqual(new Set([2]));
  });

  it('ignores malformed layer and enemy values', () => {
    for (const layer of ['abc', '-1', '1.5', '', ' ']) expect(parse(`layer=${layer}`).layer).toBeNull();
    expect(parse('layer=0').layer).toBe(0);
    expect(parse('enemies=x,2,-1,1.5,NaN,0').enemies).toEqual(new Set([2, 0]));
  });

  it('reads the map param of old links when the path has no map', () => {
    expect(parse('map=Spaceport_01').map).toBe('Spaceport_01');
    expect(parse('map=Spaceport_01', 'blue-gate').map).toBe('blue-gate');
  });

  it('treats empty map, cond and item params as missing', () => {
    expect(parse('map=&cond=&item=', '')).toMatchObject({ map: 'dam-battleground', cond: 'Default', item: null });
  });
});

describe('pathMap', () => {
  it('reads the map slug of a page path', () => {
    expect(pathMap('/maps/pendola-pass')).toBe('pendola-pass');
    expect(pathMap('/de/maps/pendola-pass/')).toBe('pendola-pass');
    expect(pathMap('/maps')).toBeNull();
    expect(pathMap('/maps/')).toBeNull();
    expect(pathMap('/map-sizes')).toBeNull();
  });

  it('round-trips with mapPath', () => {
    expect(pathMap(mapPath('pendola-pass'))).toBe('pendola-pass');
  });
});

describe('sanitizeState', () => {
  const index: MapIndex = {
    ...TINY_INDEX,
    maps: [
      { map: 'TheDam_02', slug: 'dam-battleground', name: 'Dam Battlegrounds', difficulty: 1, file: 'maps/TheDam_02.json', image: TINY_MAP.image },
      { map: TINY_MAP.map, slug: 'tiny', name: TINY_MAP.name, difficulty: 2, file: `maps/${TINY_MAP.map}.json`, image: TINY_MAP.image },
    ],
  };
  const base: MapState = { ...parse(''), map: 'tiny' };
  const items = { lemon: {} } as unknown as ItemsMap;
  const fix = (s: Partial<MapState>, map: MapData | null = TINY_MAP, its: ItemsMap | null = items) => sanitizeState({ ...base, ...s }, index, map, its, 'dam-battleground');

  it('leaves valid state alone', () => {
    expect(fix({ cond: 'Night', item: 'lemon', enemies: new Set([0, 2]) })).toBeNull();
  });

  it('replaces an unknown map by the default map with its defaults', () => {
    expect(fix({ map: 'gone', cond: 'Night', layer: 1 }, null)).toEqual({ map: 'dam-battleground', cond: 'Default', layer: null, setup: null });
    const noDefault = { ...index, maps: index.maps.slice(1) };
    expect(sanitizeState({ ...base, map: 'gone' }, noDefault, null, null, 'dam-battleground')?.map).toBe('tiny');
  });

  it('replaces the level name of an old link by the slug of the same map', () => {
    expect(fix({ map: TINY_MAP.map, cond: 'Night', layer: 1 }, null)).toEqual({ map: 'tiny', cond: 'Night', layer: 1, setup: null });
  });

  it('drops conditions and layers the loaded map does not have', () => {
    expect(fix({ cond: 'Hurricane' })).toEqual({ cond: 'Default' });
    expect(fix({ layer: 0 })).toEqual({ layer: null });
    const layered: MapData = { ...TINY_MAP, layers: [{ name: 'L', image: TINY_MAP.image, sockets: 1 }] };
    expect(fix({ layer: 0 }, layered)).toBeNull();
    expect(fix({ layer: 1 }, layered)).toEqual({ layer: null });
    // Not checked before the map has loaded.
    expect(fix({ cond: 'Hurricane', layer: 3 }, null)).toBeNull();
  });

  it('drops a loot setup the loaded map does not have', () => {
    expect(fix({ setup: 1 })).toEqual({ setup: null });
    const setups: MapData = { ...TINY_MAP, lootSetups: [{ name: 'Setup_01', chance: 1, conditions: [0], zones: [] }] };
    expect(fix({ setup: 1 }, setups)).toBeNull();
    expect(fix({ setup: 2 }, setups)).toEqual({ setup: null });
  });

  it('drops unknown items once the items have loaded', () => {
    expect(fix({ item: 'gone' })).toEqual({ item: null });
    expect(fix({ item: 'gone' }, TINY_MAP, null)).toBeNull();
  });

  it('drops unknown enemies', () => {
    expect(fix({ enemies: new Set([1, 7]) })).toEqual({ enemies: new Set([1]) });
  });
});

describe('serializeState', () => {
  const state: MapState = {
    mode: 'loot', map: 'dam-battleground', cond: 'Default', setup: null, layer: null, item: null, show: new Set(), enemies: new Set(),
  };

  it('writes no params for the default state (the map is in the path)', () => {
    expect(serializeState(state).toString()).toBe('');
  });

  it('round-trips through parseState', () => {
    const full: MapState = {
      mode: 'arc', map: 'stella-montis', cond: 'Night', setup: 3, layer: 0, item: 'wires', show: new Set(['Lemon', 't:Tech.Computer']), enemies: new Set([1, 4]),
    };
    for (const s of [state, full, { ...state, layer: 0 }, { ...state, show: new Set(['Ground']) }]) {
      expect(parseState(serializeState(s), s.map, 'dam-battleground')).toEqual(s);
    }
  });

  it('round-trips the other way for canonical URLs', () => {
    const q = 'mode=arc&cond=Night&layer=1&item=lemon&show=Lemon%2CGround&enemies=2%2C5';
    expect(serializeState(parse(q, 'buried-city')).toString()).toBe(q);
  });
});

describe('condIndex', () => {
  it('finds the condition on the map', () => {
    expect(condIndex(TINY_MAP, 'Night')).toBe(1);
    expect(condIndex(TINY_MAP, 'Default')).toBe(0);
  });

  it('falls back to Normal for conditions not on the map', () => {
    expect(condIndex(TINY_MAP, 'Hurricane')).toBe(0);
  });
});

describe('defaultLayer', () => {
  const layer = (sockets: number) => ({ name: `L${sockets}`, image: TINY_MAP.image, sockets });

  it('is null for maps without layers', () => {
    expect(defaultLayer(TINY_MAP)).toBeNull();
  });

  it('is the layer with most sockets, the first one on a tie', () => {
    const map: MapData = { ...TINY_MAP, layers: [layer(10), layer(30), layer(30)] };
    expect(defaultLayer(map)).toBe(1);
    expect(defaultLayer({ ...map, layers: [layer(5)] })).toBe(0);
  });
});

describe('loadPrefs', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('drops the obsolete global puzzle preference and never restores a guide selection', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ puzzles: true, openedPuzzle: 0 }));
    expect(loadPrefs().puzzleDoors).toBe(false);
    expect(parse('show=PuzzleRelay,PuzzleButton,LockedDoor').show).toEqual(new Set(['LockedDoor']));
  });

  it('uses the defaults without stored prefs', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('merges stored prefs over the defaults', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ zones: true, side: false }));
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, zones: true, side: false });
  });

  it('uses the defaults for corrupt JSON or null', () => {
    localStorage.setItem(PREFS_KEY, '{"heat":');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(PREFS_KEY, 'null');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('uses the defaults for JSON that is not an object', () => {
    for (const raw of ['[true]', '42', '"heat"', 'true']) {
      localStorage.setItem(PREFS_KEY, raw);
      expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    }
  });

  it('uses the default for each pref of the wrong type and ignores unknown keys', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ heat: 'no', zones: true, side: 0, pois: null, extra: true }));
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, zones: true });
  });

  it('uses the defaults when storage is not readable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
