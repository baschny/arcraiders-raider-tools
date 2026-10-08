/**
 * Game data v2 — the site schema (layer 2). Single source of truth for the files under
 * public/data/game/ written by scripts/generate-game-data.ts and read by loadDomain().
 *
 * Spec: docs/Game-Data.md
 *
 * Conventions
 * - Every public ID is a slug. A slug is unique within its domain; reference fields name the
 *   domain they point to (itemId, benchId, questId, …). No Embark asset IDs in public files.
 * - Each domain is split into a locale-independent structure file `<domain>.json` and one text
 *   file per locale `<domain>.text.<locale>.json`. loadDomain() merges them.
 * - English names needed for search/sorting regardless of locale live in the structure
 *   (`nameEn`), localized text only in the text files.
 * - Empty arrays/objects are always omitted by the writer, so every list field is optional;
 *   consumers treat a missing list as empty.
 */

export const GAME_DATA_SCHEMA_VERSION = 2;

export type GameDomain =
  | 'items'
  | 'recipes'
  | 'research'
  | 'blueprints'
  | 'trades'
  | 'benches'
  | 'outpost'
  | 'stencils'
  | 'projects'
  | 'quests'
  | 'skilltree'
  | 'amplification'
  | 'maps'
  | 'classification'
  | 'whats-new';

/** Text file of a domain: slug → text fields (all strings already localized, en fallback applied). */
export type TextFile = Record<string, TextEntry>;

export interface TextEntry {
  name?: string;
  description?: string;
  /** Nested texts, e.g. quest objectives by node key, project phases/steps/goals by key. */
  [field: string]: string | Record<string, string | Record<string, string>> | undefined;
}

// ---------------------------------------------------------------------------------------------
// Shared value types

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Amplified';

/** Rarity names in level order (level = index + 1). */
export const RARITIES: readonly Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Amplified'];

export interface Amount {
  itemId: string;
  quantity: number;
}

/** Reward entry; `chance` (0..1) is set for entries of random pools. */
export interface Reward extends Amount {
  chance?: number;
}

export type Cost =
  | { items: Amount[] }
  | { scrapValue: number; itemIds?: string[]; tags?: string[] };

export type RequirementKind = 'item' | 'unlock' | 'bench' | 'outpostLevel' | 'project' | 'quest' | 'skill';

/**
 * A gate resolved into meaning ("needs Gunsmith 4", "needs Outpost level 2", "needs research
 * quest X"). `id` is a slug of the domain implied by `kind` (bench → benches, quest → quests,
 * item/unlock → items, project → projects, skill → skilltree); for outpostLevel `id` is the level as string.
 */
export interface Requirement {
  kind: RequirementKind;
  id: string;
  amount?: number;
  /** For kind 'bench': the required level. */
  level?: number;
}

// ---------------------------------------------------------------------------------------------
// items

/**
 * One game-defined item stat. Texts (title, format) are in the text file under
 * `effects.<index>.{title,format}`; `value` is rendered into the format (`{0}`).
 * Defaults are omitted: `showSign` false, `positive` true. Overlay-sourced effects have no format
 * and carry their display value in `valueText`.
 */
export interface ItemEffect {
  value?: number;
  valueText?: string;
  showSign?: true;
  positive?: false;
}

export interface Item {
  id: string;
  nameEn: string;
  /**
   * Classification from the game (short ids, see the `classification` domain): item category tag
   * (`Utility.Grenade`), stash group (`Utilities`) and subgroup (`Utility.Grenade`). Absent when the
   * game does not classify the item (or does not list it in the stash).
   */
  category?: string;
  group?: string;
  subgroup?: string;
  /** Absent = the game gives the item no rarity. */
  rarity?: Rarity;
  icon: string;
  value: number;
  stackSize: number;
  weightKg?: number;
  tags?: string[];
  addedIn?: string;
  // explicit relationships
  baseId?: string;
  tier?: number;
  upgradesTo?: { itemId: string; cost: Cost; requires?: Requirement[] }[];
  upgradesFrom?: string[];
  blueprintFor?: string;
  blueprintId?: string;
  amplifiedFrom?: string;
  recyclesInto?: Reward[];
  salvagesInto?: Reward[];
  repairCost?: Amount[];
  repairDurability?: number;
  /** Slot type (muzzle, special, …) → compatible mod item slugs. */
  modSlots?: Record<string, string[]>;
  /** Item stats in game order; texts in the text file under `effects.<index>`. */
  effects?: ItemEffect[];
  questItem?: boolean;
  // precomputed reverse lookups
  craftedBy?: string[];
  researchedBy?: string[];
  usedIn?: {
    recipes?: string[];
    research?: string[];
    benches?: string[];
    projects?: string[];
    quests?: string[];
    trades?: string[];
    outpost?: string[];
  };
  soldBy?: string[];
  recycledFrom?: string[];
  rewardedBy?: { quests?: string[]; projects?: string[] };
  /** Theme ids (`Residential`, `OldWorld`, `ARC`); labels in `classification` text `themes.<id>`. */
  foundIn?: string[];
}

export interface ItemsStructure {
  items: Record<string, Item>;
  /** arctracker item id → our slug, only where they differ (arctracker API translation). */
  arctrackerAliases?: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// offers: recipes, research, blueprints, trades

export interface Offer {
  id: string;
  cost: Cost;
  requires?: Requirement[];
  rewards?: Reward[];
  durationSeconds?: number;
  visible: boolean;
}

export interface Recipe extends Offer {
  station: 'bench' | 'in_raid';
  benchId?: string;
  benchLevel?: number;
}

export interface Research extends Offer {
  benchId: string;
  benchLevel: number;
  /** Research Points amount, also contained in cost. */
  researchPoints: number;
}

export interface Blueprint extends Offer {
  blueprintItemId: string;
  unlocksItemId?: string;
}

export interface Trade extends Offer {
  traderId: string;
  limit?: { max: number; refreshSeconds: number };
}

export interface Trader {
  id: string;
  nameEn: string;
}

export interface RecipesStructure {
  recipes: Record<string, Recipe>;
}
export interface ResearchStructure {
  research: Record<string, Research>;
}
export interface BlueprintsStructure {
  blueprints: Record<string, Blueprint>;
}
export interface TradesStructure {
  trades: Record<string, Trade>;
  traders: Record<string, Trader>;
}

// ---------------------------------------------------------------------------------------------
// benches

export interface BenchLevel {
  level: number;
  icon: string | null;
  buildCost?: Amount[];
  requires?: Requirement[];
  recipes?: string[];
  research?: string[];
  /** Scrappy: what the level can produce per round (RoundCrafting offers). */
  produces?: Reward[];
}

export interface Bench {
  id: string;
  nameEn: string;
  maxLevel: number;
  levels: BenchLevel[];
}

export interface BenchesStructure {
  benches: Record<string, Bench>;
}

// ---------------------------------------------------------------------------------------------
// outpost

export interface OutpostRoom {
  id: string;
  nameEn: string;
  slots?: string[];
  /** Build offers, one per outpost level the room can be installed at (sorted by required level). */
  crafts?: { offerId: string; cost: Cost; requires?: Requirement[] }[];
}

export interface OutpostSlot {
  id: string;
  nameEn: string;
  allowedCategories?: string[];
  allowedFurniture?: string[];
}

export interface OutpostFurniture {
  /** Same slug as the furniture item in `items`. */
  id: string;
  category: string;
  placement?: string;
  size?: { x: number; y: number };
  craft?: { offerId: string; cost: Cost; requires?: Requirement[] };
  designId?: string;
}

export interface OutpostDesign {
  /** Same slug as the design item in `items`. */
  id: string;
  learn?: { offerId: string; cost: Cost; requires?: Requirement[] };
  unlocks?: string[];
  researchedBy?: string[];
}

export interface OutpostLevel {
  level: number;
  /** Rooms that must be installed. */
  roomsInstalled: number;
  rewards?: Reward[];
}

export interface OutpostStructure {
  rooms: Record<string, OutpostRoom>;
  slots: Record<string, OutpostSlot>;
  furniture: Record<string, OutpostFurniture>;
  designs: Record<string, OutpostDesign>;
  levels: OutpostLevel[];
}

// ---------------------------------------------------------------------------------------------
// stencils

export interface Stencil {
  /** Same slug as the stencil item in `items`. */
  id: string;
  slotId?: string;
  appliesTo?: string[];
  craft?: { offerId: string; cost: Cost; requires?: Requirement[] };
}

export interface StencilSlot {
  id: string;
  nameEn: string;
  allowed?: string[];
}

export interface StencilsStructure {
  stencils: Record<string, Stencil>;
  slots: Record<string, StencilSlot>;
}

// ---------------------------------------------------------------------------------------------
// projects

export type ProjectType = 'general' | 'expedition' | 'seasonal' | 'event';

export interface ProjectGoal {
  /** Stable key within the project (text lookup: `<projectId>.goals.<key>`). */
  key: string;
  goalType: 'items' | 'value' | string;
  amount: number;
  itemIds?: string[];
  tags?: string[];
  required: boolean;
  repeatable?: boolean;
  rewards?: Reward[];
}

export interface ProjectStep {
  key: string;
  goals?: ProjectGoal[];
  rewards?: Reward[];
}

export interface ProjectPhase {
  key: string;
  steps?: ProjectStep[];
}

export interface Project {
  id: string;
  nameEn: string;
  type: ProjectType;
  start?: string;
  end?: string;
  /** Expedition number for type 'expedition'. */
  expedition?: number;
  phases?: ProjectPhase[];
  rewards?: Reward[];
}

export interface ProjectsStructure {
  projects: Record<string, Project>;
}

// ---------------------------------------------------------------------------------------------
// quests

export type QuestCategory = 'main' | 'side' | 'research' | 'daily' | 'weekly' | 'project' | 'mastery';

export type ObjectiveKind = 'atomic' | 'sequence' | 'allOf' | 'anyOf' | 'anyOfExclusive' | 'nOf';

export interface ObjectiveNode {
  /** Index path within the quest, e.g. '0.2.1' (text lookup: `<questId>.objectives.<key>`). */
  key: string;
  kind: ObjectiveKind;
  requiredCount?: number;
  oneRound?: boolean;
  optional?: boolean;
  hidden?: boolean;
  action?: {
    type: string;
    amount: number;
    itemId?: string;
    targetId?: string;
    mapIds?: string[];
  };
  children?: ObjectiveNode[];
}

export interface QuestRequirement {
  questId?: string;
  mapId?: string;
  raids?: number;
}

export interface Quest {
  id: string;
  nameEn: string;
  category: QuestCategory;
  traderId?: string;
  mapIds?: string[];
  requires?: QuestRequirement[];
  next?: string[];
  objective: ObjectiveNode;
  rewards?: { accept?: Reward[]; complete?: Reward[]; optionals?: Reward[]; xp?: number };
  hidden?: boolean;
  addedIn?: string;
}

export interface QuestsStructure {
  quests: Record<string, Quest>;
}

// ---------------------------------------------------------------------------------------------
// skilltree

export interface SkillNode {
  id: string;
  nameEn: string;
  category: string;
  parents?: string[];
  children?: string[];
  maxLevel: number;
  minTotalInvestment: number;
  requireAllParents: boolean;
  root?: boolean;
}

export interface SkillGroup {
  id: string;
  nodes: string[];
  maxSelectable: number;
  minTotalInvestmentOverridePerUnlock?: number[];
}

export interface SkilltreeStructure {
  nodes: Record<string, SkillNode>;
  groups: Record<string, SkillGroup>;
}

// ---------------------------------------------------------------------------------------------
// amplification

export interface AmplificationBranch {
  itemId: string;
  cost: Cost;
  requires?: Requirement[];
}

export interface AmplifiedWeapon {
  /** baseId of the weapon chain. */
  id: string;
  /** Weapon item the amplification starts from (usually the highest tier). */
  fromItemId: string;
  variants?: string[];
  graph: Record<string, AmplificationBranch[]>;
  repairItemId?: string;
}

export interface AmplificationStructure {
  weapons: Record<string, AmplifiedWeapon>;
}

// ---------------------------------------------------------------------------------------------
// maps

export interface GameMap {
  id: string;
  nameEn: string;
}

export interface MapEventType {
  id: string;
  nameEn: string;
  icon?: string;
  major?: boolean;
}

export interface MapsStructure {
  maps: Record<string, GameMap>;
  eventTypes: Record<string, MapEventType>;
}

// ---------------------------------------------------------------------------------------------
// domain → structure mapping

export interface ClassificationStructure {
  /** Level 1..6 and the in-game color (#RRGGBB) per rarity. */
  rarities: Record<Rarity, { level: number; color: string }>;
  /** Stash tabs in game order (without "All"), with subgroups; only groups with shipped items. */
  groups: { id: string; order: number; subgroups?: string[] }[];
  /** Categories and themes used by shipped items, plus their ancestors. */
  categories: Record<string, { parent?: string }>;
}

export interface DomainStructures {
  classification: ClassificationStructure;
  items: ItemsStructure;
  recipes: RecipesStructure;
  research: ResearchStructure;
  blueprints: BlueprintsStructure;
  trades: TradesStructure;
  benches: BenchesStructure;
  outpost: OutpostStructure;
  stencils: StencilsStructure;
  projects: ProjectsStructure;
  quests: QuestsStructure;
  skilltree: SkilltreeStructure;
  amplification: AmplificationStructure;
  maps: MapsStructure;
  'whats-new': WhatsNewStructure;
}

export interface FileEnvelope {
  schemaVersion: number;
  gameVersion: string | null;
  generatedFrom: string | null;
  aliases?: Record<string, string>;
}

export type DomainFile<D extends GameDomain> = FileEnvelope & DomainStructures[D];

/** What loadDomain() returns: structure + this locale's text. */
export interface LoadedDomain<D extends GameDomain> {
  structure: DomainFile<D>;
  text: TextFile;
  locale: string;
}

// ---------------------------------------------------------------------------------------------
// whats-new (domain 'whats-new'): the diff between two game versions, keyed by version slug.
// Built from embark-api arc-data/whats-new/<version>.json. Locale-independent; names come from
// the items catalog. Current-state system data lives in the outpost, research, blueprints,
// stencils, amplification, trades, benches and skilltree domains.

/** A bench level (research station level, Gunsmith 4, …); `bench` is a benches domain id. */
export interface WhatsNewBenchRef {
  bench: string;
  level: number;
}

/** A stash tier, identified by its slot count. */
export interface WhatsNewStashRef {
  stashSlots: number;
}

/**
 * What a use's `target` / `via` points at, by `system`:
 *  - item slug (items domain): most targets and `via`s (amplify, amplifyPerk, craft, outpostFurniture,
 *    outpostRoom, repair, research, stencil, trade, fieldCraft targets, craft `via` recipes)
 *  - WhatsNewBenchRef: `via` of craft/research/researchStation, `target` of benchUpgrade/researchStation
 *  - trader slug (trades domain): `via` of outpostFurniture, outpostRoom, trade, researchStation (NPC)
 *  - skill id (skilltree domain): field crafting skills (fieldCrafting only)
 *  - quest id (quests domain) / project id (projects domain): `target` of quest / project
 *  - WhatsNewStashRef: `target`/`via` of benchUpgrade for stash upgrades
 */
export type WhatsNewRef = string | WhatsNewBenchRef | WhatsNewStashRef;

export type WhatsNewSystem =
  | 'outpostRoom'
  | 'outpostFurniture'
  | 'researchStation'
  | 'benchUpgrade'
  | 'research'
  | 'amplify'
  | 'amplifyPerk'
  | 'repair'
  | 'craft'
  | 'fieldCraft'
  | 'stencil'
  | 'trade'
  | 'project'
  | 'quest';

/** `amount` units of the item are consumed by `target` (a price for `trade`). */
export interface WhatsNewUse {
  system: WhatsNewSystem;
  target: WhatsNewRef;
  amount: number;
  /** The recipe / bench / NPC through which the use happens; absent for repair, quest, project. */
  via?: WhatsNewRef;
}

export type WhatsNewVerdict = 'keep' | 'optional' | 'quest' | 'sell';
export type WhatsNewItemGroup = 'material' | 'gadget' | 'study' | 'key' | 'module' | 'perkPart' | 'quest' | 'blueprint' | 'other';

export interface WhatsNewNewItem {
  /** Item slug (items domain). */
  id: string;
  group: WhatsNewItemGroup;
  /** keep: needed by a fixed path; optional: research/furniture/craft only; quest; sell: no use. */
  verdict: WhatsNewVerdict;
  /** keep only: amount over the fixed paths (4 outpost installs, Research Station, Gunsmith 4, Amplify). */
  keepCount?: number;
  uses?: WhatsNewUse[];
  recyclesInto?: Amount[];
}

export interface WhatsNewExistingItem {
  id: string;
  gained?: WhatsNewUse[];
  lost?: WhatsNewUse[];
}

export type WhatsNewKeepPathId = 'outpostExpansions' | 'researchStation' | 'gunsmith4' | 'amplify';

export interface WhatsNewKeepPath {
  id: WhatsNewKeepPathId | string;
  /** Step key as written by the diff (Tier01, Build, Level 2, Gunsmith 4, "Amplification Module MK. I"). */
  steps: { label: string; cost: Amount[] }[];
}

export interface WhatsNewFieldRecipe {
  result: string;
  cost: Amount[];
  costBefore?: Amount[];
  /** Skill ids (skilltree domain) required now / before. */
  skills?: string[];
  skillsBefore?: string[];
  status: 'new' | 'unchanged' | 'changed';
}

/** A trade in a trader diff: paid with items, or with a scrap value (optionally limited to `scrapItems`). */
export interface WhatsNewTradeLine {
  result: string;
  cost?: Amount[];
  scrapValue?: number;
  scrapItems?: string[];
}

export interface WhatsNewTraderChange {
  /** Trader slug (trades domain). */
  npc: string;
  added?: WhatsNewTradeLine[];
  removed?: WhatsNewTradeLine[];
  priceChanged?: { result: string; before?: Amount[]; after?: Amount[] }[];
}

export interface WhatsNewChanges {
  recipes?: { result: string; bench: WhatsNewBenchRef; before?: Amount[]; after?: Amount[] }[];
  upgrades?: { from: string; to: string; before?: Amount[]; after?: Amount[] }[];
  repairs?: { id: string; before?: Amount[]; after?: Amount[] }[];
  recycling?: { id: string; before?: Amount[]; after?: Amount[] }[];
  traders?: WhatsNewTraderChange[];
  /** Stash tier upgrades by slot count; `before`/`after` are the upgrade costs. */
  stash?: { from: number; to: number; before?: Amount[]; after?: Amount[] }[];
}

export interface WhatsNewVersion {
  /** Version slug, e.g. 'frozen-trail'. */
  slug: string;
  /** Game version of the current state, e.g. '2.0'. */
  gameVersion: string;
  baselineLabel: string;
  summary: {
    newItems: number;
    newItemsListed?: number;
    newSystems: number;
    researchOffers: number;
    researchPointsTotal: number;
    newStashTiers: number;
  };
  /** Listed new items (verdict + uses). Cosmetics, Juanito and FieldSalvage are excluded. */
  newItems?: WhatsNewNewItem[];
  /** Existing items that gained or lost uses. */
  existingItems?: WhatsNewExistingItem[];
  keepPaths?: WhatsNewKeepPath[];
  blueprints?: { newlyResearchable?: string[]; findOnly?: string[] };
  designs?: { newlyResearchable?: string[]; findOnly?: string[] };
  fieldCrafting?: { skillsBefore?: string[]; skillsAfter?: string[]; recipes?: WhatsNewFieldRecipe[] };
  changes?: WhatsNewChanges;
}

export interface WhatsNewStructure {
  versions: Record<string, WhatsNewVersion>;
}
