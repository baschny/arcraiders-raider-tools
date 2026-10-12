import { describe, expect, it } from 'vitest';
import { makeHeights } from './map-heights.mjs';

// 4×4 grid, 100 cm cells, origin [-50, -50, 0], granularity 1; base value 10 (1000 cm^2 * ... -> 10 cm).
const build = () => {
  const n = 4;
  const data = new Uint16Array(n * n).fill(10);
  data[1 * n + 1] = 1000; // one 1000 cm tall cell at (1, 1)
  return makeHeights({ origin: [-50, -50, 0], dimensions: n, cellSize: 100, minHeight: 0, granularity: 1 }, data);
};

describe('makeHeights', () => {
  it('reads the top surface and the estimated ground', () => {
    const h = build();
    expect(h.top(100, 100)).toBe(1000); // the tall cell (i=1, j=1 covers x 50..150)
    expect(h.top(300, 300)).toBe(10);
    expect(h.ground(100, 100, 500)).toBe(10); // lowest surface in reach: the flat base
    expect(h.top(1000, 1000)).toBeNull(); // outside the grid
    expect(h.ground(1000, 1000, 500)).toBeNull();
  });

  it('turns a point into the build level: dm above ground, covered above', () => {
    const h = build();
    expect(h.level(300, 300, 510)).toEqual([0, 50, 0]); // 510 - 10 = 500 cm = 50 dm, open sky
    expect(h.level(100, 100, 1010)).toEqual([0, 100, 0]); // top - z = -10, nothing above
    expect(h.level(100, 100, 700)).toEqual([0, 69, 1]); // 1000 - 700 = 300 > 250: under the tall cell
  });

  it('reports unknown height outside the grid', () => {
    expect(build().level(1000, 1000, 0)).toEqual([0, null, 0]);
  });
});
