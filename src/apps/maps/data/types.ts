// Shapes of the map features build (embark-api scripts/build-map-features.js, docs/Map-Features.md there).
// Positions are UV coordinates on the map texture (0..1), heights in cm.

export type UV = [number, number];

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
  difficulty: number | null;
  file: string;
  image: TileSet;
}

export interface LootItem {
  name: string;
  asset: string;
  id?: string;
  tags?: string[];
  conditions: Record<string, { excluded: string | null; maps: string[] }>;
}

export interface LootTableEntry {
  q: string;
  items: number[];
}

export interface EnemyType {
  key: string;
  name: string;
  fly: boolean;
}

export interface EnemyGroup {
  w: number;
  kinds: [number, number, number][]; // [enemy index, min, max]
}

export interface EnemyTable {
  lists: EnemyGroup[][];
  byDifficulty?: Record<string, EnemyGroup[]>;
}

export interface QuestObjective {
  text: string;
  type: string | null;
  assets: string[];
}

export interface Quest {
  id: number;
  name: string;
  owner: string;
  cadence: string;
  maps: string[];
  objectives: QuestObjective[];
}

export interface MapIndex {
  manifest: string;
  maps: MapIndexEntry[];
  items: LootItem[];
  tables: Record<string, LootTableEntry[]>;
  enemies: EnemyType[];
  enemyTables: Record<string, EnemyTable>;
  /** Container tag -> 'always' or the conditions (name -> excluded reason | null) whose data layer holds it. */
  containerConditions: Record<string, 'always' | Record<string, string | null>>;
  quests: Quest[];
}

export interface MapCondition {
  key: string;
  name: string;
  category: 'normal' | 'major' | 'minor';
  live: boolean;
  layers: number[];
  also?: string[];
}

export interface LootHandler {
  id: string;
  sockets: number;
  serverTables: number;
  pools: { value: number; tables: { t: string; x?: number; c: number[] }[] }[];
}

export interface Poi {
  title: string;
  themes: string[];
  threat: string | null;
  ids: string[];
  /** Merged outline of the area's pieces: outer rings and holes (even-odd), from the sync step. */
  outline: UV[][];
}

/** [u, v, z, container index (-1 ground loot), handler set, poi (-1), data layer (-1 always), poi volume] */
export type Socket = [number, number, number, number, number, number, number, number];
/** [u, v, class set index] */
export type Spawner = [number, number, number];
/** [u, v, z, class index, enemy table | null, timing profile, patrol path indexes] */
export type EnemySpawner = [number, number, number, number, string | null, number, number[]];
/** [map layer (0 surface / 1 underground or upper floor), height above ground in dm | null, covered (0/1)] */
export type Level = [number, number | null, number];

export interface QuestMarker {
  k: 'area' | 'interact' | 'spawn';
  a: string[];
  uv: UV;
  z: number;
  id: string;
  cls?: string;
  prompt?: string;
  title?: string;
  polygons?: UV[][];
  only?: string[];
  not?: string[];
  p?: number;
}

export interface MapArea {
  name: string;
  uv: UV;
  zoom: number;
  layer: number;
}

export interface MapLayer {
  name: string;
  image: TileSet;
  sockets: number;
}

export interface ActivityGroup {
  label: string;
  min: number;
  max: number;
  n: number;
}

export interface MapData {
  map: string;
  name: string;
  image: TileSet;
  /** World position and size (cm) of the texture: [x, y, sizeX, sizeY]. */
  world: [number, number, number, number];
  bounds: UV[][];
  conditions: MapCondition[];
  spawnP: number[][];
  spawnG: number[][];
  spawnerGroups: number[];
  spawnerPois: number[];
  groups: ActivityGroup[];
  handlers: LootHandler[];
  handlerSets: number[][];
  containers: string[];
  pois: Poi[];
  sockets: Socket[];
  spawnerClasses: string[];
  spawnerShares: number[][];
  spawners: Spawner[];
  enemyClasses: string[];
  enemyProfiles: Record<string, number | boolean>[];
  enemySpawners: EnemySpawner[];
  enemyPaths: UV[][];
  enemyP: number[][];
  enemyG: number[][];
  enemyGroups: number[];
  quests: QuestMarker[];
  areas: MapArea[];
  layers: MapLayer[] | null;
  levels: { sockets: Level[]; spawners: Level[]; enemies: Level[]; quests: Level[]; pois: number[] };
}
