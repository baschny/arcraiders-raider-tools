import { describe, expect, it } from 'vitest';
import type { MapCondition, MapData, Puzzle, PuzzlePart, PuzzleVariant } from '../data/types';
import {
  PUZZLE_COLORS, activeVariants, doorPuzzles, doorSpawnerOf, stepOrder, symbolLabel, variantActive, variantColors, variantLabel, visiblePuzzles,
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
