// Outlines of map areas (POIs) for the map page, computed at sync time instead of in the browser.
//
// An area's shape comes from the game as many convex pieces (the collision pieces of its volume brushes, often
// several volumes per area). Drawn as they are, they show inner edges between pieces, and the pieces often leave
// thin notches and slits where they almost touch. outlineRings() merges the pieces and fills those notches: the
// pockets of the convex hull outside the merge that are mostly thinner than 2 × `fill` (they almost vanish when
// shrunk by `fill`). Real concave parts of an area stay, and corners stay sharp. Falls back to the plain merge if
// the filling goes wrong (the JS Clipper port is not fully robust).
import { Clipper, EndType, FillRule, JoinType, Path64, Paths64 } from 'clipper2-js';

const SCALE = 1e4; // integer grid for Clipper: 1 unit = 1/10000 of the map (about 0.2–0.4 m)

/** Pieces on the integer grid, without repeated points (the JS Clipper port drops the whole union on those). */
function toPaths(polys) {
  const paths = new Paths64();
  for (const poly of polys) {
    const pts = [];
    for (const [u, v] of poly) {
      const q = [Math.round(u * SCALE), Math.round(v * SCALE)];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    const path = new Path64();
    for (const [x, y] of pts) path.push({ x, y });
    paths.push(path);
  }
  return paths;
}

const pathsArea = (paths) => Math.abs(paths.reduce((a, r) => a + Clipper.area(r), 0));

function hullPath(paths) {
  const pts = paths.flat().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of pts.reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  const hull = new Path64();
  for (const q of lo.slice(0, -1).concat(hi.slice(0, -1))) hull.push({ x: q.x, y: q.y });
  return hull;
}

/**
 * Outline rings (outer boundaries and holes, opposite orientation; fill with even-odd) of an area's pieces, in UV.
 * `fill`: notch / gap width to fill, in UV units (half of it; gaps under 2 × fill are filled).
 */
export function outlineRings(polys, fill) {
  if (polys.length < 2) return polys;
  const r = fill * SCALE;
  const merged = Clipper.Union(toPaths(polys), undefined, FillRule.NonZero);
  if (!merged.length) return polys;
  let result = merged;
  const pockets = Clipper.Difference(new Paths64(hullPath(merged)), merged, FillRule.NonZero);
  const thin = new Paths64();
  for (const ring of pockets) {
    if (Clipper.area(ring) <= 0) continue; // a hole of a pocket
    const one = new Paths64(ring);
    const opened = Clipper.InflatePaths(Clipper.InflatePaths(one, -r, JoinType.Miter, EndType.Polygon), r, JoinType.Miter, EndType.Polygon);
    if (pathsArea(opened) < 0.25 * pathsArea(one)) thin.push(ring);
  }
  if (thin.length) {
    const filled = Clipper.simplifyPaths(Clipper.Union(merged, thin, FillRule.NonZero), r / 8, true);
    if (filled.length && pathsArea(filled) >= 0.98 * pathsArea(merged)) result = filled;
  }
  return result.map((path) => path.map((pt) => [pt.x / SCALE, pt.y / SCALE]));
}
