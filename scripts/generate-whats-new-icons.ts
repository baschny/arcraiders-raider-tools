/**
 * Generates the white what's-new glyph icons (src/apps/whats-new/components/glyphs.ts)
 * from the game-file texture export as WebP with alpha, max 128px per side.
 *
 * Input:  EMBARK_API_DIR/data-game-extract/current/textures/PioneerGame/Content/Pioneer/<texture>.png
 * Output: IMAGES_OUT/whats-new/icons/<name>.webp (IMAGES_OUT defaults to public/images).
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { EMBARK_API_DIR } from './gamedata/arcData';
import { defaultImagesDir } from './gamedata/icons';
import { GLYPHS } from './gamedata/ampIcons';

const ICON_SIZE = 128;
const WEBP_QUALITY = 90;
const TEXTURE_ROOT = path.join(EMBARK_API_DIR, 'data-game-extract', 'current', 'textures', 'PioneerGame', 'Content', 'Pioneer');

async function main(): Promise<void> {
  const outDir = path.join(defaultImagesDir(), 'whats-new', 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  const failed: string[] = [];
  for (const [name, rel] of Object.entries(GLYPHS)) {
    const input = path.join(TEXTURE_ROOT, rel);
    if (!fs.existsSync(input)) {
      failed.push(`${name}: missing ${input}`);
      continue;
    }
    const buf = await sharp(input)
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
      .toBuffer();
    const output = path.join(outDir, `${name}.webp`);
    fs.writeFileSync(output, buf);
    console.log(`${name}.webp  ${buf.length} bytes`);
  }

  if (failed.length) throw new Error(`Glyph textures not found:\n${failed.join('\n')}`);
  console.log(`Wrote ${Object.keys(GLYPHS).length} glyph icons to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
