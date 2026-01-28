import type { Quest } from '../types/quest';

// Map prerequisite nodes (not from arctracker data)
export const MAP_NODES: Quest[] = [
  {
    id: 'map_dam_battleground',
    name: 'Dam Battleground',
    trader: 'Map',
    map: ['dam_battlegrounds'],
    previousQuestIds: [],
    nextQuestIds: ['ss1'],
    hasBlueprint: false,
  },
  {
    id: 'map_blue_gate',
    name: 'Blue Gate',
    trader: 'Map',
    map: ['the_blue_gate'],
    previousQuestIds: [],
    nextQuestIds: ['ss11'],
    hasBlueprint: false,
  },
  {
    id: 'map_stella_montis',
    name: 'Stella Montis',
    trader: 'Map',
    map: ['stella_montis_upper'],
    previousQuestIds: [],
    nextQuestIds: ['12_in_my_image'],
    hasBlueprint: false,
  },
];

// Map name mapping for display
export const MAP_NAME_MAPPING: Record<string, string> = {
  dam_battlegrounds: 'Dam\u00A0Battlegrounds',
  buried_city: 'Buried\u00A0City',
  the_spaceport: 'Spaceport',
  the_blue_gate: 'The\u00A0Blue\u00A0Gate',
  stella_montis: 'Stella\u00A0Montis',
};

// Trader image paths
export const TRADER_IMAGES: Record<string, string> = {
  Celeste: '/images/trader/celeste.png',
  Shani: '/images/trader/shani.png',
  Lance: '/images/trader/lance.png',
  'Tian Wen': '/images/trader/tian_wen.png',
  Apollo: '/images/trader/apollo.png',
};

// Map image paths
export const MAP_IMAGES: Record<string, string> = {
  map_dam_battleground: '/images/maps/dam-battleground.webp',
  map_blue_gate: '/images/maps/blue-gate.webp',
  map_stella_montis: '/images/maps/stella-montis.webp',
};

// Quests that reward blueprints
export const BLUEPRINT_QUESTS = new Set(['ss10a', 'ss10n', 'ss8b', 'ss10u']);

// LocalStorage key for quest progress
export const STORAGE_KEY = 'arcraiders-quest-progress-reactflow';
