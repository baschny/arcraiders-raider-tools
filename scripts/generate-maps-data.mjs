#!/usr/bin/env node
// Generates the data of the /maps page into public/data/map-data/ from the map features build of embark-api.
// The output is committed like the other generated game data (a game patch means: rebuild in embark-api,
// regenerate here, commit, deploy). It is not part of `npm run generate`, because it needs the embark-api build.
//
//   (in embark-api) node scripts/build-map-features.js
//   npm run generate:maps
//
// embark-api is found through the env var EMBARK_API_DIR, by default as the sibling directory ../embark-api of this
// checkout (set it when working in a git worktree, e.g. EMBARK_API_DIR=~/src/embark-api npm run generate:maps).
//
// Output (public/data/map-data/):
//   index.json                     map list, items, loot tables, enemies, quests (`built` comes from the build)
//   maps/<map>.json                one per map; area (POI) pieces replaced by merged outlines
//   map-strings.<locale>.json      localized map strings, copied when the build has them (MAP-02)
//   icons/<key>.png                game UI icons (white on transparent, tinted in the browser)
//   tiles/<Texture>-<hash>/        WebP tile pyramids of the map textures (scripts/lib/map-tiles.mjs)
//
// Map images are cut from the full-size game textures of the embark-api game export when it is available, else
// from the build's 2048 px images (with a warning). Tile folders are named by a content hash of their source, so
// unchanged textures are not cut again, and folders no map references any more are removed. The output is
// deterministic: regenerating from the same build gives identical bytes. No single file may exceed 5 MB.
import fs from 'node:fs';
import path from 'node:path';
import { outlineRings } from './lib/area-outlines.mjs';
import { findSource, sourceIndex, tilesHash, writeTiles } from './lib/map-tiles.mjs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const root = path.resolve(import.meta.dirname, '..');
const embarkApi = path.resolve(process.env.EMBARK_API_DIR || path.join(root, '..', 'embark-api'));
const extract = path.join(embarkApi, 'data-game-extract', 'current');
const build = path.join(extract, 'map-features');
const textures = path.join(extract, 'textures', 'PioneerGame', 'Content', 'Pioneer');
const out = path.join(root, 'public', 'data', 'map-data');

if (!fs.existsSync(embarkApi)) {
  console.error(`embark-api not found at ${embarkApi}.\nSet EMBARK_API_DIR to your embark-api checkout (default: the sibling directory ../embark-api).`);
  process.exit(1);
}
if (!fs.existsSync(path.join(build, 'index.json'))) {
  console.error(`No map features build in ${build} — run node scripts/build-map-features.js in embark-api first.`);
  process.exit(1);
}

/** Output files written by this run (relative to `out`); everything else outside tiles/ is removed at the end. */
const written = new Set();
const writeOut = (rel, data) => {
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), data);
  written.add(rel);
};
// JSON keeps the key order of the build (which is deterministic; some objects are keyed lists whose order the page
// shows), compact, with a final newline.
const writeJson = (rel, value) => writeOut(rel, `${JSON.stringify(value)}\n`);

fs.mkdirSync(out, { recursive: true });

// ---- map image tiles
const mapTextures = path.join(textures, 'UI', 'Ingame', 'HUD', 'Map', 'Assets');
const sources = fs.existsSync(mapTextures)
  ? await sourceIndex(fs.readdirSync(mapTextures).filter((f) => /^T_InGameMap_.*\.png$/.test(f)).sort().map((f) => path.join(mapTextures, f)))
  : [];
if (!sources.length) console.warn(`WARNING: no map textures in ${mapTextures} (game export not mounted?) — tiling the 2048 px build images instead.`);
const tileSets = new Map(); // build image -> tile set
const byHash = new Map(); // content hash -> tile set (the build has some images twice under different names)
const usedTiles = new Map(); // tile set name -> meta
async function tileSet(image) {
  if (!tileSets.has(image)) {
    tileSets.set(image, (async () => {
      const built = path.join(build, image);
      const src = (await findSource(built, sources)) ?? built;
      if (sources.length && src === built) console.warn(`WARNING: ${image}: no matching game texture, tiling the build image`);
      const hash = tilesHash(src);
      if (!byHash.has(hash)) {
        byHash.set(hash, (async () => {
          const name = `${path.basename(src).replace(/\.[a-z]+$/i, '')}-${hash}`;
          const meta = await writeTiles(src, path.join(out, 'tiles', name));
          usedTiles.set(name, meta);
          console.log(`tiles ${name}: ${meta.size} px, ${meta.levels} levels, ${(meta.bytes / 1e6).toFixed(1)} MB${meta.cached ? ' (cached)' : ' (cut)'}`);
          return { tiles: `tiles/${name}`, size: meta.size, levels: meta.levels };
        })());
      }
      return byHash.get(hash);
    })());
  }
  return tileSets.get(image);
}

const index = JSON.parse(fs.readFileSync(path.join(build, 'index.json'), 'utf8'));
for (const m of index.maps) m.image = await tileSet(m.image);
writeJson('index.json', index);

// ---- maps: area (POI) pieces are replaced by their merged outline (scripts/lib/area-outlines.mjs).
const r4 = (x) => Math.round(x * 1e4) / 1e4;
let pieces = 0, rings = 0;
for (const file of fs.readdirSync(path.join(build, 'maps')).filter((f) => f.endsWith('.json')).sort()) {
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
  writeJson(`maps/${file}`, map);
}
console.log(`area outlines: ${pieces} pieces -> ${rings} rings`);

// ---- localized map strings (MAP-02), when the build has them
const stringFiles = fs.readdirSync(build).filter((f) => /^map-strings\..+\.json$/.test(f)).sort();
for (const f of stringFiles) writeJson(f, JSON.parse(fs.readFileSync(path.join(build, f), 'utf8')));
if (stringFiles.length) console.log(`map strings: ${stringFiles.length} locales`);

// Game UI icons (white on transparent, tinted in the browser). Export them in embark-api with:
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
// Icons missing in the game export (not mounted, not exported) keep their previous output, like the tile fallback.
const missing = [], kept = [];
for (const [key, rel] of Object.entries(icons)) {
  const file = path.join(textures, rel);
  const dest = `icons/${key}.png`;
  if (fs.existsSync(file)) writeOut(dest, fs.readFileSync(file));
  else if (fs.existsSync(path.join(out, dest))) { written.add(dest); kept.push(rel); }
  else missing.push(rel);
}
if (kept.length) console.warn(`WARNING: ${kept.length} icons not in the game export, keeping the previous output.`);
if (missing.length) console.warn(`WARNING: missing icons (export them in embark-api, see above):\n  ${missing.join('\n  ')}`);

// ---- remove what this run did not produce: stale JSON / icons, tile folders no map references any more
const files = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort()
  : [];
for (const f of files(out)) {
  if (f.startsWith(`tiles${path.sep}`) || written.has(f.split(path.sep).join('/'))) continue;
  fs.rmSync(path.join(out, f));
  console.log(`removed ${f}`);
}
for (const name of fs.readdirSync(path.join(out, 'tiles')).sort()) {
  if (usedTiles.has(name)) continue;
  fs.rmSync(path.join(out, 'tiles', name), { recursive: true });
  console.log(`removed tiles/${name}`);
}
for (const dir of fs.readdirSync(out, { recursive: true }).map(String).sort().reverse()) {
  const p = path.join(out, dir);
  if (fs.statSync(p).isDirectory() && !fs.readdirSync(p).length) fs.rmdirSync(p);
}

// ---- size summary; no single file over 5 MB (git and the page's fetches stay reasonable)
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const groups = { json: { n: 0, bytes: 0 }, icons: { n: 0, bytes: 0 }, tiles: { n: 0, bytes: 0 } };
const tooLarge = [];
for (const f of files(out)) {
  const bytes = fs.statSync(path.join(out, f)).size;
  const g = f.startsWith(`tiles${path.sep}`) ? 'tiles' : f.startsWith(`icons${path.sep}`) ? 'icons' : 'json';
  groups[g].n++;
  groups[g].bytes += bytes;
  if (bytes > MAX_FILE_BYTES) tooLarge.push(`${f} (${mb(bytes)})`);
}
const cut = [...usedTiles.values()].filter((m) => !m.cached).length;
console.log(`map data -> ${path.relative(root, out)}/ (built ${index.built ?? '?'})`);
for (const [g, { n, bytes }] of Object.entries(groups)) console.log(`  ${g.padEnd(6)} ${String(n).padStart(5)} files  ${mb(bytes).padStart(8)}`);
console.log(`  total  ${mb(Object.values(groups).reduce((a, g) => a + g.bytes, 0)).padStart(20)}  (${usedTiles.size} tile sets, ${cut} cut)`);
if (tooLarge.length) {
  console.error(`Files over ${MAX_FILE_BYTES / 1024 / 1024} MB:\n  ${tooLarge.join('\n  ')}`);
  process.exit(1);
}
