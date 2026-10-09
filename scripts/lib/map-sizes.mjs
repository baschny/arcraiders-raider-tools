// Playable-area sizes of the raid maps, computed at sync time instead of in the browser (like the area outlines in
// area-outlines.mjs). The input is the map features build of embark-api (data-game-extract/current/map-features/):
// each map carries `world` [worldPosition.X, worldPosition.Y, worldSize.X, worldSize.Y] (cm) of the map texture and
// `bounds`, the playable-area outlines in UV of that texture. Converting UV to meters is exact:
//   1 UV unit = worldSize / 100 m.  The playable area scales by worldSize.X * worldSize.Y / 10000.
// Everything is measured on the playable outline itself, not on the surrounding map texture.

const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function polyCentroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  return a ? [cx / (6 * a), cy / (6 * a)] : [0, 0];
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Oriented minimum-area bounding rectangle of a convex hull (rotating over its edges). */
function minAreaRect(hull) {
  let best = { area: Infinity, length: 0, width: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of hull) {
      const u = (q[0] - a[0]) * ux + (q[1] - a[1]) * uy;
      const v = -(q[0] - a[0]) * uy + (q[1] - a[1]) * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const length = maxU - minU;
    const width = maxV - minV;
    if (length * width < best.area) best = { area: length * width, length, width };
  }
  return best.length >= best.width ? best : { length: best.width, width: best.length };
}

function convexDiameter(hull) {
  let best = 0;
  for (let i = 0; i < hull.length; i++) {
    for (let j = i + 1; j < hull.length; j++) {
      best = Math.max(best, Math.hypot(hull[i][0] - hull[j][0], hull[i][1] - hull[j][1]));
    }
  }
  return best;
}

/**
 * Measure every map's playable area, sorted largest first.
 *
 * @param maps  build map objects (`{ map, name, nameKey?, world, bounds }`).
 * @param index the build index (`{ maps: [{ map, difficulty }] }`), for the difficulty.
 * @returns `{ map, name, nameKey?, difficulty, rings, bbox, areaKm2, bboxW, bboxH, lengthM, widthM, diameterM, fillPct }`
 *   where `rings` (meters, centered on the centroid) and `bbox` feed the overlay and the tiles directly.
 */
export function computeSizes(maps, index) {
  const difficulty = new Map((index.maps ?? []).map((m) => [m.map, m.difficulty]));
  const out = [];
  for (const data of maps) {
    if (!data.world || !data.bounds?.length) continue;
    const [, , worldW, worldH] = data.world; // cm
    const scaleX = worldW / 100; // meters per UV unit
    const scaleY = worldH / 100;

    const rings = data.bounds.map((poly) => poly.map(([u, v]) => [u * scaleX, v * scaleY]));
    const flat = rings.flat();
    const areaM2 = rings.reduce((a, poly) => a + polyArea(poly), 0);

    const xs = flat.map((p) => p[0]);
    const ys = flat.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const [cx, cy] = rings.length === 1 ? polyCentroid(rings[0]) : [(minX + maxX) / 2, (minY + maxY) / 2];
    const hull = convexHull(flat);
    const rect = minAreaRect(hull);

    out.push({
      map: data.map,
      name: data.name,
      nameKey: data.nameKey,
      difficulty: difficulty.get(data.map) ?? null,
      rings: rings.map((poly) => poly.map(([x, y]) => [round(x - cx, 1), round(y - cy, 1)])),
      bbox: [round(minX - cx, 1), round(minY - cy, 1), round(maxX - cx, 1), round(maxY - cy, 1)],
      areaKm2: round(areaM2 / 1e6, 3),
      bboxW: round(maxX - minX, 0),
      bboxH: round(maxY - minY, 0),
      lengthM: round(rect.length, 0),
      widthM: round(rect.width, 0),
      diameterM: round(convexDiameter(hull), 0),
      fillPct: round((areaM2 / (scaleX * scaleY)) * 100, 0),
    });
  }
  return out.sort((a, b) => b.areaKm2 - a.areaKm2);
}
