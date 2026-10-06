// What the map shows in Loot mode: spot categories, kinds and (for containers) container types, each with a game
// UI icon and a muted color. Ported from embark-api tools/map-features/index.html (SPOT_CATS / SPOT_KINDS).
// Sockets map to a kind by container tag, spawners and fixed level actors by class. Categories and kinds carry stable
// keys only; their labels are UI strings (maps.categories.<key>, maps.kinds.<key>, see ../text.ts).
import type { MapData, MapIndex } from './types';

export interface SpotCategory {
  key: string;
  icon: string;
  /** Placed by actor spawners per round (contents unknown to the item search). */
  spawned?: boolean;
  /** Fixed level actors (no loot). */
  feature?: boolean;
  /** Socket based (static loot): drawn as dots. */
  sockets?: boolean;
}

export interface SpotKind {
  key: string;
  cat: string;
  color: string;
  icon: string;
  /** Placed by actor spawners per round inside a feature category (field crates, ...): drawn and counted as spawned. */
  spawned?: boolean;
  /** Rare and important: a slightly bigger marker, drawn on top. */
  major?: boolean;
  small?: boolean;
  tag?: RegExp;
  rx?: RegExp;
}

export const CATEGORIES: SpotCategory[] = [
  { key: 'Exits', icon: 'extract-hatch', feature: true },
  { key: 'Containers', icon: 'loot-industrial', sockets: true },
  { key: 'Nature', icon: 'loot-nature', sockets: true },
  { key: 'RaiderSpawns', icon: 'raider-cache', spawned: true },
  { key: 'ArcSpawns', icon: 'arc-wreckage', spawned: true },
  { key: 'Puzzles', icon: 'puzzle', feature: true },
  { key: 'Features', icon: 'field-station', feature: true },
];

const k = (cat: string, key: string, color: string, icon: string, extra: Partial<SpotKind> = {}): SpotKind =>
  ({ key, cat, color, icon, ...extra });

export const KINDS: SpotKind[] = [
  // Exits & spawns
  k('Exits', 'ExtractMetro', '#5cc49c', 'extract-metro', { major: true, rx: /SalvageExtractionPoint_Metro/ }),
  k('Exits', 'ExtractLift', '#5cc49c', 'extract-lift', { major: true, rx: /SalvageExtractionPoint_Elevator/ }),
  k('Exits', 'ExtractFan', '#5cc49c', 'extract-fan', { major: true, rx: /SalvageExtractionPoint_Fan/ }),
  k('Exits', 'Hatch', '#9bcf6a', 'extract-hatch', { major: true, rx: /SalvageExtractionPoint_Hatch|RaiderHatchMarker/ }),
  k('Exits', 'StationEntrance', '#8fc9b4', 'metro-entrance', { rx: /MetroShutdownBarrier|StreetSign_Metro/ }),
  k('Exits', 'PlayerStart', '#d9d4c7', 'player', { rx: /^PioneerPlayerStart$/ }),
  // Containers: socket container category (Socket.LootContainer.<Cat>.*), split further into container types
  k('Containers', 'Electrical', '#d6b54a', 'loot-electrical'),
  k('Containers', 'Industrial', '#cf8a52', 'loot-industrial'),
  k('Containers', 'Mechanical', '#a98bc9', 'loot-mechanical'),
  k('Containers', 'Tech', '#8e97d4', 'loot-tech'),
  k('Containers', 'Commercial', '#5aaec4', 'loot-commercial'),
  k('Containers', 'Residential', '#c98ba8', 'loot-household'),
  k('Containers', 'Medical', '#cf6b63', 'loot-medical'),
  k('Containers', 'Security', '#5bb594', 'loot-military'),
  k('Containers', 'OldWorld', '#b89a74', 'loot-educational'),
  k('Containers', 'Exodus', '#78bdb5', 'loot-exodus'),
  k('Containers', 'ARC', '#c27cb3', 'loot-arc'),
  k('Containers', 'Raider', '#d1a04c', 'loot-raider'),
  k('Containers', 'Generic', '#a3a3a3', 'loot-household'),
  k('Containers', 'OtherFixed', '#8f8f8f', 'loot-household'),
  // Tagged Socket.LootContainer.Nature.WaterTank, but a regular container (not a plant).
  k('Containers', 'WaterTank', '#6aa6c7', 'loot-commercial', { tag: /^Nature\.WaterTank/ }),
  k('Containers', 'Ground', '#d9d6cf', 'pin', { small: true }),
  // Nature: a plant only ever gives its own item
  k('Nature', 'Apricot', '#d9a05c', 'harvest', { tag: /^Nature\.Apricot/ }),
  k('Nature', 'Lemon', '#d9cc5c', 'harvest', { tag: /^Nature\.Lemon/ }),
  k('Nature', 'Olive', '#9cb35a', 'harvest', { tag: /^Nature\.Olive/ }),
  k('Nature', 'NatureFruitBasket', '#d58a96', 'harvest', { tag: /^Nature\.FruitBasket/ }),
  k('Nature', 'Mushroom', '#c9ab8a', 'loot-nature', { tag: /^Nature\.Mushroom/ }),
  k('Nature', 'Agave', '#63b9a3', 'loot-nature', { tag: /^Nature\.Agave/ }),
  k('Nature', 'Moss', '#6fb36f', 'loot-nature', { tag: /^Nature\.Moss/ }),
  k('Nature', 'GreatMullein', '#d4c898', 'loot-nature', { tag: /^Nature\.GreatMullein/ }),
  k('Nature', 'Candleberries', '#cf6f82', 'harvest', { tag: /^Nature\.Candleberr/ }),
  k('Nature', 'Resin', '#c2944a', 'loot-nature', { tag: /^Nature\.Resin/ }),
  k('Nature', 'BirdNest', '#ab8f74', 'loot-nature', { tag: /^Nature\.BirdNest/ }),
  k('Nature', 'VolcanicRock', '#c9714f', 'loot-nature', { tag: /^Nature\.VolcanicRock/ }),
  k('Nature', 'Roots', '#977354', 'loot-nature', { tag: /^Nature\.Roots/ }),
  k('Nature', 'Fertilizer', '#9c86c9', 'loot-nature', { tag: /^Nature\.Fertilizer/ }),
  k('Nature', 'SeedVault', '#78bdb5', 'terminal', { tag: /^Nature\.Seedvault/ }),
  k('Nature', 'Seedbox', '#d6b54a', 'loot-nature', { tag: /^Nature\.Seedbox/ }),
  k('Nature', 'NatureMisc', '#a3a3a3', 'loot-nature', { tag: /^Nature\./ }),
  // Raider containers and caches (spawned)
  k('RaiderSpawns', 'CacheStandard', '#b394d1', 'raider-cache', { major: true, rx: /RaiderCache_WA/ }),
  k('RaiderSpawns', 'CacheSelfDestruct', '#c27cb3', 'raider-cache', { major: true, rx: /RaiderCacheSelfDestruct/ }),
  k('RaiderSpawns', 'CacheFrozen', '#9fc4d6', 'raider-cache', { major: true, rx: /RaiderCacheSnow/ }),
  k('RaiderSpawns', 'CacheFirstWave', '#5bb594', 'raider-cache', { major: true, rx: /RaiderCacheFirstWave/ }),
  k('RaiderSpawns', 'AmmoBox', '#d6b54a', 'ammo', { rx: /AmmoBox.*Dynamic$/ }),
  k('RaiderSpawns', 'AmmoBoxHigh', '#d99a3e', 'ammo', { rx: /AmmoBox.*HighTier/ }),
  k('RaiderSpawns', 'WeaponCase', '#cf8a52', 'loot-military', { rx: /WeaponCase.*Dynamic$/ }),
  k('RaiderSpawns', 'WeaponCaseHigh', '#c96a4a', 'loot-military', { rx: /WeaponCase.*DynamicHigh/ }),
  k('RaiderSpawns', 'MedicalBag', '#cf7a8f', 'loot-medical', { rx: /MedicalBag/ }),
  k('RaiderSpawns', 'GrenadeTube', '#8fbf6a', 'attack', { rx: /GrenadeContainer/ }),
  k('RaiderSpawns', 'Backpack', '#5aaec4', 'loot-raider', { rx: /Raider_Backpack/ }),
  k('RaiderSpawns', 'WeaponsRack', '#8e97d4', 'loot-military', { rx: /WeaponsRack/ }),
  k('RaiderSpawns', 'FruitBasket', '#d9cc5c', 'harvest', { rx: /FruitBasket_01_Dynamic$/ }),
  k('RaiderSpawns', 'FruitBasketWinter', '#d9d6cf', 'harvest', { rx: /FruitBasket.*WinterEvent/ }),
  // ARC husks & wrecks. Husk sizes = enemy (small: Wasp, medium: Rocketeer); "Cargo ship" = ARC Courier.
  k('ArcSpawns', 'WaspHusk', '#c27cb3', 'arc-wreckage', { rx: /ARCHusk_Small/ }),
  k('ArcSpawns', 'WaspHuskStunning', '#d6a3cb', 'arc-wreckage', { rx: /StunningHuskSmall/ }),
  k('ArcSpawns', 'RocketeerHusk', '#8e97d4', 'arc-wreckage', { rx: /ARCHusk_Medium/ }),
  k('ArcSpawns', 'RocketeerHuskStunning', '#b4bae0', 'arc-wreckage', { rx: /StunningHuskMedium/ }),
  k('ArcSpawns', 'DeforesterHusk', '#cf8a52', 'arc-wreckage', { major: true, rx: /DeforesterHusk/ }),
  k('ArcSpawns', 'Probes', '#5aaec4', 'arc-probe', { major: true, rx: /ProbeCrashed/ }),
  k('ArcSpawns', 'Couriers', '#78bdb5', 'payload', { major: true, rx: /CargoShip/ }),
  // Puzzles
  k('Puzzles', 'PowerSocket', '#d6b54a', 'generator', { rx: /PowerStation|BatteryCharger|SignalDropzone|SignalMultiDropzone/ }),
  k('Puzzles', 'FuelCell', '#d99a3e', 'fuel-cell', { rx: /Carry_FuelCell|CarryableBattery|MultiPowerRack/ }),
  k('Puzzles', 'PuzzleButton', '#8fbf6a', 'puzzle', { rx: /PuzzleButton|SignalButton|SignalSwitch|PowerGeneratorSwitch|UnlockConsole/ }),
  k('Puzzles', 'PuzzleRelay', '#5bb594', 'puzzle', { rx: /PuzzleRelay|SignalRelay/ }),
  k('Puzzles', 'CardReader', '#5aaec4', 'terminal', { rx: /CardReader/ }),
  k('Puzzles', 'TubeTerminal', '#c27cb3', 'terminal', { rx: /TubeRequestTerminal|TubeDeliveryStation/ }),
  k('Puzzles', 'PuzzleDoor', '#a98bc9', 'bunker', { rx: /RandomizedSequencePuzzleDoor|RootCellar|InteractiveSecurityDoor|InteractiveGate_|EventBunker|LaunchTowerActivity|ElevatorDoor/ }),
  k('Puzzles', 'HotelKey', '#d9cc5c', 'lock', { rx: /HotelKey|HotelPuzzle/ }),
  // Map features: level actors (export-maps actors[]); classes picked in build-map-features.js.
  k('Features', 'FieldDepot', '#d1a04c', 'field-station', { major: true, rx: /ColonySupplyStation/ }),
  // Spawned per round: field crates (carried to a field depot), power cores, supply call stations (the supply drop
  // lands next to the station; no fixed drop spots in the level), snow piles.
  k('Features', 'FieldCrates', '#d1a04c', 'field-crate', { major: true, spawned: true, rx: /Carryable_Object|ArcFieldCrate/ }),
  k('Features', 'SupplyStation', '#5aaec4', 'supply-station', { major: true, spawned: true, rx: /SupplyCallStation/ }),
  k('Features', 'PowerCores', '#78bdb5', 'fusion-core', { major: true, spawned: true, rx: /Husk_Small_PowerCore/ }),
  k('Features', 'Snowpile', '#d9d6cf', 'frost', { spawned: true, rx: /Snowpile/ }),
  k('Features', 'Zipline', '#6aa6c7', 'transmitter', { rx: /ActivatableZipline/ }),
  k('Features', 'Lift', '#8e97d4', 'enter-surface', { rx: /MovablePlatform_(MastLift|Cargo)/ }),
  k('Features', 'Bridge', '#a98bc9', 'region', { rx: /MovablePlatform_SpillwayBridge/ }),
  k('Features', 'BridgeSwitch', '#c98ba8', 'generator', { rx: /PowerSwitch_Breaker/ }),
  // Doors: locked rooms (the exploit-prevention volume inside each key room) and locked doors, then ADoorBase start
  // state (export-maps `door`). Barricaded = bStartAsSealed (breach it to open).
  k('Features', 'LockedRoom', '#d0605a', 'lock', { major: true, rx: /LockedRoomExploitPreventionArea/ }),
  k('Features', 'LockedDoor', '#d98f8a', 'lock', { rx: /^LockedDoor$/ }),
  k('Features', 'Barricaded', '#cf6b4f', 'door', { rx: /^Barricaded$/ }),
  k('Features', 'Door', '#a68566', 'door', { small: true, rx: /^Door$/ }),
  k('Features', 'Piano', '#b89a74', 'audio', { small: true, rx: /^BP_Piano$/ }),
];

export const KIND = new Map(KINDS.map((x) => [x.key, x]));
export const CATEGORY = new Map(CATEGORIES.map((x) => [x.key, x]));
for (const kind of KINDS) if (!CATEGORY.has(kind.cat)) throw new Error(`kind ${kind.key}: unknown category ${kind.cat}`);
export const kindsOf = (cat: string) => KINDS.filter((x) => x.cat === cat);
export const isSpawned = (kind: SpotKind) => !CATEGORY.get(kind.cat)!.sockets;
export const isFeature = (kind: SpotKind) => !kind.spawned && !!CATEGORY.get(kind.cat)!.feature;

// ---------------------------------------------------------------- container types

/** Container type of a socket tag: its first two parts ("Industrial.Lockers.Door" -> "Industrial.Lockers"). */
export const containerType = (tag: string) => tag.split('.').slice(0, 2).join('.');
const SPLIT_WORDS = /([a-z])([A-Z0-9])|([A-Z])([A-Z][a-z])/g;
/**
 * Readable raw container type, the fallback for types without a UI label: "Industrial.ToolboxLarge" -> "Toolbox Large",
 * "Commercial.Shelf03" -> "Shelf 03".
 */
export const containerTypeLabel = (type: string) => (type.split('.')[1] ?? type).replace(SPLIT_WORDS, '$1$3 $2$4').replace(/_/g, ' ');
/** A tag part, readable: "ToolboxLarge" -> "Toolbox Large". */
export const tagPartLabel = (part: string) => part.replace(SPLIT_WORDS, '$1$3 $2$4');
/** Kind of a container tag that is matched by tag (plants, water tank, ...), else null. */
export const taggedKind = (tag: string) => KINDS.find((x) => x.tag?.test(tag)) ?? null;

/**
 * Filter leaves: the units the user switches on and off. Container kinds split into container types
 * ("t:Industrial.Lockers"); every other kind is one leaf (its key).
 */
export const typeLeaf = (type: string) => `t:${type}`;

export interface MapClasses {
  /** Kind and leaf of each socket. */
  socketKind: SpotKind[];
  socketLeaf: string[];
  /** Kinds of each spawner with their share of the spawn (a spawn picks one class), primary first. */
  spawnerKinds: [SpotKind, number][][];
  /** Key items of locked doors, per spawner. */
  spawnerKeys: (string[] | null)[];
  /** Container types per container kind on this map. */
  types: Map<string, string[]>;
}

const classCache = new WeakMap<MapData, MapClasses>();

export function classify(map: MapData): MapClasses {
  const cached = classCache.get(map);
  if (cached) return cached;
  const containerKinds = new Set(kindsOf('Containers').filter((x) => !x.tag).map((x) => x.key));
  const tagged = KINDS.filter((x) => x.tag);
  const containerKind = map.containers.map((c) => {
    const byTag = tagged.find((x) => x.tag!.test(c));
    if (byTag) return byTag;
    const cat = c.split('.')[0];
    return KIND.get(containerKinds.has(cat) ? cat : 'OtherFixed')!;
  });
  const types = new Map<string, string[]>();
  const containerLeaf = map.containers.map((c, i) => {
    const kind = containerKind[i];
    if (kind.cat !== 'Containers' || kind.tag) return kind.key;
    const type = containerType(c);
    const list = types.get(kind.key) ?? [];
    if (!list.includes(type)) list.push(type);
    types.set(kind.key, list);
    return typeLeaf(type);
  });
  for (const list of types.values()) list.sort((a, b) => containerTypeLabel(a).localeCompare(containerTypeLabel(b)));
  const classKinds = KINDS.filter((x) => x.rx);
  const perSet = map.spawnerClasses.map((set, s) => {
    const merged = new Map<SpotKind, number>();
    const parts = set.split(' | ');
    const keys = parts.filter((c) => c.startsWith('Key:')).map((c) => c.slice(4));
    parts.forEach((cls, n) => {
      const kind = classKinds.find((x) => x.rx!.test(cls));
      if (kind) merged.set(kind, (merged.get(kind) ?? 0) + (map.spawnerShares[s]?.[n] ?? 1 / parts.length));
    });
    return { kinds: [...merged].sort((a, b) => b[1] - a[1]), keys: parts.includes('LockedDoor') ? keys : null };
  });
  const ground = KIND.get('Ground')!;
  const out: MapClasses = {
    socketKind: map.sockets.map((s) => (s[3] >= 0 ? containerKind[s[3]] : ground)),
    socketLeaf: map.sockets.map((s) => (s[3] >= 0 ? containerLeaf[s[3]] : 'Ground')),
    spawnerKinds: map.spawners.map((s) => perSet[s[2]].kinds),
    spawnerKeys: map.spawners.map((s) => perSet[s[2]].keys),
    types,
  };
  classCache.set(map, out);
  return out;
}

/** Leaves of a kind on a map (container types, or the kind itself). */
export const leavesOf = (cls: MapClasses, kind: SpotKind) => (cls.types.has(kind.key) ? cls.types.get(kind.key)!.map(typeLeaf) : [kind.key]);

/** Kind of a spawned class ("BP_SocketContainer_Raider_AmmoBox_01_Lid_A_Dynamic" -> AmmoBox), else null. */
export const classKind = (raw: string) => KINDS.find((x) => x.rx?.test(raw)) ?? null;
/** Readable raw class name, the fallback for classes without a kind ("BP_Foo_Bar_C" -> "Foo Bar"). */
export const className = (raw: string) => raw.replace(/^BP_(SocketContainer_)?(Raider_)?/, '').replace(/_C\b/g, '').replace(/_/g, ' ');

// ---------------------------------------------------------------- ARC enemies

const ENEMY_ICONS: Record<string, string> = {
  Snitch: 'e-snitch', Wasp: 'e-wasp', Hornet: 'e-hornet', Spotter: 'e-spotter', Vaporizer: 'e-vaporizer', Rocketeer: 'e-rocketeer',
  Firefly: 'e-firefly', Bastion: 'e-bastion', Fireball: 'e-fireball', Leaper: 'e-leaper', Bombardier: 'e-bombardier',
  'ARC Surveyor': 'e-surveyor', Tick: 'e-tick', Queen: 'e-queen', Pop: 'e-pop', Comet: 'e-comet', 'ARC Turbine': 'e-turbine',
  Matriarch: 'e-matriarch', Shredder: 'e-shredder', Sentinel: 'e-sentinel', Turret: 'e-turret',
};
export const enemyIcon = (name: string) => ENEMY_ICONS[name] ?? 'warning';
// One fixed color per enemy type, the same on every map and condition (drones cool, ground units warm, bosses red).
const ENEMY_COLOR: Record<string, string> = {
  Snitch: '#d9cc5c', Wasp: '#5aaec4', Hornet: '#8e97d4', Firefly: '#d9a03e', Rocketeer: '#5f86cf', Vaporizer: '#b394d1',
  Spotter: '#78bdb5', Sentinel: '#5bb594', Turret: '#a3a3a3', Tick: '#b5cf5a', Pop: '#d6a3cb', Fireball: '#cf8a52',
  Comet: '#e3ded2', Leaper: '#8fbf6a', 'ARC Surveyor': '#9fc4d6', Bombardier: '#c2944a', Bastion: '#c27cb3', Shredder: '#d9798f',
  'ARC Turbine': '#9a8cd9', Queen: '#e0604f', Matriarch: '#c9714f',
};
const FALLBACK_COLORS = ['#e0604f', '#d9a03e', '#5aaec4', '#8fbf6a', '#c27cb3', '#d9cc5c', '#8e97d4', '#5bb594', '#cf8a52', '#b394d1'];
/** Color of an enemy type by name (unknown names get a stable color from their name). */
export function enemyColor(name: string): string {
  if (ENEMY_COLOR[name]) return ENEMY_COLOR[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}
export const THREAT = '#e0604f';

/** Enemy types a group table can spawn (any tier / difficulty). */
export function tableEnemies(index: MapIndex, table: string | null): Set<number> {
  const t = table ? index.enemyTables[table] : undefined;
  if (!t) return new Set();
  return new Set([...t.lists.flat(), ...Object.values(t.byDifficulty ?? {}).flat()].flatMap((g) => g.kinds.map((x) => x[0])));
}

const probCache = new WeakMap<MapIndex, Map<string, Map<number, number>>>();
/** Chance that a spawn of the table includes each enemy (group weights, averaged over tiers / difficulties). */
export function tableEnemyProbs(index: MapIndex, table: string | null): Map<number, number> {
  let byTable = probCache.get(index);
  if (!byTable) probCache.set(index, (byTable = new Map()));
  const key = table ?? '';
  const cached = byTable.get(key);
  if (cached) return cached;
  const p = new Map<number, number>();
  const t = table ? index.enemyTables[table] : undefined;
  const lists = t ? (t.lists.length ? t.lists : Object.values(t.byDifficulty ?? {})) : [];
  for (const list of lists) {
    // Groups without weights count as equally likely; otherwise zero-weight groups never spawn.
    const weighted = list.some((g) => g.w > 0);
    const weight = (g: { w: number }) => (weighted ? g.w || 0 : 1);
    const total = list.reduce((a, g) => a + weight(g), 0);
    for (const g of list) for (const e of new Set(g.kinds.map((x) => x[0]))) p.set(e, (p.get(e) ?? 0) + (total ? weight(g) / total : 0) / lists.length);
  }
  byTable.set(key, p);
  return p;
}

const groupText = (g: { kinds: [number, number, number][] }, enemyName: (e: number) => string) =>
  g.kinds.map(([e, min, max]) => `${min === max ? (min > 1 ? `${min}× ` : '') : `${min}–${max}× `}${enemyName(e)}`).join(' + ');

/**
 * Weighted group options of a table: ["Bastion + Firefly + 2× Comet", 0.33, tier]; `enemyName` names the enemies.
 * A table missing in the build gives one option with `missing` set and the table name as text.
 */
export function tableOptions(index: MapIndex, table: string | null, enemyName = (e: number) => index.enemies[e]?.name ?? '?'):
  { text: string; share: number | null; tier: number | null; missing?: boolean }[] {
  const t = table ? index.enemyTables[table] : undefined;
  if (!t) return table ? [{ text: table, share: null, tier: null, missing: true }] : [];
  const lists = t.lists.length ? t.lists : Object.values(t.byDifficulty ?? {});
  return lists.flatMap((list, li) => {
    const total = list.reduce((a, g) => a + (g.w || 0), 0) || 1;
    return list.map((g) => ({ text: groupText(g, enemyName), share: list.length > 1 ? (g.w || 0) / total : null, tier: lists.length > 1 ? li + 1 : null }));
  });
}

/** One respawn rule of an enemy spawner; times in seconds (negative: never), distance in meters. */
export type TimingRule =
  | { t: 'noRespawn' }
  | { t: 'respawn'; secs: number }
  | { t: 'randomDelay'; min: number; max: number }
  | { t: 'noDynamic' }
  | { t: 'airDrop'; secs: number }
  | { t: 'sneak'; secs: number; indoors: boolean }
  | { t: 'activates'; meters: number };

/** Respawn rules from the spawner settings (class defaults + instance overrides); ../text.ts words them. */
export function enemyTiming(p: Record<string, number | boolean>): TimingRule[] {
  const n = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : null);
  const rules: TimingRule[] = [];
  const dynamic = p.bUseDynamicRespawning !== false;
  const after = n('RespawnAfterDestroyed');
  if (after != null) rules.push(after < 0 ? { t: 'noRespawn' } : { t: 'respawn', secs: after });
  const maxDelay = n('MaxRandomRespawnDelay');
  if (maxDelay) rules.push({ t: 'randomDelay', min: n('MinRandomRespawnDelay') ?? 0, max: maxDelay });
  if (!dynamic) rules.push({ t: 'noDynamic' });
  else {
    const air = n('AirStrikeRespawnTimeAfterLastDestroyed');
    if (p.bAllowDynamicAirRespawn !== false && air != null && air < 9000) rules.push({ t: 'airDrop', secs: air });
    const sneak = n('SneakRespawnTime');
    if (p.bAllowDynamicSneakRespawn !== false && sneak != null) rules.push({ t: 'sneak', secs: sneak, indoors: !!p.bRequireIndoors });
  }
  const dist = n('SpawnDistance');
  if (dist != null) rules.push({ t: 'activates', meters: Math.round(dist / 100) });
  return rules;
}

// ---------------------------------------------------------------- loot zones, conditions

export const lootZone = (threat: string | null, themes: string[]) =>
  threat === 'High' ? 'abundant' : threat === 'Medium' ? 'dense' : themes.length ? 'sparse' : null;
export const ZONE_COLORS: Record<string, string> = { abundant: '214,92,78', dense: '214,181,74', sparse: '160,160,160' };
/** Loot zones in legend order (labels: maps.zones.<zone>). */
export const ZONES = ['abundant', 'dense', 'sparse'] as const;

/** Condition image in public/images/events (snake_case of the English name). */
export const conditionImage = (name: string) => `/images/events/${name.toLowerCase().replace(/[^a-z]+/g, '_')}.png`;
