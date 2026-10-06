import { afterEach, describe, expect, it, vi } from 'vitest';
import { TINY_MAP } from '../data/__tests__/fixtures/tinyMap';
import type { MapData } from '../data/types';
import { condIndex, DEFAULT_PREFS, defaultLayer, loadPrefs, parseState, PREFS_KEY, serializeState, type MapState } from '../state';

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

  it('uses the defaults when storage is not readable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
