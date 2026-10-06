// Map texture tiles for the map page, cut at generation time: a pyramid of 512 px WebP tiles per texture, from the
// whole map in one tile (level 0) down to the texture's full resolution (level 3 for the game's 4096² map textures).
// The page loads only the tiles in view at the level that matches the zoom.
//
//   tiles/<name>-<hash>/meta.json       { size, levels, source, tiles, bytes }
//   tiles/<name>-<hash>/<z>/<x>-<y>.webp
//
// <hash> is a short content hash of the source texture and the tiling settings, so a changed texture (or encoding)
// gets a new URL and the tile folders can be served as immutable. A folder that already holds a meta.json was cut
// from exactly that input and is reused as it is.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const TILE = 512;
const QUALITY = 78;
/** Bump when the tile encoding changes in a way the settings below do not capture (new URLs for every tile set). */
const TILES_VERSION = 1;

/** Short content hash of a source texture and the tiling settings (the `<hash>` of its tile folder). */
export function tilesHash(src) {
  return crypto.createHash('sha256')
    .update(`tiles v${TILES_VERSION} ${TILE} q${QUALITY}\n`)
    .update(fs.readFileSync(src))
    .digest('hex')
    .slice(0, 10);
}

/** Small grey thumbnail, to find the source texture of a built map image by its content. */
const thumb = (file) => sharp(file).resize(48, 48, { fit: 'fill' }).greyscale().raw().toBuffer();

/** Mean absolute difference (0..255) of two thumbnails. */
const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

/**
 * Index of candidate source textures: [{ file, thumb }]. Resolution does not matter for the match, so the full-size
 * game textures can stand in for the downscaled images of the map features build.
 */
export async function sourceIndex(files) {
  return Promise.all(files.map(async (file) => ({ file, thumb: await thumb(file) })));
}

/** Best matching source texture of a map image, or null if none is close enough (other game version, ...). */
export async function findSource(image, index, maxDiff = 6) {
  const t = await thumb(image);
  let best = null;
  for (const c of index) {
    const d = diff(t, c.thumb);
    if (!best || d < best.d) best = { file: c.file, d };
  }
  return best && best.d <= maxDiff ? best.file : null;
}

/**
 * Cut the tile pyramid of `src` into `dir` (`<name>-<hash>`, see tilesHash). Skipped when `dir` already holds a complete set
 * (meta.json is written last).
 */
export async function writeTiles(src, dir) {
  const metaFile = path.join(dir, 'meta.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.size && meta.levels && meta.tiles) return { ...meta, cached: true };
  } catch { /* not cut yet, or cut was interrupted */ }

  fs.rmSync(dir, { recursive: true, force: true });
  const img = sharp(src, { limitInputPixels: false });
  const { width, height } = await img.metadata();
  if (width !== height) throw new Error(`${src}: map textures are square, got ${width}×${height}`);
  const { isOpaque } = await img.stats();
  const levels = Math.max(1, Math.round(Math.log2(width / TILE)) + 1);
  let bytes = 0, count = 0;
  for (let z = 0; z < levels; z++) {
    const n = 2 ** z, px = TILE * n;
    let level = sharp(src, { limitInputPixels: false });
    if (isOpaque) level = level.removeAlpha();
    if (px !== width) level = level.resize(px, px, { kernel: 'lanczos3' });
    const { data, info } = await level.raw().toBuffer({ resolveWithObject: true });
    fs.mkdirSync(path.join(dir, String(z)), { recursive: true });
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const file = path.join(dir, String(z), `${x}-${y}.webp`);
        await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE })
          .webp({ quality: QUALITY, effort: 5, alphaQuality: 80 })
          .toFile(file);
        bytes += fs.statSync(file).size;
        count++;
      }
    }
  }
  const meta = { size: width, levels, source: path.basename(src), tiles: count, bytes };
  fs.writeFileSync(metaFile, `${JSON.stringify(meta)}\n`);
  return meta;
}
