import type { GlyphName } from '../../components';

/**
 * Hand-curated membership of the New items groups, by item slug. The game data has no flag for
 * these (the Fallen Emperor chain and the decoration trinkets only differ by name), so they are
 * listed here; everything else is derived from the data.
 */

/** The Fallen Emperor dungeon chain, in the order a player meets the items. */
export const FALLEN_EMPEROR_ITEMS: readonly string[] = [
  'emperor_beacon',
  'ruined_emperor_beacon',
  'emperor_gateway_conduit_blueprint',
  // The game data names these two the other way round (slug "plated" is "ARC Insulated Coupler");
  // the order follows the displayed names: Plated, Insulated, Conductive.
  'arc_insulated_coupler',
  'arc_plated_coupler',
  'arc_conductive_coupler',
  'emperor_gateway_conduit',
];

/** Trinkets you place in the Outpost as decoration. */
export const DECORATION_ITEMS: readonly string[] = ['archive_desk_lamp', 'bureau_desk_lamp', 'desk_lamp', 'potted_plant'];

/** Keys that open locked rooms on Pendola Pass (the Emperor Gateway Conduit belongs to Fallen Emperor). */
export const PENDOLA_KEYS: readonly string[] = [
  'pendola_pass_old_town_key',
  'pendola_pass_observatory_key',
  'pendola_pass_railyard_key',
  'pendola_pass_train_station_key',
];

/** Quest items whose objective is not known yet; they get one shared card. */
export const QUEST_ITEMS_WITHOUT_OBJECTIVE: readonly string[] = ['nomad_tech_item', 'unknown_arc_circuitry'];

/** Fallen Emperor guide: the item shown on each of the five steps (null = the beacon glyph). */
export const EMPEROR_STEP_ITEMS: readonly { item: string | null; blueprint?: boolean }[] = [
  { item: 'emperor_beacon' },
  { item: null },
  { item: 'emperor_gateway_conduit_blueprint', blueprint: true },
  { item: 'arc_insulated_coupler' },
  { item: 'emperor_gateway_conduit' },
];

/** The item category of the weapon-bearing "new gear" derivation. */
export const GEAR_CATEGORIES = { gadget: 'Gadget', grenade: 'Utility.Grenade' } as const;

/** Header style of a group: a game glyph (or the lucide quest icon) on a tinted square. */
export interface GroupStyle {
  glyph?: GlyphName;
  /** The lucide icon the sidebar uses for the quest tracker. */
  lucide?: 'quest';
  /** Accent colour of the stripe and the square tint. */
  accent: string;
  /** Draw the glyph on the blueprint background image. */
  blueprint?: boolean;
}

/** Path of the blueprint background used behind the blueprint glyph. */
export const BLUEPRINT_BG = '/images/rarities/blueprint_bg.png';

/**
 * Fixed accent palette, one colour per group so groups are easy to tell apart while scrolling.
 * Hues are spread around the wheel and stay readable on `$bg-secondary`.
 */
export const GROUP_STYLES: Record<string, GroupStyle> = {
  // New items
  unlocks: { glyph: 'outpost', accent: '#4fc3f7' },
  researchPoints: { glyph: 'research-points', accent: '#b388ff' },
  amplified: { glyph: 'amplified', accent: '#e88629' },
  researchBlueprints: { glyph: 'blueprint', accent: '#5c9dff', blueprint: true },
  newGear: { glyph: 'gadget', accent: '#26bf57' },
  fallenEmperor: { glyph: 'beacon', accent: '#e05d5d' },
  crafting: { glyph: 'crafting', accent: '#ffb300' },
  furnitureDecoration: { glyph: 'decoration', accent: '#bc8f5f' },
  stencils: { glyph: 'stencil', accent: '#cc3099' },
  keys: { glyph: 'key', accent: '#26c6da' },
  trades: { glyph: 'trade', accent: '#90a4ae' },
  noUse: { glyph: 'workbench', accent: '#777777' },
  // Old items (round-2 grouping)
  outpost: { glyph: 'outpost', accent: '#4fc3f7' },
  researchStation: { glyph: 'research-station', accent: '#7986cb' },
  gunsmith4: { glyph: 'gunsmith', accent: '#ef6c00' },
  furniture: { glyph: 'decoration', accent: '#bc8f5f' },
  quests: { lucide: 'quest', accent: '#81c784' },
};

export function groupStyle(id: string): GroupStyle {
  return GROUP_STYLES[id] ?? { glyph: 'workbench', accent: '#777777' };
}
