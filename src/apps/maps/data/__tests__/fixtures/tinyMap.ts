// Hand-written map data for the unit tests: one tiny index and one map, small enough to work out every score by
// hand (the expected numbers in scoring.test.ts are derived in comments there).
import { MAP_SCHEMA_VERSION } from '../../schema';
import type { LootItem, MapData, MapIndex, Socket } from '../../types';

const item = (name: string, slug: string | undefined, tags: string[]): LootItem => ({ name, asset: `DA_Item_${name.replace(/\W/g, '')}`, slug, tags, conditions: {} });

/** Item indexes into TINY_INDEX.items. */
export const LEMON = 0, METAL = 1, WIRES = 2, DUCK = 3, TRINKET = 4, CANDLEBERRIES = 5;

export const TINY_INDEX: MapIndex = {
  schemaVersion: MAP_SCHEMA_VERSION,
  manifest: '1',
  gameVersion: null,
  built: '2026-10-06T00:00:00Z',
  maps: [],
  items: [
    item('Lemon', 'lemon', ['Category.Area.Nature']),
    item('Metal Parts', 'metal_parts', ['Category.Area.Industrial']),
    item('Wires', 'wires', ['Category.Area.Technological']),
    // No area tag: any container except the nature spots.
    item('Rubber Duck', 'rubber_duck', []),
    // Bird-nest trinket: its name does not match a container, the Birdnest tag sends it to bird nests.
    item('Shiny Trinket', 'shiny_trinket', ['Category.Area.Nature', 'Trinket.Birdnest']),
    // No slug: joined by English name.
    item('Candleberries', undefined, ['Category.Area.Nature']),
  ],
  tables: {
    // METAL: 1/2 + 1/2 · 1/2 = 0.75, DUCK: 1/2 · 1/2 = 0.25
    T1: [{ q: 'a', items: [METAL] }, { q: 'b', items: [METAL, DUCK] }],
    // 0.25 each
    T2: [{ q: 'c', items: [WIRES] }, { q: 'd', items: [LEMON] }, { q: 'e', items: [DUCK] }, { q: 'f', items: [TRINKET] }],
  },
  enemies: [
    { key: 'Wasp', name: 'Wasp', fly: true },
    { key: 'Hornet', name: 'Hornet', fly: true },
    { key: 'Rocketeer', name: 'Rocketeer', fly: true },
  ],
  enemyTables: {
    // One list, weights 3:1.
    A: { lists: [[{ w: 3, kinds: [[0, 1, 2]] }, { w: 1, kinds: [[0, 1, 1], [1, 1, 1]] }]] },
    // Two tiers, averaged.
    B: { lists: [[{ w: 1, kinds: [[0, 1, 1]] }], [{ w: 1, kinds: [[2, 1, 1]] }]] },
    // Only per difficulty, no weights: groups count equally.
    C: { lists: [], byDifficulty: { 1: [{ w: 0, kinds: [[1, 1, 1]] }, { w: 0, kinds: [[2, 1, 1]] }] } },
    // The same enemy twice in a group counts once.
    D: { lists: [[{ w: 5, kinds: [[0, 1, 1], [0, 2, 2]] }]] },
  },
  containerConditions: {
    'Industrial.Lockers.Door': 'always',
    'Nature.Lemon': 'always',
    'Nature.Candleberries': { 'Cold Snap': null, Hurricane: 'not in the schedule' },
  },
  quests: [],
};

/** Condition 0: Default (no data layers); 1: Night (data layer 0). */
export const DEFAULT = 0, NIGHT = 1;

// u, v, z, container, handlerSet, poi, dataLayer, poiVolume
const sockets: Socket[] = [
  [0.1, 0.1, 0, 0, 0, 0, -1, -1], // 0 Industrial lockers, set 0, POI 0
  [0.2, 0.2, 0, 7, 0, 0, -1, -1], // 1 Industrial toolbox, set 0, POI 0
  [0.3, 0.3, 0, 1, 1, -1, -1, -1], // 2 Tech computer, set 1
  [0.4, 0.4, 0, 2, 1, -1, -1, -1], // 3 Lemon tree, set 1
  [0.5, 0.5, 0, 3, 2, 1, -1, -1], // 4 Water tank, set 2, POI 1
  [0.6, 0.6, 0, 4, 1, 1, -1, -1], // 5 Bird nest, set 1, POI 1
  [0.7, 0.7, 0, 5, 1, -1, -1, -1], // 6 Mushroom, set 1
  [0.8, 0.8, 0, -1, 2, 1, -1, -1], // 7 Ground loot, set 2, POI 1
  [0.9, 0.9, 0, 0, 0, -1, 0, -1], // 8 Industrial lockers, set 0, only in data layer 0 (Night)
];

export const TINY_MAP: MapData = {
  map: 'Tiny_01',
  name: 'Tiny',
  image: { tiles: 'Tiny-0000', size: 2048, levels: 3 },
  world: [0, 0, 100000, 100000],
  bounds: [],
  conditions: [
    { key: 'Default', name: 'Normal', category: 'normal', live: true, layers: [] },
    { key: 'Night', name: 'Night Raid', category: 'major', live: true, layers: [0] },
  ],
  spawnP: [[1, 1, 1], [1, 1, 1]],
  spawnG: [[-1, -1, -1], [-1, -1, -1]],
  spawnerGroups: [-1, -1, -1],
  spawnerPois: [-1, -1, -1],
  groups: [],
  handlers: [
    // T1 under both conditions, T2 under Default only; split over 2 sockets.
    { id: 'H0', sockets: 2, serverTables: 0, pools: [{ value: 10, tables: [{ t: 'T1', c: [0, 1] }, { t: 'T2', c: [0] }] }] },
    // T2 with weight multiplier 2 under both conditions; split over 4 sockets.
    { id: 'H1', sockets: 4, serverTables: 0, pools: [{ value: 8, tables: [{ t: 'T2', x: 2, c: [0, 1] }] }] },
  ],
  handlerSets: [[0], [1], [0, 1]],
  containers: [
    'Industrial.Lockers.Door', // 0
    'Tech.Computer', // 1
    'Nature.Lemon', // 2
    'Nature.WaterTank', // 3
    'Nature.BirdNest', // 4
    'Nature.Mushroom', // 5
    'Weird.Thing', // 6 (unknown category)
    'Industrial.Toolbox', // 7
  ],
  pois: [
    { title: 'Depot', themes: [], threat: null, ids: [], outline: [] },
    { title: 'Garden', themes: [], threat: null, ids: [], outline: [] },
  ],
  sockets,
  spawnerClasses: [
    'BP_RaiderCache_WA_C | BP_SocketContainer_Raider_AmmoBox_01_Lid_A_Dynamic',
    'LockedDoor | Key:Key_A | Key:Key_B',
    'BP_Unknown_Thing_C',
  ],
  spawnerShares: [[0.25, 0.75], [1, 1, 1], [1]],
  spawners: [[0.1, 0.1, 0], [0.2, 0.2, 1], [0.3, 0.3, 2]],
  enemyClasses: [],
  enemyProfiles: [],
  enemySpawners: [],
  enemyPaths: [],
  enemyP: [],
  enemyG: [],
  enemyGroups: [],
  quests: [],
  areas: [],
  layers: null,
  levels: { sockets: [], spawners: [], enemies: [], quests: [], pois: [] },
};
