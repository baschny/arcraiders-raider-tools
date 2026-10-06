#!/usr/bin/env node
// Copies the map features build of ../embark-api into public/data/map-proto/ for the /maps prototype.
// The output is git-ignored: it contains game art (map textures, UI icons) and changes with every game update.
// Map images become WebP tile pyramids (scripts/lib/map-tiles.mjs), cut from the full-size game textures when the
// game export is available (else from the build's 2048 px images); tiles are kept between runs and only recut when
// their source changes.
//
//   (in ../embark-api) node scripts/build-map-features.js
//   npm run sync:map-proto
import fs from 'node:fs';
import path from 'node:path';
import { outlineRings } from './lib/area-outlines.mjs';
import { findSource, sourceIndex, writeTiles } from './lib/map-tiles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const extract = path.resolve(root, '..', 'embark-api', 'data-game-extract', 'current');
const build = path.join(extract, 'map-features');
const textures = path.join(extract, 'textures', 'PioneerGame', 'Content', 'Pioneer');
const out = path.join(root, 'public', 'data', 'map-proto');

if (!fs.existsSync(path.join(build, 'index.json'))) {
  console.error(`No map features build in ${build} — run node scripts/build-map-features.js in ../embark-api first.`);
  process.exit(1);
}

// Everything but the tile cache is rewritten.
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f !== 'tiles') fs.rmSync(path.join(out, f), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

// ---- map image tiles
const mapTextures = path.join(textures, 'UI', 'Ingame', 'HUD', 'Map', 'Assets');
const sources = fs.existsSync(mapTextures)
  ? await sourceIndex(fs.readdirSync(mapTextures).filter((f) => /^T_InGameMap_.*\.png$/.test(f)).map((f) => path.join(mapTextures, f)))
  : [];
if (!sources.length) console.warn(`No map textures in ${mapTextures} (game export not mounted?) — tiling the 2048 px build images instead.`);
const tileSets = new Map(); // build image -> tile set
const usedTiles = new Map(); // tile set name -> bytes
async function tileSet(image) {
  if (!tileSets.has(image)) {
    tileSets.set(image, (async () => {
      const built = path.join(build, image);
      const src = (await findSource(built, sources)) ?? built;
      if (sources.length && src === built) console.warn(`${image}: no matching game texture, tiling the build image`);
      const name = path.basename(src).replace(/\.[a-z]+$/, '');
      const cut = usedTiles.has(name);
      const meta = await writeTiles(src, path.join(out, 'tiles', name));
      usedTiles.set(name, meta.bytes);
      if (!cut) console.log(`tiles ${name}: ${meta.size} px, ${meta.levels} levels, ${(meta.bytes / 1e6).toFixed(1)} MB${meta.cached ? ' (cached)' : ''}`);
      return { tiles: `tiles/${name}`, size: meta.size, levels: meta.levels };
    })());
  }
  return tileSets.get(image);
}

const index = JSON.parse(fs.readFileSync(path.join(build, 'index.json'), 'utf8'));
for (const m of index.maps) m.image = await tileSet(m.image);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
// Maps: area (POI) pieces are replaced by their merged outline (scripts/lib/area-outlines.mjs).
fs.mkdirSync(path.join(out, 'maps'));
const r4 = (x) => Math.round(x * 1e4) / 1e4;
let pieces = 0, rings = 0;
for (const file of fs.readdirSync(path.join(build, 'maps'))) {
  const map = JSON.parse(fs.readFileSync(path.join(build, 'maps', file), 'utf8'));
  map.image = await tileSet(map.image);
  for (const layer of map.layers ?? []) layer.image = await tileSet(layer.image);
  const fill = 400 / (map.world?.[2] || 2e5); // fill notches and gaps under ~8 m between an area's pieces
  for (const poi of map.pois) {
    poi.outline = outlineRings(poi.polygons, fill).map((ring) => ring.map(([u, v]) => [r4(u), r4(v)]));
    pieces += poi.polygons.length;
    rings += poi.outline.length;
    delete poi.polygons;
    delete poi.polyIds;
  }
  fs.writeFileSync(path.join(out, 'maps', file), JSON.stringify(map));
}
console.log(`area outlines: ${pieces} pieces -> ${rings} rings`);
for (const name of fs.readdirSync(path.join(out, 'tiles'))) if (!usedTiles.has(name)) fs.rmSync(path.join(out, 'tiles', name), { recursive: true });
console.log(`map tiles: ${usedTiles.size} textures, ${([...usedTiles.values()].reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} MB`);

// Game UI icons (white on transparent, tinted in the browser). Export them in ../embark-api with:
//   scripts/arc-explorer export-textures '(Pioneer/UI/Assets/Icons/(T_|Map/|Map_Conditions/)|Core/UI/UI_Elements/Icons/(Map|Enemies|Ping)/|Pioneer/UI/Assets/Enemies/)'
const MAP = 'Core/UI/UI_Elements/Icons/Map/';
const PING = 'Core/UI/UI_Elements/Icons/Ping/';
const ENEMY = 'Core/UI/UI_Elements/Icons/Enemies/';
const ICONS = 'UI/Assets/Icons/';
const ENEMY2 = 'UI/Assets/Enemies/';
const icons = {
  'extract-hatch': `${ICONS}T_UI_Icons_ExtractHatch.png`,
  'extract-lift': `${ICONS}T_UI_Icons_ExtractLift.png`,
  'extract-metro': `${ICONS}T_UI_Icons_ExtractMetro.png`,
  'extract-fan': `${ICONS}T_UI_Icon_Extraction_Fan.png`,
  'metro-entrance': `${MAP}T_UI_Icon_Extraction-Metro.png`,
  player: `${MAP}T_UI_Icon_General-Player.png`,
  'field-station': `${MAP}T_UI_Icon_Map_Field-Station.png`,
  'supply-station': `${MAP}T_UI_Icon_Map_Supply-Station.png`,
  'field-crate': `${MAP}T_UI_Icon_Map_Field-Crate.png`,
  'raider-cache': `${MAP}T_UI_Icon_Map_Raider-Cache.png`,
  'arc-wreckage': `${MAP}T_UI_Icon_Map_Arc-Wreckage.png`,
  'arc-probe': `${MAP}T_UI_Icon_Event-ARC-Probe.png`,
  'raider-supply': `${MAP}T_UI_Icon_Event-Raider-Supply.png`,
  pin: `${MAP}T_UI_Icon_General-Map-Pin.png`,
  quest: `${MAP}T_UI_Icon_Quest.png`,
  'quest-visit': `${ICONS}T_UI_QUEST_Visit.png`,
  'quest-kill': `${ICONS}T_UI_QUEST_Kill.png`,
  'loot-arc': `${MAP}T_UI_Icon_Loot_Arc.png`,
  'loot-commercial': `${MAP}T_UI_Icon_Loot_Commercial.png`,
  'loot-educational': `${MAP}T_UI_Icon_Loot_Educational.png`,
  'loot-exodus': `${MAP}T_UI_Icon_Loot_Exodus.png`,
  'loot-household': `${MAP}T_UI_Icon_Loot_Household.png`,
  'loot-industrial': `${MAP}T_UI_Icon_Loot_Industrial.png`,
  'loot-medical': `${MAP}T_UI_Icon_Loot_Medical.png`,
  'loot-military': `${MAP}T_UI_Icon_Loot_Military.png`,
  'loot-raider': `${MAP}T_UI_Icon_Loot_Raider.png`,
  'loot-electrical': `${MAP}T_UI_Icon_Loot-Electrical.png`,
  'loot-mechanical': `${MAP}T_UI_Icon_Loot-Mechanical.png`,
  'loot-nature': `${MAP}T_UI_Icon_Loot-Nature.png`,
  'loot-tech': `${MAP}T_UI_Icon_Loot-Technological.png`,
  door: `${ICONS}T_UI_Ping_Door.png`,
  puzzle: `${ICONS}T_Icon_Ping_Puzzle.png`,
  lock: `${ICONS}T_UI_Icon_Button-State_Locked.png`,
  'fuel-cell': `${ICONS}T_UI_Ping_FuelCell.png`,
  'fusion-core': `${ICONS}T_UI_Ping_FusionCore.png`,
  generator: `${ICONS}T_UI_Icon_System_Generator.png`,
  terminal: `${ICONS}T_UI_Icon_Activation_Terminal.png`,
  transmitter: `${ICONS}T_UI_Icon_Transmitter.png`,
  'enter-surface': `${ICONS}T_UI_Icon_EnterSurface.png`,
  payload: `${ICONS}T_UI_Icon_Payload.png`,
  harvest: `${ICONS}T_UI_Ping_Harvest.png`,
  bunker: `${ICONS}T_UI_Icon_System_Ping_Bunker.png`,
  boss: `${ICONS}T_UI_Icon_System_Objective_EnemyBoss.png`,
  region: `${ICONS}T_UI_Icon_Map_Region.png`,
  'locked-gate': `${ICONS}Map_Conditions/T_UI_Icon_LockedGate.png`,
  frost: `${ICONS}Map_Conditions/T_Icon_MapCondition_Frost.png`,
  audio: `${PING}T_UI_Ping_HeardAudio.png`,
  attack: `${PING}T_UI_Ping_Attack.png`,
  warning: `${PING}T_UI_Ping_Warning.png`,
  ammo: 'Core/UI/UI_Elements/Icons/TempOutpostIcons/T_UI_Temp_Icon_Ammo.png',
  // ARC enemies (ping icons)
  'e-leaper': `${ENEMY}T_UI_Ping_Enemy_Bison.png`,
  'e-camera': `${ENEMY}T_UI_Ping_Enemy_Camera.png`,
  'e-rocketeer': `${ENEMY}T_UI_Ping_Enemy_Drone_Heavy.png`,
  'e-wasp': `${ENEMY}T_UI_Ping_Enemy_Drone_Light.png`,
  'e-snitch': `${ENEMY}T_UI_Ping_Enemy_Drone_Scout.png`,
  'e-fireball': `${ENEMY}T_UI_Ping_Enemy_Fireball.png`,
  'e-queen': `${ENEMY}T_UI_Ping_Enemy_Peppermint.png`,
  'e-spotter': `${ENEMY}T_UI_Ping_Enemy_Pinger.png`,
  'e-pop': `${ENEMY}T_UI_Ping_Enemy_Pop.png`,
  'e-surveyor': `${ENEMY}T_UI_Ping_Enemy_Rollbot.png`,
  'e-matriarch': `${ENEMY}T_UI_Ping_Enemy_Spearmint.png`,
  'e-tick': `${ENEMY}T_UI_Ping_Enemy_Tick.png`,
  'e-turret': `${ENEMY}T_UI_Ping_Enemy_Turret.png`,
  'e-hornet': `${ENEMY2}T_UI_Enemy_Drone_Hornet.png`,
  'e-bombardier': `${ENEMY2}T_UI_Ping_Enemy_Bombardier.png`,
  'e-comet': `${ENEMY2}T_UI_Ping_Enemy_Boom.png`,
  'e-bastion': `${ENEMY2}T_UI_Ping_Enemy_Chonk.png`,
  'e-firefly': `${ENEMY2}T_UI_Ping_Enemy_Hornet_Flame.png`,
  'e-turbine': `${ENEMY2}T_UI_Ping_Enemy_Monolith.png`,
  'e-vaporizer': `${ENEMY2}T_UI_Ping_Enemy_Rocketeer_Laser.png`,
  'e-sentinel': `${ENEMY2}T_UI_Ping_Enemy_Sniper.png`,
  'e-shredder': `${ICONS}T_UI_Ping_Enemy_Shredder.png`,
};
const missing = [];
for (const [key, rel] of Object.entries(icons)) {
  const file = path.join(textures, rel);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(out, 'icons', `${key}.png`));
  else missing.push(rel);
}
if (missing.length) console.warn(`Missing icons (export them in ../embark-api, see above):\n  ${missing.join('\n  ')}`);

const size = (dir) => fs.readdirSync(dir, { recursive: true }).reduce((a, f) => {
  const s = fs.statSync(path.join(dir, String(f)));
  return a + (s.isFile() ? s.size : 0);
}, 0);
console.log(`map prototype data -> ${path.relative(root, out)}/ (${(size(out) / 1e6).toFixed(1)} MB, ${Object.keys(icons).length - missing.length} icons)`);
