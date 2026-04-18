import type { Quest } from '../types/quest';

// Default empty quest detail fields used for MAP_NODES (which don't carry
// quest descriptions, objectives, or item references).
const mapNodeDetails = (): Pick<
  Quest,
  | 'description'
  | 'objectives'
  | 'objectivesOneRound'
  | 'otherRequirements'
  | 'grantedItems'
  | 'requiredItems'
  | 'rewardItems'
> => ({
  description: '',
  objectives: [],
  objectivesOneRound: false,
  otherRequirements: [],
  grantedItems: [],
  requiredItems: [],
  rewardItems: [],
});

// Map prerequisite nodes (not from arctracker data)
export const MAP_NODES: Quest[] = [
  {
    id: 'map_dam_battleground',
    name: 'Dam Battleground',
    trader: 'Map',
    map: ['dam_battlegrounds'],
    previousQuestIds: [],
    nextQuestIds: ['picking_up_the_pieces'],
    hasBlueprint: false,
    blueprintRewards: [],
    ...mapNodeDetails(),
  },
  {
    id: 'map_blue_gate',
    name: 'Blue Gate',
    trader: 'Map',
    map: ['the_blue_gate'],
    previousQuestIds: [],
    nextQuestIds: ['a_first_foothold'],
    hasBlueprint: false,
    blueprintRewards: [],
    ...mapNodeDetails(),
  },
  {
    id: 'map_stella_montis',
    name: 'Stella Montis',
    trader: 'Map',
    map: ['stella_montis_upper'],
    previousQuestIds: [],
    nextQuestIds: ['in_my_image'],
    hasBlueprint: false,
    blueprintRewards: [],
    ...mapNodeDetails(),
  },
];

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


// LocalStorage key for quest progress
export const STORAGE_KEY = 'arcraiders-quest-progress-reactflow';
