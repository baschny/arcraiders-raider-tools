import { describe, expect, it } from 'vitest';
import { dedicatedContainers, fmtScore, itemNote, itemShares, scoreMap } from '../scoring';
import { CANDLEBERRIES, DEFAULT, DUCK, LEMON, METAL, NIGHT, TINY_INDEX, TINY_MAP, TRINKET, WIRES } from './fixtures/tinyMap';

const score = (items: number[], ci = DEFAULT, match = true) => scoreMap(TINY_INDEX, TINY_MAP, items, ci, match);
const perSocket = (items: number[], ci = DEFAULT, match = true) => [...score(items, ci, match).sockets];

describe('itemShares', () => {
  it('splits a table over its entries and an entry over its items', () => {
    expect(itemShares(TINY_INDEX, [METAL])).toEqual({ T1: 0.75 });
    expect(itemShares(TINY_INDEX, [DUCK])).toEqual({ T1: 0.25, T2: 0.25 });
    expect(itemShares(TINY_INDEX, [WIRES])).toEqual({ T2: 0.25 });
  });

  it('adds up the shares of several loot items (one raider-tools item, several assets)', () => {
    expect(itemShares(TINY_INDEX, [METAL, DUCK])).toEqual({ T1: 1, T2: 0.25 });
  });

  it('leaves out tables without the item', () => {
    expect(itemShares(TINY_INDEX, [CANDLEBERRIES])).toEqual({});
  });
});

describe('scoreMap: pool split', () => {
  // METAL under Default: H0 = 10 / 2 tables · 0.75 = 3.75 over 2 sockets -> 1.875 per socket; H1 has no T1.
  // Sets: 0 = {H0} 1.875, 1 = {H1} 0, 2 = {H0, H1} 1.875. Industrial sockets 0, 1 and ground 7 hit; 8 is Night only.
  it('splits a pool over its tables and a handler over its sockets', () => {
    expect(perSocket([METAL])).toEqual([1.875, 1.875, 0, 0, 0, 0, 0, 1.875, 0]);
    const s = score([METAL]);
    expect(s.total).toBeCloseTo(5.625);
    expect(s.max).toBe(1.875);
    expect(s.hits).toBe(3);
  });

  // WIRES under Default: H0 = 5 · 0.25 = 1.25 / 2 sockets = 0.625; H1 = 8 · 0.25 · x2 = 4 / 4 sockets = 1.
  // Set 2 has both handlers: 1.625.
  it('applies the table weight multiplier and sums the handlers of a set', () => {
    expect(perSocket([WIRES])).toEqual([0, 0, 1, 0, 0, 0, 0, 1.625, 0]);
  });

  it('only counts tables active under the condition', () => {
    // Night: T2 is not in H0's pool any more, only H1 remains.
    expect(perSocket([WIRES], NIGHT)).toEqual([0, 0, 1, 0, 0, 0, 0, 1, 0]);
  });

  it('only counts sockets present under the condition (data layers)', () => {
    expect(score([METAL], DEFAULT).sockets[8]).toBe(0);
    expect(score([METAL], NIGHT).sockets[8]).toBe(1.875);
    expect(score([METAL], NIGHT).total).toBeCloseTo(7.5);
  });

  it('sums sockets per POI', () => {
    expect(score([METAL]).pois).toEqual([
      { score: 3.75, hits: 2, sockets: 2 },
      { score: 1.875, hits: 1, sockets: 3 },
    ]);
  });

  it('scores nothing for an item in no table', () => {
    const s = score([CANDLEBERRIES]);
    expect(s.total).toBe(0);
    expect(s.hits).toBe(0);
  });
});

describe('scoreMap: container categories', () => {
  it('with matching on, an area-tagged item only goes into containers of its area (and ground loot)', () => {
    // METAL (Industrial) is not in the water tank (socket 4) although its set holds the item.
    expect(perSocket([METAL])[4]).toBe(0);
    expect(perSocket([METAL])[7]).toBe(1.875);
  });

  it('maps the Tech container category to the Technological area tag', () => {
    expect(perSocket([WIRES])[2]).toBe(1);
  });

  it('with matching off, every container of a scoring set counts', () => {
    expect(perSocket([METAL], DEFAULT, false)).toEqual([1.875, 1.875, 0, 0, 1.875, 0, 0, 1.875, 0]);
    // Sets 1 (H1, 4 · 0.25 · 2 / 4) hold Wires everywhere, plants included.
    expect(perSocket([WIRES], DEFAULT, false)).toEqual([0.625, 0.625, 1, 1, 1.625, 1, 1, 1.625, 0]);
  });

  // DUCK: H0 = 5 · 0.25 (T1) + 5 · 0.25 (T2) = 2.5 / 2 = 1.25; H1 = 4 / 4 = 1; set 2 = 2.25.
  it('without area tag: every container except nature spots, but water tanks yes', () => {
    expect(perSocket([DUCK])).toEqual([1.25, 1.25, 1, 0, 2.25, 0, 0, 2.25, 0]);
  });

  it('plants only give their own item, and not as ground loot', () => {
    // LEMON: only the lemon tree (socket 3, set 1: 1), not the mushroom, bird nest or ground in the same sets.
    expect(perSocket([LEMON])).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('bird-nest trinkets only come from bird nests', () => {
    expect(perSocket([TRINKET])).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0]);
  });

  it('a socket counts when any of the loot items may go into it', () => {
    // LEMON + DUCK share the plant rule of one and the "anything but nature" rule of the other.
    const s = scoreMap(TINY_INDEX, TINY_MAP, [LEMON, DUCK], DEFAULT, true);
    expect(s.sockets[3]).toBeGreaterThan(0);
    expect(s.sockets[0]).toBeGreaterThan(0);
    expect(s.sockets[6]).toBe(0);
  });
});

describe('dedicatedContainers', () => {
  const tags = TINY_MAP.containers;
  const it_ = (i: number) => TINY_INDEX.items[i];

  it('finds a plant by name', () => {
    expect(dedicatedContainers(it_(LEMON), tags)).toEqual(['Nature.Lemon']);
  });

  it('sends bird-nest trinkets to bird nests', () => {
    expect(dedicatedContainers(it_(TRINKET), tags)).toEqual(['Nature.BirdNest']);
  });

  it('only applies to nature items', () => {
    expect(dedicatedContainers(it_(METAL), tags)).toEqual([]);
    expect(dedicatedContainers(it_(DUCK), tags)).toEqual([]);
    expect(dedicatedContainers({ ...it_(METAL), name: 'Lemon' }, tags)).toEqual([]);
  });

  it('needs at least four letters to match a name', () => {
    expect(dedicatedContainers({ ...it_(LEMON), name: 'Oli' }, ['Nature.Olive'])).toEqual([]);
    expect(dedicatedContainers({ ...it_(LEMON), name: 'Olives' }, ['Nature.Olive'])).toEqual(['Nature.Olive']);
  });

  it('a nature item without its own container has none', () => {
    expect(dedicatedContainers(it_(CANDLEBERRIES), tags)).toEqual([]);
  });
});

describe('itemNote', () => {
  it('explains items whose only containers exist under some conditions', () => {
    expect(itemNote(TINY_INDEX, TINY_INDEX.items[CANDLEBERRIES])).toEqual({
      containers: ['Nature.Candleberries'],
      conditions: [{ name: 'Cold Snap', why: null }, { name: 'Hurricane', why: 'not in the schedule' }],
    });
  });

  it('is null for containers that always exist and for regular items', () => {
    expect(itemNote(TINY_INDEX, TINY_INDEX.items[LEMON])).toBeNull();
    expect(itemNote(TINY_INDEX, TINY_INDEX.items[METAL])).toBeNull();
  });
});

describe('fmtScore', () => {
  it('shows fewer decimals for bigger scores', () => {
    expect(fmtScore(123.4)).toBe('123');
    expect(fmtScore(12.34)).toBe('12.3');
    expect(fmtScore(1.234)).toBe('1.23');
  });

  it('formats with the given formatter', () => {
    const de = (v: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat('de', o).format(v);
    expect(fmtScore(12.34, de)).toBe('12,3');
    expect(fmtScore(1234.5, de)).toBe('1.235');
  });
});
