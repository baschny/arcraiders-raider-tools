import { afterEach, describe, expect, it, vi } from 'vitest';
import { TINY_INDEX, TINY_MAP } from '../data/__tests__/fixtures/tinyMap';
import type { ItemsMap } from '../../loot-helper/types/item';
import type { MapData, MapIndex } from '../data/types';
import { condIndex, DEFAULT_PREFS, defaultLayer, loadPrefs, parseState, PREFS_KEY, sanitizeState, serializeState, type MapState } from '../state';

const parse = (q: string) => parseState(new URLSearchParams(q), 'TheDam_02');

describe('parseState', () => {
  it('falls back to the defaults', () => {
    expect(parse('')).toEqual({
      mode: 'loot', map: 'TheDam_02', cond: 'Default', layer: null, item: null, show: new Set(), enemies: new Set(),
    });
  });

  it('reads every param', () => {
    expect(parse('mode=arc&map=Spaceport_01&cond=Night&layer=1&item=lemon&show=t:Industrial.Lockers,Lemon&enemies=3,0')).toEqual({
      mode: 'arc', map: 'Spaceport_01', cond: 'Night', layer: 1, item: 'lemon', show: new Set(['t:Industrial.Lockers', 'Lemon']), enemies: new Set([3, 0]),
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

  it('treats empty map, cond and item params as missing', () => {
    expect(parse('map=&cond=&item=')).toMatchObject({ map: 'TheDam_02', cond: 'Default', item: null });
  });
});

describe('sanitizeState', () => {
  const index: MapIndex = {
    ...TINY_INDEX,
    maps: [
      { map: 'TheDam_02', name: 'Dam Battlegrounds', difficulty: 1, file: 'maps/TheDam_02.json', image: TINY_MAP.image },
      { map: TINY_MAP.map, name: TINY_MAP.name, difficulty: 2, file: `maps/${TINY_MAP.map}.json`, image: TINY_MAP.image },
    ],
  };
  const base: MapState = { ...parse(''), map: TINY_MAP.map };
  const items = { lemon: {} } as unknown as ItemsMap;
  const fix = (s: Partial<MapState>, map: MapData | null = TINY_MAP, its: ItemsMap | null = items) => sanitizeState({ ...base, ...s }, index, map, its, 'TheDam_02');

  it('leaves valid state alone', () => {
    expect(fix({ cond: 'Night', item: 'lemon', enemies: new Set([0, 2]) })).toBeNull();
  });

  it('replaces an unknown map by the default map with its defaults', () => {
    expect(fix({ map: 'Gone_01', cond: 'Night', layer: 1 }, null)).toEqual({ map: 'TheDam_02', cond: 'Default', layer: null });
    const noDefault = { ...index, maps: index.maps.slice(1) };
    expect(sanitizeState({ ...base, map: 'Gone_01' }, noDefault, null, null, 'TheDam_02')?.map).toBe(TINY_MAP.map);
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
    mode: 'loot', map: 'TheDam_02', cond: 'Default', layer: null, item: null, show: new Set(), enemies: new Set(),
  };

  it('writes only the map for the default state', () => {
    expect(serializeState(state).toString()).toBe('map=TheDam_02');
  });

  it('round-trips through parseState', () => {
    const full: MapState = {
      mode: 'arc', map: 'MountainCompound', cond: 'Night', layer: 0, item: 'wires', show: new Set(['Lemon', 't:Tech.Computer']), enemies: new Set([1, 4]),
    };
    for (const s of [state, full, { ...state, layer: 0 }, { ...state, show: new Set(['Ground']) }]) {
      expect(parseState(serializeState(s), 'TheDam_02')).toEqual(s);
    }
  });

  it('round-trips the other way for canonical URLs', () => {
    const q = 'mode=arc&map=BuriedCity_01&cond=Night&layer=1&item=lemon&show=Lemon%2CGround&enemies=2%2C5';
    expect(serializeState(parse(q)).toString()).toBe(q);
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
