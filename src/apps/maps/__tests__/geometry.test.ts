import { describe, expect, it } from 'vitest';
import type { UV } from '../data/types';
import { bbox, convexHull, inPoly, inRings, polyArea, ringsArea } from '../geometry';

const square = (x: number, y: number, s: number, cw = false): UV[] => {
  const ring: UV[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  return cw ? ring.reverse() : ring;
};

describe('polyArea', () => {
  it('is the area whatever the orientation', () => {
    expect(polyArea(square(0, 0, 2))).toBe(4);
    expect(polyArea(square(0, 0, 2, true))).toBe(4);
    expect(polyArea([[0, 0], [1, 0], [0, 1]])).toBe(0.5);
  });

  it('is 0 for degenerate polygons', () => {
    expect(polyArea([])).toBe(0);
    expect(polyArea([[0, 0], [1, 1]])).toBe(0);
  });
});

describe('inPoly', () => {
  const sq = square(0, 0, 1);
  it('tells inside from outside', () => {
    expect(inPoly([0.5, 0.5], sq)).toBe(true);
    expect(inPoly([1.5, 0.5], sq)).toBe(false);
    expect(inPoly([0.5, -0.1], sq)).toBe(false);
  });

  it('handles concave polygons', () => {
    // U shape: the notch between the arms is outside.
    const u: UV[] = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]];
    expect(inPoly([0.5, 2], u)).toBe(true);
    expect(inPoly([1.5, 2], u)).toBe(false);
    expect(inPoly([1.5, 0.5], u)).toBe(true);
  });
});

describe('convexHull', () => {
  it('drops inner and collinear points', () => {
    const hull = convexHull([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [1, 1], [0.5, 1.5]]);
    expect(hull).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
  });

  it('returns fewer than three points sorted', () => {
    expect(convexHull([[1, 1], [0, 0]])).toEqual([[0, 0], [1, 1]]);
    expect(convexHull([])).toEqual([]);
  });

  it('does not change its input', () => {
    const pts: [number, number][] = [[1, 1], [0, 0], [1, 0], [0, 1]];
    convexHull(pts);
    expect(pts).toEqual([[1, 1], [0, 0], [1, 0], [0, 1]]);
  });
});

describe('bbox', () => {
  it('spans all points', () => {
    expect(bbox([[0.2, 0.5], [0.1, 0.9], [0.4, 0.3]])).toEqual([0.1, 0.3, 0.4, 0.9]);
  });

  it('is inverted infinity for no points', () => {
    expect(bbox([])).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
  });
});

describe('ringsArea / inRings', () => {
  // Outer 4×4 boundary with a 2×2 hole of opposite orientation.
  const rings = [square(0, 0, 4), square(1, 1, 2, true)];

  it('subtracts holes', () => {
    expect(ringsArea(rings)).toBe(12);
  });

  it('counts a point in a hole as outside', () => {
    expect(inRings([0.5, 0.5], rings)).toBe(true);
    expect(inRings([2, 2], rings)).toBe(false);
    expect(inRings([5, 5], rings)).toBe(false);
  });

  it('handles several outer rings', () => {
    const two = [square(0, 0, 1), square(2, 0, 1)];
    expect(ringsArea(two)).toBe(2);
    expect(inRings([2.5, 0.5], two)).toBe(true);
    expect(inRings([1.5, 0.5], two)).toBe(false);
  });
});
