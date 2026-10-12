import { describe, expect, it } from 'vitest';
import type { MapCondition, MapData, Puzzle, PuzzlePart, PuzzleVariant } from '../data/types';
import {
  PUZZLE_COLORS, activeVariants, doorPuzzles, doorSpawnerOf, inputTotal, isRandomizedPool, plainPins, setBadge, stepOrder,
  symbolLabel, symbolOf, variantActive, variantColors, variantLabel, visiblePuzzles,
} from '../data/puzzles';

const cond = (name: string): MapCondition => ({ key: name, name, category: 'major', live: true, layers: [] });

const variant = (id: string | null, conditions?: PuzzleVariant['conditions'], ns: (number | null)[] = [1, 2]): PuzzleVariant => ({
  id, spawner: null, chance: 0.25, conditions,
  steps: ns.map((n, i) => ({ n, id: `s${i}`, class: 'BP_SignalButton_C', cell: null, uv: [0, 0], z: 0 })),
});

describe('variantActive', () => {
  it('is active without conditions', () => expect(variantActive(variant('v'), cond('Normal'))).toBe(true));
  it('drops a variant whose `not` names the condition', () =>
    expect(variantActive(variant('v', { not: ['Hurricane'] }), cond('Hurricane'))).toBe(false));
  it('keeps a variant whose `not` names conditions the map does not offer', () =>
    expect(variantActive(variant('v', { not: ['Matriarch'] }), cond('Normal'))).toBe(true));
  it('keeps a variant only in the named conditions', () => {
    const v = variant('v', { only: ['Normal', 'Hurricane'] });
    expect(variantActive(v, cond('Normal'))).toBe(true);
    expect(variantActive(v, cond('Night Raid'))).toBe(false);
  });
});

describe('activeVariants', () => {
  it('filters the variant list by the selected condition', () => {
    const p = { variants: [variant('a'), variant('b', { not: ['Hurricane'] })] } as Puzzle;
    expect(activeVariants(p, cond('Normal'))).toEqual([0, 1]);
    expect(activeVariants(p, cond('Hurricane'))).toEqual([0]);
  });
});

describe('stepOrder', () => {
  it('sorts by n and puts unnumbered steps last', () => {
    const v = variant('v', undefined, [3, null, 1, 2]);
    expect(stepOrder(v).map((s) => s.n)).toEqual([1, 2, 3, null]);
  });
});

describe('variantLabel', () => {
  it('names a layout by its number', () => expect(variantLabel(variant('LI_ChurchPuzzleLayout3'), 2)).toBe('Layout 3'));
  it('falls back to the index for an unnamed variant', () => expect(variantLabel(variant(null), 1)).toBe('Variant 2'));
});

describe('variantColors', () => {
  it('gives every variant of every shown puzzle a colour, distinct across puzzles', () => {
    const puzzles = [{ variants: [variant('a'), variant('b')] }, { variants: [variant('c')] }] as Puzzle[];
    const colors = variantColors(puzzles);
    expect(colors[0]).toEqual([PUZZLE_COLORS[0], PUZZLE_COLORS[1]]);
    expect(colors[1]).toEqual([PUZZLE_COLORS[2]]);
    expect(new Set(colors.flat()).size).toBe(3);
  });
});

describe('symbolLabel', () => {
  it('reads the trailing number', () => expect(symbolLabel('mural-81')).toBe('81'));
});

describe('symbolOf', () => {
  const m = { symbols: [{ key: 'mural-78', image: 'symbols/mural-78.webp' }] } as unknown as MapData;
  it('finds a sigil image by key', () => expect(symbolOf(m, 'mural-78')?.image).toBe('symbols/mural-78.webp'));
  it('returns undefined for a key the map does not have', () => expect(symbolOf(m, 'mural-74')).toBeUndefined());
  it('returns undefined without a key', () => expect(symbolOf(m, undefined)).toBeUndefined());
  it('returns undefined for a map without symbols', () => expect(symbolOf({} as MapData, 'mural-78')).toBeUndefined());
});

const mapWithDoor = (): MapData => ({
  world: [0, 0, 162000, 162000],
  spawnerClasses: ['BP_InteractiveDoor_RandomizedSequencePuzzleDoor | LockedDoor', 'BP_SignalRelay_Quad'],
  spawners: [[0.3561, 0.6341, 0], [0.1, 0.1, 1]],
  puzzles: [{
    id: 'p', kind: 'sequence', system: 'signal', required: 4, randomized: false, door: null, keyRoom: null,
    symbols: [], variants: [],
    parts: [{ role: 'door', class: 'BP_InteractiveDoor_RandomizedSequencePuzzleDoor_C', uv: [0.3561, 0.6341], z: -10675 }],
  }],
} as unknown as MapData);

describe('doorSpawnerOf / doorPuzzles', () => {
  it('finds the spawner that draws the door part', () => {
    const m = mapWithDoor();
    expect(doorSpawnerOf(m, m.puzzles![0].parts[0])).toBe(0);
    expect(doorPuzzles(m).get(0)).toBe(0);
  });
  it('ignores a door part with no matching spawner', () => {
    const m = mapWithDoor();
    const part: PuzzlePart = { role: 'door', class: 'BP_OtherDoor_C', uv: [0.3561, 0.6341], z: 0 };
    expect(doorSpawnerOf(m, part)).toBe(-1);
    expect(doorPuzzles({ ...m, puzzles: [{ ...m.puzzles![0], parts: [part] }] } as MapData).size).toBe(0);
  });
});

describe('visiblePuzzles', () => {
  const m = { puzzles: [{}, {}] } as unknown as MapData;
  it('shows all with the layer on', () => expect(visiblePuzzles(m, true, null)).toEqual([0, 1]));
  it('shows only the opened puzzle with the layer off', () => expect(visiblePuzzles(m, false, 1)).toEqual([1]));
  it('shows nothing otherwise', () => expect(visiblePuzzles(m, false, null)).toEqual([]));
});

const input = (uv: [number, number]) => ({ id: 'i', class: 'BP_DownloadInteractionProximityItem_C', cell: null, uv, z: 0 });
const randomized = {
  id: 'r', kind: 'sequence', system: 'puzzle', required: 8, randomized: true, door: null, keyRoom: null,
  symbols: [], variants: [],
  pool: [input([0.1, 0.1]), input([0.2, 0.2]), input([0.3, 0.3])],
  parts: [{ role: 'relay', class: 'BP_PuzzleRelay_8_C', uv: [0, 0], z: 0 }],
} as unknown as Puzzle;

describe('isRandomizedPool', () => {
  it('is true for a shuffled puzzle with a pool', () => expect(isRandomizedPool(randomized)).toBe(true));
  it('is false without a pool', () => expect(isRandomizedPool({ ...randomized, pool: [] } as Puzzle)).toBe(false));
  it('is false when the puzzle is not randomized', () => expect(isRandomizedPool({ ...randomized, randomized: false } as Puzzle)).toBe(false));
});

describe('plainPins / inputTotal', () => {
  it('draws the randomized pool as unnumbered pins (no parts, no trail)', () => {
    expect(plainPins(randomized).map((p) => p.uv)).toEqual([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]]);
    expect(inputTotal(randomized)).toBe(3);
  });
  it('draws the parts of a puzzle with no variants', () => {
    const sink = {
      ...randomized, randomized: false, pool: undefined,
      parts: [
        { role: 'door', class: 'BP_InteractiveGate_TBG_C', uv: [0.5, 0.5], z: 0 },
        { role: 'console', class: 'BP_UnlockConsole_LockedGate_C', uv: [0.51, 0.5], z: 0 },
      ],
    } as unknown as Puzzle;
    expect(plainPins(sink).map((p) => p.uv)).toEqual([[0.5, 0.5], [0.51, 0.5]]);
    expect(inputTotal(sink)).toBe(1); // the door it opens is not an input
  });
  it('draws no plain pins for a puzzle with variants (its steps are drawn instead)', () => {
    expect(plainPins({ ...randomized, randomized: false, pool: undefined, variants: [variant('a')] } as unknown as Puzzle)).toEqual([]);
  });
  it('counts the shown variant\u2019s steps as inputs', () => {
    const p = { variants: [variant('a', undefined, [1, 2, 3])], parts: [] } as unknown as Puzzle;
    expect(inputTotal(p, [0])).toBe(3);
  });
});

describe('setBadge', () => {
  it('reads "any order" without a count when required is null', () =>
    expect(setBadge({ required: null } as Puzzle, 4)).toEqual({ key: 'maps.puzzles.setBadgeAny' }));
  it('keeps "requires N of M (any order)" when required is a number', () =>
    expect(setBadge({ required: 3 } as Puzzle, 4)).toEqual({ key: 'maps.puzzles.setBadge', required: 3, total: 4 }));
});

describe('doorPuzzles with several puzzles sharing one door', () => {
  it('picks the puzzle with the lowest id, deterministically', () => {
    const part: PuzzlePart = { role: 'door', class: 'BP_InteractiveGate_TBG_C', uv: [0.5, 0.5], z: 0 };
    const m = {
      world: [0, 0, 162000, 162000],
      spawnerClasses: ['BP_InteractiveGate_TBG | LockedDoor'],
      spawners: [[0.5, 0.5, 0]],
      puzzles: [
        { id: 'z_relay', parts: [part] },
        { id: 'a_console', parts: [part] },
        { id: 'm_console', parts: [part] },
      ],
    } as unknown as MapData;
    expect(doorPuzzles(m).get(0)).toBe(1); // 'a_console' sorts lowest
  });
});
