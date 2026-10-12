// Ground-relative heights for the maps generator: a port of embark-api's heightmap reader
// (lib/map-loot.js `loadHeightMap`) and its point level (lib/derived/map-features.js `level`). Socket and
// spawner levels come from the build; puzzle pins have no level there, so the generator computes the same
// "≈ N m vs ground" hint for them from the game extract's heightmap.
import fs from 'node:fs';
import path from 'node:path';

/**
 * Lookups over an EmbarkHierarchicalHeightMap: `top(x, y)` is the top surface (terrain, roofs, rocks),
 * `ground(x, y, radius)` the lowest top surface within `radius` cm (an estimate of the ground next to
 * buildings and rocks), and `level(x, y, z)` the build's `[layer, heightDm, covered]` for a world point
 * (layer is always 0 here: the maps with puzzles have no map layers). All values in cm.
 */
export function makeHeights(h, data) {
  const [ox, oy, oz] = h.origin, n = h.dimensions, cell = h.cellSize;
  const cellOf = (x, y) => {
    const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell);
    return i < 0 || j < 0 || i >= n || j >= n ? null : [i, j];
  };
  const value = (i, j) => oz + h.minHeight + data[j * n + i] * h.granularity;
  const top = (x, y) => {
    const c = cellOf(x, y);
    return c ? value(c[0], c[1]) : null;
  };
  const ground = (x, y, radius) => {
    const c = cellOf(x, y);
    if (!c) return null;
    const r = Math.round(radius / cell);
    let min = Infinity;
    for (let j = Math.max(0, c[1] - r); j <= Math.min(n - 1, c[1] + r); j += 2)
      for (let i = Math.max(0, c[0] - r); i <= Math.min(n - 1, c[0] + r); i += 2) {
        const v = data[j * n + i];
        if (v < min) min = v;
      }
    return oz + h.minHeight + min * h.granularity;
  };
  const level = (x, y, z) => {
    const g = ground(x, y, 500), t = top(x, y);
    if (g == null) return [0, null, 0];
    return [0, Math.round((z - g) / 10), t - z > 250 ? 1 : 0]; // height in dm, covered above
  };
  return { top, ground, level };
}

/** Heights of a map from the game extract (`<extract>/maps/`), or null when it is not mounted. */
export function loadHeights(mapsDir, mapId) {
  const meta = path.join(mapsDir, `${mapId}.json`);
  if (!fs.existsSync(meta)) return null;
  const h = JSON.parse(fs.readFileSync(meta, 'utf8')).heightMap;
  if (!h?.file) return null;
  const file = path.join(mapsDir, h.file);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  return makeHeights(h, new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2));
}
