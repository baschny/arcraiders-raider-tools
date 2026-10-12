// Puzzle sigil images for the map page (S22). The game ships the wall sigils as red decal masks
// (`T_Mural_<N>_X`, red strokes on black); in game they are white graffiti on the stone wall, so the
// masks are recoloured here at generation time: the stroke coverage becomes the alpha channel, the
// strokes get the graffiti colour, the background stays fully transparent. The page draws them like
// the other game icons (white on transparent, tinted in the browser; see `data/useMapData.ts`).
//
//   symbols/<key>.webp        one per `symbols[].key` of a map (`mural-78`), referenced by the map JSON
//
// The source textures come from the embark-api game export; if it is not mounted the previous output is
// kept (like the map icons) and stale sigils are removed by the generator.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** Output size and WebP quality; the masks are 128² and the page shows a sigil at up to ~30 px. */
export const SYMBOL_SIZE = 128;
const WEBP_QUALITY = 90;
/** Warm white of the in-game graffiti (pure white reads cold over the map's blue-grey backdrop). */
const SIGIL_COLOR = { r: 0xf5, g: 0xf0, b: 0xe6 };

/** `MaterialLibrary/Textures/Decals/Grafitti/<texture>.png` under the game export's `Pioneer` texture root. */
export const symbolSourcePath = (textureRoot, texture) =>
  path.join(textureRoot, 'MaterialLibrary', 'Textures', 'Decals', 'Grafitti', `${texture}.png`);

/**
 * Recolours one red decal mask to a white-on-transparent WebP; null when the source cannot be decoded.
 * The stroke coverage is the maximum channel — the red channel of a red-on-black mask, robust against a
 * colour cast in the edges — so thin, antialiased strokes stay visible instead of fading out (the
 * luminance of pure red is only ~1/5, which would keep the sigils barely opaque).
 */
export async function recolourMask(source) {
  let raw;
  try {
    raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
  const { width, height, channels } = raw.info;
  const px = Buffer.alloc(width * height * 4);
  const { r, g, b } = SIGIL_COLOR;
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    px[d] = r;
    px[d + 1] = g;
    px[d + 2] = b;
    px[d + 3] = Math.max(raw.data[s], raw.data[s + 1], raw.data[s + 2]);
  }
  return sharp(px, { raw: { width, height, channels: 4 } })
    .resize(SYMBOL_SIZE, SYMBOL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/** Existing sigil output, kept when the game export is not mounted. */
export const symbolOutputExists = (out, key) => fs.existsSync(path.join(out, 'symbols', `${key}.webp`));
