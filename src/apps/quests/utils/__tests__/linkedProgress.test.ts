import { describe, expect, it } from 'vitest';
import type { Quest } from '../../types/quest';
import {
  buildLinkedCompletedQuestSet,
  getObjectiveProgressSummary,
  getQuestDisplayStatus,
} from '../linkedProgress';

const base = {
  category: 'main' as const,
  hasBlueprint: false,
  blueprintRewards: [],
  description: '',
  objectiveTree: null,
  objectives: [],
  objectivesOneRound: false,
  otherRequirements: [],
  grantedItems: [],
  requiredItems: [],
  rewardItems: [],
  optionalRewardItems: [],
};

const TEST_QUESTS: Quest[] = [
  {
    ...base,
    id: 'map_dam_battleground',
    name: 'Dam Battlegrounds',
    category: 'map',
    trader: 'Map',
    map: ['dam-battleground'],
    previousQuestIds: [],
    nextQuestIds: ['picking_up_the_pieces'],
  },
  {
    ...base,
    id: 'picking_up_the_pieces',
    name: 'Picking Up The Pieces',
    trader: 'Shani',
    map: ['dam-battleground'],
    previousQuestIds: ['map_dam_battleground'],
    nextQuestIds: ['cold_storage'],
  },
  {
    ...base,
    id: 'cold_storage',
    name: 'Cold Storage',
    trader: 'Shani',
    map: ['dam-battleground'],
    previousQuestIds: ['picking_up_the_pieces'],
    nextQuestIds: [],
  },
];

describe('linked quest progress helpers', () => {
  it('treats map nodes as unlocked in ArcTracker linked mode', () => {
    const completed = buildLinkedCompletedQuestSet(TEST_QUESTS, {
      source: 'arctracker',
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      questsById: {
        cold_storage: { state: 'unknown', completed: false },
        picking_up_the_pieces: { state: 'unknown', completed: false },
      },
    });

    expect(completed.has('map_dam_battleground')).toBe(true);
    expect(getQuestDisplayStatus({
      quest: TEST_QUESTS[1],
      linkedSnapshot: {
        source: 'arctracker',
        syncedAt: '2026-05-25T10:00:00.000Z',
        cachedAt: 1,
        questsById: {
          cold_storage: { state: 'unknown', completed: false },
          picking_up_the_pieces: { state: 'unknown', completed: false },
        },
      },
      linkedCompletedQuests: completed,
    })).toBe('available');
  });

  it('surfaces active Embark quests directly from runtime state', () => {
    const snapshot = {
      source: 'embark' as const,
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      questsById: {
        picking_up_the_pieces: {
          state: 'active' as const,
          completed: false,
          objectives: [
            { completed: true, currentAmount: 1, requiredAmount: 1 },
            { completed: false, currentAmount: 2, requiredAmount: 3 },
          ],
        },
      },
    };

    expect(getQuestDisplayStatus({
      quest: TEST_QUESTS[1],
      linkedSnapshot: snapshot,
      linkedCompletedQuests: buildLinkedCompletedQuestSet(TEST_QUESTS, snapshot),
    })).toBe('active');
    expect(getObjectiveProgressSummary(snapshot.questsById.picking_up_the_pieces)).toEqual({
      completed: 1,
      total: 2,
    });
  });
});
