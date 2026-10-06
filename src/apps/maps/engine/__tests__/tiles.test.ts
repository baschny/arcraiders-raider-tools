import { describe, expect, it } from 'vitest';
import { TILE, tileRange } from '../tiles';

// A level is picked once the screen needs more than 1.2× its resolution (SLACK): level z covers 512 · 2^z px.
const level = (S: number, dpr = 1, levels = 3) => tileRange(levels, 0, 0, S, S, S, dpr).z;

describe('tileRange: level', () => {
  it('uses level 0 up to 1.2× its resolution', () => {
    expect(level(100)).toBe(0);
    expect(level(TILE)).toBe(0);
    expect(level(TILE * 1.2)).toBe(0);
    expect(level(TILE * 1.2 + 1)).toBe(1);
  });

  it('steps one level per doubling', () => {
    expect(level(TILE * 2.4)).toBe(1);
    expect(level(TILE * 2.4 + 1)).toBe(2);
  });

  it('accounts for the device pixel ratio', () => {
    expect(level(TILE, 1)).toBe(0);
    expect(level(TILE, 2)).toBe(1);
    expect(level(TILE * 2, 2)).toBe(2);
    expect(level(TILE * 1.2 + 1, 0.5)).toBe(0);
  });

  it('clamps to the levels of the texture', () => {
    expect(level(TILE * 100, 1, 3)).toBe(2);
    expect(level(TILE * 100, 3, 3)).toBe(2);
    expect(level(TILE * 100, 1, 1)).toBe(0);
    expect(level(TILE * 100, 1, 5)).toBe(4);
    expect(level(0.001)).toBe(0);
  });
});

describe('tileRange: visible tiles', () => {
  // 2048 px wide texture of a 3-level pyramid: level 2, 4×4 tiles of 512 px.
  it('reports level size and tile size', () => {
    expect(tileRange(3, 0, 0, 2048, 800, 600, 1)).toMatchObject({ z: 2, n: 4, ts: 512 });
  });

  it('covers the view only', () => {
    expect(tileRange(3, -600, -100, 2048, 800, 600, 1)).toMatchObject({ x0: 1, x1: 2, y0: 0, y1: 1 });
    // A tile edge on the left view border: the tile left of it is not needed.
    expect(tileRange(3, -512, 0, 2048, 800, 600, 1)).toMatchObject({ x0: 1, x1: 2 });
  });

  it('clamps to the texture when the view is bigger', () => {
    expect(tileRange(3, 100, 50, 2048, 4000, 4000, 1)).toMatchObject({ x0: 0, x1: 3, y0: 0, y1: 3 });
  });

  it('is empty when the texture is off screen', () => {
    const right = tileRange(3, 1000, 0, 2048, 800, 600, 1);
    expect(right.x0).toBeGreaterThan(right.x1);
    const above = tileRange(3, 0, -5000, 2048, 800, 600, 1);
    expect(above.y0).toBeGreaterThan(above.y1);
  });

  it('uses CSS px for the range, whatever the dpr', () => {
    // dpr 2 picks level 2 for a 1024 px wide texture: tiles of 256 CSS px.
    expect(tileRange(3, 0, 0, 1024, 300, 300, 2)).toMatchObject({ z: 2, n: 4, ts: 256, x0: 0, x1: 1, y0: 0, y1: 1 });
  });
});
