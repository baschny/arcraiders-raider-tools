// What the map shows in Loot mode: spot categories, kinds and (for containers) container types, each with a game
// UI icon and a muted color. Originally ported from the embark-api map features kinds (SPOT_CATS / SPOT_KINDS).
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
  /** Drawn like the in-game map's extraction markers: a white tile with a dark icon. */
  tile?: boolean;
  small?: boolean;
  tag?: RegExp;
  rx?: RegExp;
  /** Kind-specific mechanics shown in the tooltip (i18n keys under maps.mechanics), like the door key line. */
  mechanics?: Mechanic[];
}

/** One tooltip mechanic line: an i18n key under maps.mechanics plus its {placeholders}. */
export interface Mechanic {
  key: string;
  values?: Record<string, string | number>;
}

// In filter list order: the few important spots first, the many loot spots last.
export const CATEGORIES: SpotCategory[] = [
  { key: 'Exits', icon: 'extract-hatch', feature: true },
  { key: 'RaiderSpawns', icon: 'raider-cache', spawned: true },
  { key: 'ArcSpawns', icon: 'arc-wreckage', spawned: true },
  { key: 'Features', icon: 'field-station', feature: true },
  { key: 'Puzzles', icon: 'puzzle', feature: true },
  { key: 'Nature', icon: 'loot-nature', sockets: true },
  { key: 'Containers', icon: 'loot-industrial', sockets: true },
];

const k = (cat: string, key: string, color: string, icon: string, extra: Partial<SpotKind> = {}): SpotKind =>
  ({ key, cat, color, icon, ...extra });

export const KINDS: SpotKind[] = [
  // Exits & spawns
  k('Exits', 'ExtractMetro', '#f4f3ef', 'extract-metro', { major: true, tile: true, rx: /SalvageExtractionPoint_Metro/ }),
  k('Exits', 'ExtractLift', '#f4f3ef', 'extract-lift', { major: true, tile: true, rx: /SalvageExtractionPoint_Elevator/ }),
  k('Exits', 'ExtractFan', '#f4f3ef', 'extract-fan', { major: true, tile: true, rx: /SalvageExtractionPoint_Fan/ }),
  // Pendola Pass: a terminal that calls the gondola (placed by spawners; the ping uses the terminal icon).
  k('Exits', 'ExtractGondola', '#f4f3ef', 'terminal', { major: true, tile: true, spawned: true, rx: /SalvageExtractionPoint_MultiProbe/ }),
  // Pendola Pass: the landing sites of the gondolas the terminals call (embark-api docs/Map-Corrections.md). Not a tile:
  // only the terminal has the game's extraction marker style, and the many sites would crowd the map.
  k('Exits', 'ExtractGondolaLanding', '#c9cdd1', 'extract-lift', { rx: /SalvageExtractionSpawnPoint_MultiProbe/ }),
  k('Exits', 'Hatch', '#f4f3ef', 'extract-hatch', { major: true, tile: true, rx: /SalvageExtractionPoint_Hatch|RaiderHatchMarker/ }),
  k('Exits', 'StationEntrance', '#c9cdd1', 'metro-entrance', { rx: /MetroShutdownBarrier|StreetSign_Metro/ }),
  k('Exits', 'PlayerStart', '#c9cdd1', 'player', { rx: /^PioneerPlayerStart$/ }),
  // Containers: socket container category (Socket.LootContainer.<Cat>.*), split further into container types
  k('Containers', 'Electrical', '#ffd23f', 'loot-electrical'),
  k('Containers', 'Industrial', '#ff8c3a', 'loot-industrial'),
  k('Containers', 'Mechanical', '#b48cff', 'loot-mechanical'),
  k('Containers', 'Tech', '#6f8cff', 'loot-tech'),
  k('Containers', 'Commercial', '#2ec5e8', 'loot-commercial'),
  k('Containers', 'Residential', '#ff8cc0', 'loot-household'),
  k('Containers', 'Medical', '#ff5252', 'loot-medical'),
  k('Containers', 'Security', '#2ee08a', 'loot-military'),
  k('Containers', 'OldWorld', '#e0bd8f', 'loot-educational'),
  k('Containers', 'Exodus', '#6ff5dd', 'loot-exodus'),
  k('Containers', 'ARC', '#e86bff', 'loot-arc'),
  k('Containers', 'Raider', '#ffb000', 'loot-raider'),
  k('Containers', 'Generic', '#c8c8c8', 'loot-household'),
  k('Containers', 'OtherFixed', '#a8a8a8', 'loot-household'),
  // Tagged Socket.LootContainer.Nature.WaterTank, but a regular container (not a plant).
  k('Containers', 'WaterTank', '#8fd0ff', 'loot-commercial', { tag: /^Nature\.WaterTank/ }),
  k('Containers', 'Ground', '#f4f1ea', 'pin', { small: true }),
  // Nature: a plant only ever gives its own item
  k('Nature', 'Apricot', '#ffa336', 'harvest', { tag: /^Nature\.Apricot/ }),
  k('Nature', 'Lemon', '#ffea36', 'harvest', { tag: /^Nature\.Lemon/ }),
  k('Nature', 'Olive', '#b9dc56', 'harvest', { tag: /^Nature\.Olive/ }),
  k('Nature', 'NatureFruitBasket', '#ef7084', 'harvest', { tag: /^Nature\.FruitBasket/ }),
  k('Nature', 'Mushroom', '#e1ac72', 'loot-nature', { tag: /^Nature\.Mushroom/ }),
  k('Nature', 'Agave', '#54deba', 'loot-nature', { tag: /^Nature\.Agave/ }),
  k('Nature', 'Moss', '#5fd35f', 'loot-nature', { tag: /^Nature\.Moss/ }),
  k('Nature', 'GreatMullein', '#ead582', 'loot-nature', { tag: /^Nature\.GreatMullein/ }),
  k('Nature', 'Candleberries', '#f04e6e', 'harvest', { tag: /^Nature\.Candleberr/ }),
  k('Nature', 'Resin', '#efad43', 'loot-nature', { tag: /^Nature\.Resin/ }),
  k('Nature', 'BirdNest', '#ca9868', 'loot-nature', { tag: /^Nature\.BirdNest/ }),
  k('Nature', 'VolcanicRock', '#f4713e', 'loot-nature', { tag: /^Nature\.VolcanicRock/ }),
  k('Nature', 'Roots', '#cf9563', 'loot-nature', { tag: /^Nature\.Roots/ }),
  k('Nature', 'Fertilizer', '#936ce3', 'loot-nature', { tag: /^Nature\.Fertilizer/ }),
  k('Nature', 'SeedVault', '#5cd9ca', 'terminal', { tag: /^Nature\.Seedvault/ }),
  k('Nature', 'Seedbox', '#ffcf33', 'loot-nature', { tag: /^Nature\.Seedbox/ }),
  // Ground-loot sockets Socket.Loot.Nature.Cactus are the Prickly Pear plant (docs/Map-Corrections.md C01).
  k('Nature', 'PricklyPear', '#fd8346', 'harvest', { tag: /^Nature\.Cactus/ }),
  // Snow piles: placed per round by spawners (not sockets), but harvested like plants.
  k('Nature', 'Snowpile', '#dfe9f0', 'frost', { spawned: true, rx: /Snowpile/ }),
  k('Nature', 'NatureMisc', '#c7c7c7', 'loot-nature', { tag: /^Nature\./ }),
  // Raider containers and caches (spawned)
  k('RaiderSpawns', 'CacheStandard', '#b37de8', 'raider-cache', { major: true, rx: /RaiderCache_WA|NomadCache/ }),
  k('RaiderSpawns', 'CacheSelfDestruct', '#dd61c3', 'raider-cache', { major: true, rx: /RaiderCacheSelfDestruct/ }),
  k('RaiderSpawns', 'CacheFrozen', '#85c9ea', 'raider-cache', { major: true, rx: /RaiderCacheSnow|RaiderCacheFrozenTrail/ }),
  k('RaiderSpawns', 'CacheFirstWave', '#55ddab', 'raider-cache', { major: true, rx: /RaiderCacheFirstWave/ }),
  k('RaiderSpawns', 'AmmoBox', '#ffcf33', 'ammo', { rx: /AmmoBox.*Dynamic$/ }),
  k('RaiderSpawns', 'AmmoBoxHigh', '#ffac33', 'ammo', { rx: /AmmoBox.*HighTier/ }),
  k('RaiderSpawns', 'WeaponCase', '#f98f39', 'loot-military', { rx: /WeaponCase.*Dynamic$/ }),
  k('RaiderSpawns', 'WeaponCaseHigh', '#f56b3d', 'loot-military', { rx: /WeaponCase.*DynamicHigh/ }),
  k('RaiderSpawns', 'MedicalBag', '#ed5c80', 'loot-medical', { rx: /MedicalBag/ }),
  k('RaiderSpawns', 'GrenadeTube', '#90e052', 'attack', { rx: /GrenadeContainer/ }),
  k('RaiderSpawns', 'Backpack', '#47c9eb', 'loot-raider', { rx: /Raider_Backpack/ }),
  k('RaiderSpawns', 'WeaponsRack', '#7584ed', 'loot-military', { rx: /WeaponsRack/ }),
  k('RaiderSpawns', 'FruitBasket', '#ffea36', 'harvest', { rx: /FruitBasket_01_Dynamic$/ }),
  k('RaiderSpawns', 'FruitBasketWinter', '#dfe9f0', 'harvest', { rx: /FruitBasket.*WinterEvent/ }),
  // ARC husks & wrecks. Husk sizes = enemy (small: Wasp, medium: Rocketeer); "Cargo ship" = ARC Courier.
  k('ArcSpawns', 'WaspHusk', '#dd61c3', 'arc-wreckage', { rx: /ARCHusk_Small/ }),
  k('ArcSpawns', 'WaspHuskStunning', '#e887d3', 'arc-wreckage', { rx: /StunningHuskSmall/ }),
  k('ArcSpawns', 'RocketeerHusk', '#7584ed', 'arc-wreckage', { rx: /ARCHusk_Medium/ }),
  k('ArcSpawns', 'RocketeerHuskStunning', '#8492eb', 'arc-wreckage', { rx: /StunningHuskMedium/ }),
  k('ArcSpawns', 'DeforesterHusk', '#f98f39', 'arc-wreckage', { major: true, rx: /DeforesterHusk/ }),
  // Baron husks: fixed level actors (BP_Husk_BaronHead_WA; Spaceport, Dam, Blue Gate), breached for loot
  // (embark-api docs/Map-Corrections.md C11).
  k('ArcSpawns', 'BaronHusk', '#f56b3d', 'arc-wreckage', { major: true, rx: /Husk_BaronHead/ }),
  k('ArcSpawns', 'Probes', '#47c9eb', 'arc-probe', { major: true, rx: /ProbeCrashed/ }),
  // Potential ARC Probe landing sites (markers tagged ARCCargoDrop / ArcRaid; docs/Map-Corrections.md C02).
  // Cadence from DA_ARCProbeDrop_Normal/_HighTier (Min/MaxTimeBetweenDrops 190–240 s); unbreached probes depart,
  // a breached one stays.
  k('ArcSpawns', 'ArcProbe', '#47c9eb', 'arc-probe', {
    major: true, rx: /ArcProbeMarker/,
    mechanics: [{ key: 'probeSite' }, { key: 'probeCadence', values: { min: 3, max: 4 } }],
  }),
  k('ArcSpawns', 'Couriers', '#5cd9ca', 'payload', { major: true, rx: /CargoShip/ }),
  // Puzzles
  k('Puzzles', 'PowerSocket', '#ffcf33', 'generator', { rx: /PowerStation|BatteryCharger|SignalDropzone|SignalMultiDropzone/ }),
  k('Puzzles', 'FuelCell', '#ffac33', 'fuel-cell', { rx: /Carry_FuelCell|CarryableBattery|MultiPowerRack/ }),
  k('Puzzles', 'PuzzleButton', '#90e052', 'puzzle', { rx: /PuzzleButton|SignalButton|SignalSwitch|PowerGeneratorSwitch|UnlockConsole/ }),
  k('Puzzles', 'PuzzleRelay', '#55ddab', 'puzzle', { rx: /PuzzleRelay|SignalRelay/ }),
  k('Puzzles', 'CardReader', '#47c9eb', 'terminal', { rx: /CardReader/ }),
  k('Puzzles', 'TubeTerminal', '#dd61c3', 'terminal', { rx: /TubeRequestTerminal|TubeDeliveryStation/ }),
  k('Puzzles', 'PuzzleDoor', '#a873e1', 'bunker', { rx: /RandomizedSequencePuzzleDoor|RootCellar|InteractiveSecurityDoor|InteractiveGate_|EventBunker|LaunchTowerActivity|ElevatorDoor/ }),
  k('Puzzles', 'HotelKey', '#ffea36', 'lock', { rx: /HotelKey|HotelPuzzle/ }),
  // Map features: level actors (export-maps actors[]); classes picked in lib/derived/map-features.js.
  k('Features', 'FieldDepot', '#fdb335', 'field-station', { major: true, rx: /ColonySupplyStation/ }),
  // Interactable POIs: the androids on Stella Montis / Pendola Pass and the AED stations on Blue Gate
  // (embark-api docs/Map-Corrections.md).
  k('Features', 'Android', '#5cd9ca', 'terminal', { rx: /SM_Android/ }),
  k('Features', 'AEDStation', '#f44c3e', 'loot-medical', { rx: /AEDStation/ }),
  // Pendola Pass emergency shelters (one marker per shelter, at the roof hatch) and their Frostbite ("Flash Freeze")
  // area of effect. Always active: they live in the base FrozenTrail_01_FlashFreeze data layer, not a round condition
  // (embark-api docs/Map-Corrections.md C04). Timings: BP_FlashFreeze (start 300–600 s, wait 250–500 s, 1–3 zones).
  k('Features', 'EmergencyShelter', '#dfe9f0', 'frost', { rx: /FlashFreezeHatch/, mechanics: [{ key: 'shelterOpen' }] }),
  k('Features', 'FlashFreeze', '#85c9ea', 'frost', {
    rx: /FlashFreezeArea/,
    mechanics: [{ key: 'zone' }, { key: 'zoneCadence', values: { min: 1, max: 3 } }],
  }),
  // Spawned per round: field crates (carried to a field depot), power cores, supply call stations (the supply drop
  // lands next to the station; no fixed drop spots in the level), snow piles.
  k('Features', 'FieldCrates', '#fdb335', 'field-crate', { major: true, spawned: true, rx: /Carryable_Object|ArcFieldCrate/ }),
  k('Features', 'SupplyStation', '#47c9eb', 'supply-station', { major: true, spawned: true, rx: /SupplyCallStation/ }),
  k('Features', 'PowerCores', '#5cd9ca', 'fusion-core', { major: true, spawned: true, rx: /Husk_Small_PowerCore/ }),
  k('Features', 'MetalDetector', '#ffcf33', 'metal-detector', { spawned: true, rx: /Pickup_MetalDetector/ }),
  k('Features', 'Zipline', '#4ab0e8', 'transmitter', { rx: /ActivatableZipline/ }),
  k('Features', 'Lift', '#7584ed', 'enter-surface', { rx: /MovablePlatform_(MastLift|Cargo)/ }),
  k('Features', 'Bridge', '#a873e1', 'region', { rx: /MovablePlatform_SpillwayBridge/ }),
  k('Features', 'BridgeSwitch', '#e173a6', 'generator', { rx: /PowerSwitch_Breaker/ }),
  // Doors: locked rooms (the exploit-prevention volume inside each key room) and locked doors, then ADoorBase start
  // state (export-maps `door`). Barricaded = bStartAsSealed (breach it to open).
  k('Features', 'LockedRoom', '#f8443a', 'lock', { major: true, rx: /LockedRoomExploitPreventionArea/ }),
  k('Features', 'LockedDoor', '#f4776f', 'lock', { rx: /^LockedDoor$/ }),
  k('Features', 'Barricaded', '#fa6338', 'door', { rx: /^Barricaded$/ }),
  k('Features', 'Door', '#cc9766', 'door', { small: true, rx: /^Door$/ }),
  k('Features', 'Piano', '#d5a05d', 'audio', { small: true, rx: /^BP_Piano$/ }),
];

export const KIND = new Map(KINDS.map((x) => [x.key, x]));
export const CATEGORY = new Map(CATEGORIES.map((x) => [x.key, x]));
for (const kind of KINDS) if (!CATEGORY.has(kind.cat)) throw new Error(`kind ${kind.key}: unknown category ${kind.cat}`);
export const kindsOf = (cat: string) => KINDS.filter((x) => x.cat === cat);
export const isFeature = (kind: SpotKind) => !kind.spawned && !!CATEGORY.get(kind.cat)!.feature;

/**
 * How a kind is drawn, on the map and as its swatch in the filter list: one shape per filter category, so a category
 * reads as one family; the kind's colour fills it and its game icon sits inside (rings: outlined, colour on dark).
 * Importance shows only in size (`major`); markers are opaque (the spawn chance is in the tooltip and counts).
 * - `tile` / `gate`: exits; extraction points like the in-game map (white tile, dark icon), the other exits and
 *   spawns a dark tile with a light rim;
 * - `dot`: loot containers;
 * - `leaf`: nature (plants, snow piles);
 * - `diamond`: raider containers;
 * - `hex`: ARC husks and wrecks;
 * - `ring`: map features and puzzle devices.
 */
export type MarkerStyle = 'tile' | 'gate' | 'dot' | 'leaf' | 'diamond' | 'hex' | 'ring';
/**
 * Icon size inside a marker, as a share of the marker size; the same for the map and the filter swatches (18 px: a
 * 12 px icon in the round and square shapes, 10 px in the pointed ones, even sizes so the icon sits on whole pixels).
 */
export const ICON_SHARE: Record<MarkerStyle, number> = { ring: 0.66, dot: 0.66, tile: 0.66, gate: 0.66, leaf: 0.56, diamond: 0.56, hex: 0.56 };
/** Swatch size in the filter list and the even icon size inside it. */
export const SWATCH = 18;
export const swatchIcon = (style: MarkerStyle) => 2 * Math.round((SWATCH * ICON_SHARE[style]) / 2);
const CATEGORY_STYLE: Record<string, MarkerStyle> = { Containers: 'dot', Nature: 'leaf', RaiderSpawns: 'diamond', ArcSpawns: 'hex' };
export function markerStyle(kind: SpotKind): MarkerStyle {
  if (kind.cat === 'Exits') return kind.tile ? 'tile' : 'gate';
  return CATEGORY_STYLE[kind.cat] ?? 'ring';
}

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
const typeLeaf = (type: string) => `t:${type}`;

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
  Skulker: 'e-skulker', 'ARC Reclaimer': 'e-reclaimer', Hydra: 'e-hydra', 'Frigate Cannon': 'e-frigate', Bully: 'e-bully',
};
export const enemyIcon = (name: string) => ENEMY_ICONS[name] ?? 'warning';
// One fixed color per enemy type, the same on every map and condition (drones cool, ground units warm, bosses red).
const ENEMY_COLOR: Record<string, string> = {
  Snitch: '#d9cc5c', Wasp: '#5aaec4', Hornet: '#8e97d4', Firefly: '#d9a03e', Rocketeer: '#5f86cf', Vaporizer: '#b394d1',
  Spotter: '#78bdb5', Sentinel: '#5bb594', Turret: '#a3a3a3', Tick: '#b5cf5a', Pop: '#d6a3cb', Fireball: '#cf8a52',
  Comet: '#e3ded2', Leaper: '#8fbf6a', 'ARC Surveyor': '#9fc4d6', Bombardier: '#c2944a', Bastion: '#c27cb3', Shredder: '#d9798f',
  'ARC Turbine': '#9a8cd9', Queen: '#e0604f', Matriarch: '#c9714f',
  Skulker: '#a98bc9', 'ARC Reclaimer': '#6aa6c7', Hydra: '#d0605a', 'Frigate Cannon': '#b3564a', Bully: '#c98ba8',
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

/** Game icon of an area's loot category (Poi.themes), as the in-game map shows them above the area name. */
export const THEME_ICONS: Record<string, string> = {
  Technological: 'loot-tech', Commercial: 'loot-commercial', Industrial: 'loot-industrial', Mechanical: 'loot-mechanical',
  Electrical: 'loot-electrical', Medical: 'loot-medical', Security: 'loot-military', Exodus: 'loot-exodus', Residential: 'loot-household',
  OldWorld: 'loot-educational', ARC: 'loot-arc', Nature: 'loot-nature', Raider: 'loot-raider',
};

const themeCache = new WeakMap<MapData, string[][]>();
/** Loot categories of each area label (MapData.areas), from the POI of the same game string (or title); [] when none. */
export function areaThemes(map: MapData): string[][] {
  const cached = themeCache.get(map);
  if (cached) return cached;
  const byKey = new Map<string, string[]>(), byTitle = new Map<string, string[]>();
  for (const p of map.pois) {
    if (!p.themes.length) continue;
    if (p.titleKey) byKey.set(p.titleKey, p.themes);
    byTitle.set(p.title, p.themes);
  }
  const out = map.areas.map((a) => (a.nameKey ? byKey.get(a.nameKey) : undefined) ?? byTitle.get(a.name) ?? []);
  themeCache.set(map, out);
  return out;
}

export const lootZone = (threat: string | null, themes: string[]) =>
  threat === 'High' ? 'abundant' : threat === 'Medium' ? 'dense' : themes.length ? 'sparse' : null;
// The in-game map's loot value outlines: red High, yellow Medium (sparse areas have none there).
export const ZONE_COLORS: Record<string, string> = { abundant: '232,84,70', dense: '240,190,40', sparse: '160,160,160' };
/** Loot zones in legend order (labels: maps.zones.<zone>). */
export const ZONES = ['abundant', 'dense', 'sparse'] as const;

/** Condition image in public/images/events (snake_case of the English name). */
export const conditionImage = (name: string) => `/images/events/${name.toLowerCase().replace(/[^a-z]+/g, '_')}.png`;
