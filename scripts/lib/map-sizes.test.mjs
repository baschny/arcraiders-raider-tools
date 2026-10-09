// Map size math (map-sizes.mjs). The fixtures carry only what computeSizes reads: `map`, `name`, `world` (cm) and
// `bounds` (UV), so a square of 1000 × 1000 m is exactly the unit square in UV with a 100000 cm world size.
import { describe, expect, it } from 'vitest';
import { computeSizes } from './map-sizes.mjs';

const map = (key, world, bounds) => ({ map: key, name: key, world, bounds });
const index = (keys) => ({ maps: keys.map((key, i) => ({ map: key, difficulty: i + 1 })) });

/** The unit square in UV: its world size in meters is the map's edge length. */
const SQUARE = [[[0, 0], [1, 0], [1, 1], [0, 1]]];

describe('computeSizes', () => {
  it('measures a 1 km square: area, bounding box, oriented extent and diameter', () => {
    const [m] = computeSizes([map('A', [0, 0, 100000, 100000], SQUARE)], index(['A']));
    expect(m.name).toBe('A');
    expect(m.areaKm2).toBe(1);
    expect(m.bboxW).toBe(1000);
    expect(m.bboxH).toBe(1000);
    expect(m.lengthM).toBe(1000);
    expect(m.widthM).toBe(1000);
    expect(m.diameterM).toBe(1414); // the diagonal
    expect(m.fillPct).toBe(100);
    // The outline is recentered on its centroid, so the caller can stack maps on their middle.
    expect(m.bbox).toEqual([-500, -500, 500, 500]);
  });

  it('reports the long and short side of a rectangle as length and width', () => {
    const [m] = computeSizes([map('A', [0, 0, 200000, 100000], SQUARE)], index(['A']));
    expect(m.areaKm2).toBe(2);
    expect(m.lengthM).toBe(2000);
    expect(m.widthM).toBe(1000);
    expect(m.bboxW).toBe(2000);
    expect(m.bboxH).toBe(1000);
  });

  it('measures the outline area, not its bounding box (fill below 100 %)', () => {
    const triangle = [[[0, 0], [1, 0], [1, 1]]];
    const [m] = computeSizes([map('A', [0, 0, 100000, 100000], triangle)], index(['A']));
    expect(m.areaKm2).toBe(0.5);
    expect(m.fillPct).toBe(50);
  });

  it('sums several rings and sorts the maps largest first, with the difficulty from the index', () => {
    const quarterA = [[[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]]];
    const quarterB = [[[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]]];
    const small = map('Small', [0, 0, 100000, 100000], quarterA);
    const big = map('Big', [0, 0, 100000, 100000], SQUARE);
    const two = map('Two', [0, 0, 100000, 100000], [...quarterA, ...quarterB]);
    const sizes = computeSizes([small, two, big], index(['Small', 'Two', 'Big']));
    expect(sizes.map((m) => m.name)).toEqual(['Big', 'Two', 'Small']);
    expect(sizes.map((m) => m.areaKm2)).toEqual([1, 0.5, 0.25]);
    expect(sizes.map((m) => m.difficulty)).toEqual([3, 2, 1]);
  });

  it('skips maps without a world or playable outline', () => {
    const empty = map('Empty', [0, 0, 100000, 100000], []);
    expect(computeSizes([empty], index(['Empty']))).toEqual([]);
  });
});
