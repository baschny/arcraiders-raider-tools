// Shapes of the map features build (embark-api scripts/build-map-features.js, docs/Map-Features.md there).
// Positions are UV coordinates on the map texture (0..1), heights in cm. Index-based references (container, handler
// set, POI, enemy, ...) point into the arrays of the same file; -1 means "none".
// Names are English; `nameKey` / `titleKey` is the game string ("<table>/<key>") translated in
// map-strings.<locale>.json (see mapStrings.ts), missing when the game has no string for the name.

/** Position on the map texture: 0..1 from the left / top edge. */
export type UV = [u: number, v: number];

/** Map texture as a tile pyramid: tiles/<name>/<z>/<x>-<y>.webp, 512 px tiles, level z has 2^z × 2^z tiles. */
export interface TileSet {
  tiles: string;
  /** Full resolution (px). */
  size: number;
  levels: number;
}

export interface MapIndexEntry {
  map: string;
  name: string;
  nameKey?: string;
  difficulty: number | null;
  file: string;
  image: TileSet;
}

/**
 * A loot item of the game's loot tables. Public data holds no asset ids or internal names: the item is identified by
 * its raider-tools slug (only loot items with one are shipped).
 */
export interface LootItem {
  /** English display name; missing when the game files have none. */
  name?: string;
  /** raider-tools item id (slug): the join key to the items of the site. */
  slug: string;
  /** Drop tags without the Item.Drop. prefix. */
  tags?: string[];
  conditions: Record<string, { excluded: string | null; maps: string[] }>;
}

export interface LootTableEntry {
  /** Item query of the entry. */
  q: string;
  /** Indexes into MapIndex.items. */
  items: number[];
}

export interface EnemyType {
  name: string;
  nameKey?: string;
  fly: boolean;
}

/** Enemy kind in a group: index into MapIndex.enemies, and how many spawn. */
export type EnemyGroupKind = [enemy: number, min: number, max: number];

export interface EnemyGroup {
  /** Weight of the group within its list. */
  w: number;
  kinds: EnemyGroupKind[];
}

export interface EnemyTable {
  lists: EnemyGroup[][];
  byDifficulty?: Record<string, EnemyGroup[]>;
}

export interface QuestObjective {
  text: string;
  type: string | null;
  amount?: number;
}

export interface Quest {
  name: string;
  owner: string;
  cadence: string;
  maps: string[];
  objectives: QuestObjective[];
}

export interface MapIndex {
  /** Format version of index.json and maps/*.json (see MAP_SCHEMA_VERSION in schema.ts). */
  schemaVersion: number;
  /** Steam depot manifest id of the game files. */
  manifest: string;
  /** Game release name (e.g. "1.45.0"), when known. */
  gameVersion: string | null;
  /** Build time (ISO 8601). */
  built: string;
  maps: MapIndexEntry[];
  items: LootItem[];
  tables: Record<string, LootTableEntry[]>;
  enemies: EnemyType[];
  enemyTables: Record<string, EnemyTable>;
  /** Container tag -> 'always' or the conditions (name -> excluded reason | null) whose data layer holds it. */
  containerConditions: Record<string, 'always' | Record<string, string | null>>;
  quests: Quest[];
  /** All conditions, offered and excluded (missing in older builds): look up the names used in `also` and item conditions. */
  conditions?: ConditionInfo[];
}

/** A map condition of the whole game (MapIndex.conditions). */
export interface ConditionInfo {
  key: string;
  name: string;
  nameKey?: string;
  category: 'normal' | 'major' | 'minor';
  /** Why it is not offered (not in rotation, ...). */
  excluded?: string;
}

export interface MapCondition {
  key: string;
  name: string;
  nameKey?: string;
  category: 'normal' | 'major' | 'minor';
  /** In the live schedule. */
  live: boolean;
  /** Data layers (Socket data layer indexes) active under this condition. */
  layers: number[];
  /** Conditions with the same loot and spawns on this map, folded into this one (only on Normal). */
  also?: string[];
}

export interface LootHandler {
  id: string;
  /** Number of sockets the handler fills. */
  sockets: number;
  /** Extra loot tables whose assets are server-only. */
  serverTables: number;
  /** Value pools: value split over the tables (t: MapIndex.tables key, x: weight multiplier, c: condition indexes). */
  pools: { value: number; tables: { t: string; x?: number; c: number[] }[] }[];
}

export interface Poi {
  title: string;
  titleKey?: string;
  themes: string[];
  threat: string | null;
  ids: string[];
  /** Merged outline of the area's pieces: outer rings and holes (even-odd), from the sync step. */
  outline: UV[][];
}

/**
 * Loot socket (a spot that loot spawns in).
 * - container: index into MapData.containers, -1 ground loot
 * - handlerSet: index into MapData.handlerSets (the loot handlers that fill it)
 * - poi: index into MapData.pois, -1 outside named areas
 * - dataLayer: condition data layer (MapCondition.layers) it only exists in, -1 always present
 * - poiVolume: index into the POI's `ids` (the volume it is in), -1 none
 */
export type Socket = [u: number, v: number, z: number, container: number, handlerSet: number, poi: number, dataLayer: number, poiVolume: number];
/** Dynamic spawner or fixed map feature; classSet indexes MapData.spawnerClasses and MapData.spawnerShares. */
export type Spawner = [u: number, v: number, classSet: number];
/**
 * ARC enemy spawner.
 * - enemyClass: index into MapData.enemyClasses
 * - table: key of MapIndex.enemyTables, null unknown
 * - profile: index into MapData.enemyProfiles (respawn timing)
 * - paths: indexes into MapData.enemyPaths (patrol paths)
 */
export type EnemySpawner = [u: number, v: number, z: number, enemyClass: number, table: string | null, profile: number, paths: number[]];
/**
 * Map layer and height of a point.
 * - layer: 0 surface, 1 underground (or upper floor, see MapData.layers)
 * - height: above the estimated ground in dm, null unknown
 * - covered: 1 something above (roof, floor, overhang), 0 open sky
 */
export type Level = [layer: number, height: number | null, covered: number];

export interface QuestMarker {
  /** Kind: quest area (outline), interactable or quest item spawn. */
  k: 'area' | 'interact' | 'spawn';
  uv: UV;
  z: number;
  cls?: string;
  prompt?: string;
  title?: string;
  polygons?: UV[][];
  /** Present only under these conditions. */
  only?: string[];
  /** Absent under these conditions. */
  not?: string[];
  /** Active in a round with this chance (missing: always). */
  p?: number;
}

/** Area label of the in-game map. */
export interface MapArea {
  name: string;
  nameKey?: string;
  uv: UV;
  zoom: number;
  /** Map layer (see Level). */
  layer: number;
}

export interface MapLayer {
  name: string;
  image: TileSet;
  sockets: number;
}

/** Activity that spawns min..max of its n members per round. */
export interface ActivityGroup {
  label: string;
  min: number;
  max: number;
  n: number;
}

export interface MapData {
  map: string;
  name: string;
  nameKey?: string;
  image: TileSet;
  /** World position and size (cm) of the texture. */
  world: [x: number, y: number, sizeX: number, sizeY: number];
  /** Playable area outlines. */
  bounds: UV[][];
  conditions: MapCondition[];
  /** Spawn chance per [condition][spawner]. */
  spawnP: number[][];
  /** Activity group (index into groups, -1 none) per [condition][spawner]. */
  spawnG: number[][];
  /** Activity group per spawner (first one; per condition see spawnG). */
  spawnerGroups: number[];
  /** POI per spawner (map features only, -1 none). */
  spawnerPois: number[];
  groups: ActivityGroup[];
  handlers: LootHandler[];
  /** Handler indexes per set (Socket handlerSet). */
  handlerSets: number[][];
  /** Container tags without Socket.LootContainer. (Socket container). */
  containers: string[];
  pois: Poi[];
  sockets: Socket[];
  /** Classes of a spawner class set, "A | B" (a spawn picks one). */
  spawnerClasses: string[];
  /** Share of each class in spawnerClasses (1 each for map features). */
  spawnerShares: number[][];
  spawners: Spawner[];
  enemyClasses: string[];
  enemyProfiles: Record<string, number | boolean>[];
  enemySpawners: EnemySpawner[];
  enemyPaths: UV[][];
  /** Spawn chance per [condition][enemy spawner]. */
  enemyP: number[][];
  /** Activity group per [condition][enemy spawner]. */
  enemyG: number[][];
  /** Activity group per enemy spawner. */
  enemyGroups: number[];
  quests: QuestMarker[];
  areas: MapArea[];
  layers: MapLayer[] | null;
  /** Level per socket, spawner, enemy spawner and quest marker; map layer per POI. */
  levels: { sockets: Level[]; spawners: Level[]; enemies: Level[]; quests: Level[]; pois: number[] };
}
