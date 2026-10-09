/**
 * Generates the weapon-stencil colour swatches shown on the what's-new crafting tab as WebP (quality 90).
 *
 * The swatches are composed from the game's stencil icon materials by embark-api's
 * `scripts/compose-stencil-swatches.py` (colours, patterns and coverage come from the real
 * `MI_<Skin>_Icon` instances; the diagonal layout is a reconstruction, see that script's header).
 *
 * Input:  EMBARK_API_DIR/data-game-extract/current/ui/stencils/<Skin>.png
 * Output: IMAGES_OUT/whats-new/stencils/<stencil-slug>.webp (IMAGES_OUT defaults to public/images).
 */
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { EMBARK_API_DIR } from './gamedata/arcData';
import { defaultImagesDir } from './gamedata/icons';

const WEBP_QUALITY = 90;
const INPUT_DIR = path.join(EMBARK_API_DIR, 'data-game-extract', 'current', 'ui', 'stencils');

/** Stencil slug (public/data/game/stencils.json) → item skin folder name in the game files. */
const STENCILS: Record<string, string> = {
  garnet: 'CommonRed',
  verdigris_itemskin_commonblue: 'CommonBlue',
  ochre: 'CommonYellow',
  slipstream: 'Corto',
  milky_terraccota: 'DustStrokeCamo',
  empyrean: 'Banshee',
  serac: 'Yeti',
  cerulean_itemskin_muraltree: 'MuralTree',
  fortuna: 'StationMaster',
  dragons_breath: 'Renzo',
  tortoise_itemskin_tortoiseshell: 'Tortoiseshell',
  bulwark_itemskin_outlander: 'Outlander',
  dusty_camo: 'OrganicIsland',
  sacrifice_itemskin_bells: 'Bells',
};

async function main(): Promise<void> {
  const outDir = path.join(defaultImagesDir(), 'whats-new', 'stencils');
  fs.mkdirSync(outDir, { recursive: true });

  const missing: string[] = [];
  for (const [slug, skin] of Object.entries(STENCILS)) {
    const input = path.join(INPUT_DIR, `${skin}.png`);
    if (!fs.existsSync(input)) {
      missing.push(`${slug}: missing ${input}`);
      continue;
    }
    const buf = await sharp(input).webp({ quality: WEBP_QUALITY }).toBuffer();
    fs.writeFileSync(path.join(outDir, `${slug}.webp`), buf);
    console.log(`${slug}.webp  ${buf.length} bytes`);
  }

  if (missing.length) throw new Error(`Stencil swatches not found (run embark-api scripts/compose-stencil-swatches.py):\n${missing.join('\n')}`);
  console.log(`Wrote ${Object.keys(STENCILS).length} stencil swatches to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
