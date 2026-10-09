/**
 * The ARC Raiders terms of the glossary (src/shared/i18n/glossary.json), hand-kept.
 *
 * Each term points to the game text that carries the official wording (`game`: "<string table>/<key>"
 * in the game's localization, Game/<locale>/Game.json); `npm run generate:glossary` fills in all
 * languages from the current game version. Terms the game has no text for get `manual` translations.
 * `manual` also overrides a game translation for one language (say why in `notes`).
 */
import type { AppLocale } from '../../src/shared/i18n/config';

export interface GlossaryTermSource {
  /** Stable id, used in code (getGlossaryTerm) and in reports. */
  id: string;
  /** The English term as it is used on the site; checked against the game text. */
  en: string;
  /** Game text with the official wording, "<string table>/<key>". */
  game?: string;
  /** Translations not taken from the game (no game text, or a deliberate override). */
  manual?: Partial<Record<AppLocale, string>>;
  /** Guidance for translators: what the term means and where it is used. */
  notes?: string;
}

export const GLOSSARY_TERMS: GlossaryTermSource[] = [
  // Places and meta progression
  { id: 'topside', en: 'Topside', game: 'ST_Onboarding_Tooltips/ID_ONBOARDINGTOOLTIPS_TOPSIDE_TITLE', notes: 'The surface where raids take place.' },
  { id: 'raiderDen', en: 'Raider Den', game: 'ST_RaiderProjects/ID_RAIDER_PROJECTS_EXPLANATION_DETAILS_RESET_8', notes: "The player's underground home base." },
  { id: 'workshop', en: 'Workshop', game: 'ST_Chambers/ID_CHAMBERS_TITLE', notes: 'Where the crafting benches are; replaced the old "Hideout" wording.' },
  { id: 'outpost', en: 'Outpost', game: 'ST_Outpost/ID_OUTPOST_TAB', notes: 'Since 2.0 Frozen Trail: the expandable base with rooms and furniture.' },
  { id: 'rooms', en: 'Rooms', game: 'ST_Outpost/ID_OUTPOST_MODULES', notes: 'The expansion slots of the Outpost.' },
  { id: 'furniture', en: 'Furniture', game: 'ST_Outpost/ID_OUTPOST_MENU_FURNITURE' },
  { id: 'decoration', en: 'Decoration', game: 'ST_Outpost_Furniture/ID_OUTPOST_FURNITURE_DECORATION' },
  { id: 'stash', en: 'Stash', game: 'ST_Inventory/ID_INVENTORY_STASH_HEADER', notes: 'The player storage between raids.' },
  { id: 'loadout', en: 'Loadout', game: 'ST_Inventory/ID_INVENTORY_LOADOUT_HEADER', notes: 'The kit taken into a raid.' },
  { id: 'inventory', en: 'Inventory', game: 'ST_Frontend/ID_FRONTEND_TAB_INVENTORY' },
  { id: 'backpack', en: 'Backpack', game: 'ST_ItemCategory/ID_ITEMCATEGORY_BACKPACK' },
  { id: 'safePocket', en: 'Safe Pocket', game: 'ST_IngameInventoryScreen/ID_INGAME_INVENTORY_SAFE_POCKET' },
  { id: 'raider', en: 'Raider', game: 'ST_CharacterScreen/SLOT_RAIDER', notes: 'The player character.' },
  { id: 'arc', en: 'ARC', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_ARC', notes: 'The hostile machines; always upper case.' },
  { id: 'quests', en: 'Quests', game: 'ST_Frontend/ID_FRONTEND_TAB_QUESTS' },
  { id: 'quest', en: 'Quest', game: 'ST_Onboarding_Tooltips/ID_ONBOARDINGTOOLTIPS_QUEST_TITLE' },
  { id: 'traders', en: 'Traders', game: 'ST_Frontend/ID_FRONTEND_TAB_TRADERS', notes: 'The NPC vendors (Celeste, Lance, …).' },
  { id: 'trader', en: 'Trader', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_TRADERCOMPONENT' },
  { id: 'trade', en: 'Trade', game: 'ST_Offers/ID_OFFERS_TRADE' },
  { id: 'projects', en: 'Projects', game: 'ST_RaiderProjects/ID_RAIDER_PROJECTS_TITLE', notes: 'Community/season projects with item requirements.' },
  { id: 'expedition', en: 'Expedition', game: 'ST_RaiderProjects/ID_RAIDER_PROJECTS_EXPEDITION_TITLE' },
  { id: 'trials', en: 'Trials', game: 'ST_Frontend/ID_MASTERY_TITLE' },
  { id: 'skillTree', en: 'Skill Tree', game: 'ST_SkillTrees/ID_SKILLTREES_SCREEN_TITLE' },
  { id: 'level', en: 'Level', game: 'ST_Chambers/ID_CHAMBERS_ROOM_LEVEL', notes: 'Bench / room level.' },
  { id: 'coins', en: 'Coins', game: 'ST_Currency/ID_CURRENCY_COINS' },
  { id: 'cred', en: 'Cred', game: 'ST_Currency/ID_CURRENCY_BATTLEPASS_POINTS' },
  { id: 'raiderTokens', en: 'Raider Tokens', game: 'ST_Currency/ID_CURRENCY_HARD_LONG' },
  { id: 'store', en: 'Store', game: 'ST_Frontend/ID_FRONTEND_TAB_STORE' },

  // Crafting and benches
  { id: 'craft', en: 'Craft', game: 'ST_Frontend/ID_FRONTEND_TAB_CRAFT' },
  { id: 'crafting', en: 'Crafting', game: 'ST_IngameMenu/ID_INGAME_TAB_CRAFTING' },
  { id: 'inRoundCrafting', en: 'In-Round Crafting', game: 'ST_CharacterSkills/ID_SKILL_TITLE_INROUNDCRAFTING', notes: 'Crafting during a raid (skill).' },
  { id: 'fieldCrafting', en: 'Field Crafting', game: 'ST_Onboarding_Tooltips/ID_ONBOARDINGTOOLTIPS_INGAME_PROMPT_FIELDCRAFTING_TITLE' },
  { id: 'recycle', en: 'Recycle', game: 'ST_Inventory/ID_INVENTORY_RECYCLE_BUTTON' },
  { id: 'recyclesInto', en: 'Recycles into', game: 'ST_Inventory/ID_INVENTORY_RECYCLE_HEADER' },
  { id: 'salvage', en: 'Salvage', game: 'ST_IngameInventoryScreen/ID_INGAME_INVENTORY_SALVAGE_BUTTON' },
  { id: 'salvagesInto', en: 'Salvages into', game: 'ST_Inventory/ID_INVENTORY_SALVAGE_HEADER' },
  { id: 'upgrade', en: 'Upgrade', game: 'ST_Inventory/ID_INVENTORY_UPGRADE_BUTTON' },
  { id: 'repair', en: 'Repair', game: 'ST_Inventory/ID_INVENTORY_REPAIR_BUTTON' },
  { id: 'durability', en: 'Durability', game: 'ST_Stats/ID_STATS_DURABILITY' },
  { id: 'blueprint', en: 'Blueprint', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_GENERATOR_BLUEPRINT', notes: 'Item that unlocks a crafting recipe.' },
  { id: 'blueprints', en: 'Blueprints', game: 'ST_Chambers/ID_CHAMBERS_BLUEPRINTS' },
  { id: 'design', en: 'Design', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_RECIPE_OUTPOSTFURNITURE', notes: 'Since 2.0: item that unlocks an Outpost furniture.' },
  { id: 'designs', en: 'Designs', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_RESEARCH_STATION_SUB_NAV_DESIGNS' },
  { id: 'workbench', en: 'Workbench', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_BASIC_BENCH' },
  { id: 'gunsmith', en: 'Gunsmith', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_WEAPON_BENCH' },
  { id: 'gearBench', en: 'Gear Bench', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_ARMOR_BENCH' },
  { id: 'medicalLab', en: 'Medical Lab', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_MED_STATION' },
  { id: 'explosivesStation', en: 'Explosives Station', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_EXPLOSIVES_BENCH' },
  { id: 'utilityStation', en: 'Utility Station', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_UTILITY_BENCH' },
  { id: 'refiner', en: 'Refiner', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_REFINER' },
  { id: 'scrappy', en: 'Scrappy', game: 'ST_CharacterScreen/ID_CHARACTERSCREEN_SCRAPPY', notes: 'The rooster that gathers materials.' },

  // Research and Amplified weapons (2.0 Frozen Trail)
  { id: 'research', en: 'Research', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_RESEARCH_STATION_HEADER_RESEARCH' },
  { id: 'researchStation', en: 'Research Station', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_RESEARCH_STATION' },
  { id: 'researchPoints', en: 'Research Points', game: 'ST_Currency/ID_CURRENCY_RESEARCH_POINTS', notes: 'Currency for research; abbreviated "RP" on the site.' },
  { id: 'amplification', en: 'Amplification', game: 'ST_CHAMBERSTATIONS/ID_CHAMBERSTATIONS_RESEARCH_STATION_SUB_NAV_AMPLIFICATION', notes: 'One upgrade option of an Amplified weapon; plural "Amplifications" on the site.' },
  { id: 'amplificationModule', en: 'Amplification Module', game: 'ST_Inventory/ID_INVENTORY_AMPLIFICATION_MODULE' },
  { id: 'amplified', en: 'Amplified', game: 'ST_Rarity/ID_RARITY_AMPLIFIED', notes: 'The weapon tier above Legendary.' },
  { id: 'stencil', en: 'Stencil', game: 'ST_ItemSkins/ID_ITEMSKINS_DISPLAY_TAG', notes: 'Weapon paint scheme.' },
  { id: 'stencils', en: 'Stencils', game: 'ST_ItemSkins/ID_ITEMSKINS_TABNAME' },

  // Item kinds and rarities
  { id: 'weapons', en: 'Weapons', game: 'ST_Inventory/ID_INVENTORY_FILTER_WEAPONS' },
  { id: 'weaponMods', en: 'Weapon Mods', game: 'ST_Inventory/ID_INVENTORY_FILTER_WEAPONMODS' },
  { id: 'mods', en: 'Mods', game: 'ST_Onboarding_Tooltips/ID_ONBOARDINGTOOLTIPS_MODS_TITLE' },
  { id: 'augment', en: 'Augment', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_AUGMENT' },
  { id: 'shield', en: 'Shield', game: 'ST_IngameInventoryScreen/ID_INGAME_INVENTORY_ARMOR' },
  { id: 'gadget', en: 'Gadget', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_GADGET' },
  { id: 'quickUse', en: 'Quick Use', game: 'ST_Inventory/ID_INVENTORY_FILTER_QUICKUSE' },
  { id: 'ammo', en: 'Ammo', game: 'ST_RaiderProjects/ID_RAIDER_PROJECTS_EXPEDITION_STEP_5_TYPE_1_AMMO' },
  { id: 'key', en: 'Key', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_KEY' },
  { id: 'keys', en: 'Keys', game: 'ST_Inventory/ID_INVENTORY_FILTER_KEYS' },
  { id: 'trinket', en: 'Trinket', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_JUNK', notes: 'Items only worth selling (and, since 2.0, decoration).' },
  { id: 'topsideMaterial', en: 'Topside Material', game: 'ST_ItemDisplayTags/ID_ITEMDISPLAYTAG_CRAFTINGMATERIAL_TOPSIDE' },
  { id: 'common', en: 'Common', game: 'ST_Rarity/RARITY_COMMON' },
  { id: 'uncommon', en: 'Uncommon', game: 'ST_Rarity/RARITY_UNCOMMON' },
  { id: 'rare', en: 'Rare', game: 'ST_Rarity/RARITY_RARE' },
  { id: 'epic', en: 'Epic', game: 'ST_Rarity/RARITY_EPIC' },
  { id: 'legendary', en: 'Legendary', game: 'ST_Rarity/RARITY_LEGENDARY' },

  // Maps and raids
  { id: 'map', en: 'Map', game: 'ST_IngameMenu/ID_INGAME_TAB_MAP' },
  { id: 'mapConditions', en: 'Map Conditions', game: 'ST_Onboarding_Tooltips/ID_ONBOARDINGTOOLTIPS_MAPCONDITIONS_TITLE', notes: 'Events/modifiers a map runs with (Night Raid, …).' },
  { id: 'loot', en: 'Loot', game: 'ST_Map/ID_LEGEND_CATEGORY_LOOT' },
  { id: 'raiderHatch', en: 'Raider Hatch', game: 'ST_Map/ID_MARKER_EXTRACTION_HATCH' },
  { id: 'raiderCache', en: 'Raider Cache', game: 'ST_WorldObjects/ID_WORLDOBJECT_RAIDERCACHE' },
  { id: 'supplyDrop', en: 'Supply Drop', game: 'ST_Map/ID_MARKER_SUPPLY_DROP' },
  { id: 'fieldCrate', en: 'Field Crate', game: 'ST_Map/ID_MARKER_FIELD_CRATE' },
  { id: 'arcProbe', en: 'ARC Probe', game: 'ST_Map/ID_MARKER_ARC_PROBE' },
  { id: 'damBattlegrounds', en: 'Dam Battlegrounds', game: 'ST_MapSelection/ID_MAPSELECTION_DAM_FULL' },
  { id: 'buriedCity', en: 'Buried City', game: 'ST_MapSelection/ID_MAPSELECTION_BURIEDCITY_FULL' },
  { id: 'spaceport', en: 'Spaceport', game: 'ST_MapSelection/ID_MAPSELECTION_SPACEPORT_TITLE' },
  { id: 'blueGate', en: 'The Blue Gate', game: 'ST_MapSelection/ID_MAPSELECTION_THEBLUEGATE_FULL' },
  { id: 'stellaMontis', en: 'Stella Montis', game: 'ST_Location_MountainCompound/ID_LOCATION_MOUNTAINCOMPOUND_STELLA_MONTIS' },
  { id: 'pendolaPass', en: 'Pendola Pass', game: 'ST_MapSelection/ID_MAPSELECTION_FROZENTRAIL_TITLE' },
  { id: 'frozenTrail', en: 'Frozen Trail', game: 'ST_BattlePass/ID_BATTLEPASS_CARD_FROZEN_TRAIL_HEADER', notes: 'Name of the 2.0 update.' },
  { id: 'nightRaid', en: 'Night Raid', game: 'ST_MapCondition/ID_MAPCONDITION_NIGHTRAID' },
  { id: 'electromagneticStorm', en: 'Electromagnetic Storm', game: 'ST_MapCondition/ID_MAPCONDITION_ELECTROMAGNETIC_STORM' },
  { id: 'solo', en: 'Solo', game: 'ST_MatchMaking/ID_MATCHMAKING_SOLO' },
  { id: 'squad', en: 'Squad', game: 'ST_MatchMaking/ID_MATCHMAKING_SQUAD' },

  // Site terms without game text
  {
    id: 'raid',
    en: 'Raid',
    manual: { de: 'Raid', 'pt-BR': 'Incursão' },
    notes: 'One round topside. No game text of its own; other languages: follow existing site usage.',
  },
];
