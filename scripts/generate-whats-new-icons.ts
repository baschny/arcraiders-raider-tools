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

const ICON_SIZE = 128;
const WEBP_QUALITY = 90;
const TEXTURE_ROOT = path.join(EMBARK_API_DIR, 'data-game-extract', 'current', 'textures', 'PioneerGame', 'Content', 'Pioneer');

/** Glyph name → texture path relative to TEXTURE_ROOT (see docs/research/whats-new-new-items-r3.md). */
const GLYPHS: Record<string, string> = {
  outpost: 'UI/Assets/Icons/T_UI_Icon_ActiveShelter.png',
  'research-station': 'UI/Assets/Crafting/T_UI_Icon_Research_Station.png',
  'research-points': 'Items/Currency/ResearchPoints/T_UI_Icon_Currency_ResearchPoints.png',
  research: 'UI/Assets/ItemCategories/T_UI_Category_Research.png',
  blueprint: 'UI/Assets/Icons/T_UI_Icon_Blueprint.png',
  amplified: 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_Amplified.png',
  gunsmith: 'UI/Assets/ItemCategories/T_UI_ItemCategory_Weapon.png',
  crafting: 'UI/Assets/ItemCategories/T_UI_Utility_Tool.png',
  workbench: 'UI/Assets/ItemCategories/T_UI_ItemCategory_Station.png',
  stencil: 'UI/Assets/ItemCategories/T_UI_Category_Stencil.png',
  decoration: 'UI/Assets/ItemCategories/T_UI_Category_Decoration.png',
  gadget: 'UI/Assets/ItemCategories/T_UI_ItemCategory_Gadget.png',
  key: 'UI/Assets/ItemCategories/T_UI_Utility_Key.png',
  beacon: 'UI/Assets/Icons/T_UI_Icon_Transmitter.png',
  trade: 'UI/Assets/Icons/T_UI_Icon_Exchange.png',
  'skill-in-round-crafting': 'UI/Assets/Icons/Progression/T_UI_CharProg_InroundCraft.T_UI_CharProg_InRoundCraft.png',
  'skill-traveling-tinkerer': 'UI/Assets/Icons/Progression/T_UI_CharProg_InroundCraftMore.png',
  'skill-nomadic-crafting': 'UI/Assets/Icons/Progression/T_UI_CharProg_SuperFieldCrafting.png',
  // Amplification icons (Ascended_upgrades); one glyph per distinct texture.
  'amp-anti-shield': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_AntiShieldRounds.png',
  'amp-anti-weak-point': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_ArcWeakPoint.png',
  'amp-burst-fire': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_Burst_03.png',
  'amp-increased-burst': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_BurstFirst.png',
  'amp-carbine-conversion': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_CarbineConversion.png',
  'amp-drum-mag': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_DrumMag.png',
  'amp-x-rounds': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_ExplosiveRounds.png',
  'amp-full-auto': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_FullAuto.png',
  'amp-incendiary-rounds': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_IncendiaryAmmo.png',
  'amp-incendiary-grenades': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_IncendiaryGranadeAmmo.png',
  'amp-high-velocity': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_Increase_Velocity.png',
  'amp-increased-burst-plus': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_IncreasedBurst_plus.png',
  'amp-bigger-mag': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_IncreaseMag.png',
  'amp-mag-reload': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_MagReload_00.png',
  'amp-charged-burst': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_MagReload_01.png',
  'amp-more-reload': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_MoreBulletsReload.png',
  'amp-anvil-splitter': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_ProjectileSplitter.png',
  'amp-ramping-damage': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_RampingDamage.png',
  'amp-scoped': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_ScopeVariant.png',
  'amp-semi-auto': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_SemiAuto.png',
  'amp-slug-rounds': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_SlugRounds.png',
  'amp-sprint-shooting': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_SprintShooting.png',
  'amp-straight-bolt': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_StraightBolt.png',
  'amp-tracker-rounds': 'UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_TrackerRonds.png',
};

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
