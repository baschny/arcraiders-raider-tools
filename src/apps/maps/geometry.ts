import type { UV } from './data/types';

const areaCache = new WeakMap<UV[], number>();
export function polyArea(poly: UV[]): number {
  let a = areaCache.get(poly);
  if (a == null) {
    a = 0;
    poly.forEach(([x, y], i) => {
      const [x2, y2] = poly[(i + 1) % poly.length];
      a! += x * y2 - x2 * y;
    });
    a = Math.abs(a) / 2;
    areaCache.set(poly, a);
  }
  return a;
}


export function inPoly([u, v]: UV, poly: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

export function bbox(pts: UV[]): [number, number, number, number] {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [u, v] of pts) {
    if (u < u0) u0 = u;
    if (v < v0) v0 = v;
    if (u > u1) u1 = u;
    if (v > v1) v1 = v;
  }
  return [u0, v0, u1, v1];
}

/** Net area of outline rings (outer boundaries and holes have opposite orientation). */
const ringsAreaCache = new WeakMap<UV[][], number>();
export function ringsArea(rings: UV[][]): number {
  let a = ringsAreaCache.get(rings);
  if (a == null) {
    a = 0;
    for (const ring of rings) ring.forEach(([x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      a! += x * y2 - x2 * y;
    });
    a = Math.abs(a) / 2;
    ringsAreaCache.set(rings, a);
  }
  return a;
}

/** Point inside outline rings (even-odd: inside an outer boundary, not inside a hole). */
export const inRings = (uv: UV, rings: UV[][]) => rings.reduce((inside, ring) => (inPoly(uv, ring) ? !inside : inside), false);
