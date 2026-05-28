import { describe, expect, it } from 'vitest';
import { MAP_NODES } from '../../data/static-data';
import type { Quest } from '../../types/quest';
import {
  buildLinkedCompletedQuestSet,
  getObjectiveProgressSummary,
  getQuestDisplayStatus,
} from '../linkedProgress';

const TEST_QUESTS: Quest[] = [
  ...MAP_NODES,
  {
    id: 'picking_up_the_pieces',
    name: 'Picking Up The Pieces',
    trader: 'Shani',
    map: ['dam_battlegrounds'],
    previousQuestIds: ['map_dam_battleground'],
    nextQuestIds: ['cold_storage'],
    hasBlueprint: false,
    blueprintRewards: [],
    description: '',
    objectives: [],
    objectivesOneRound: false,
    otherRequirements: [],
    grantedItems: [],
    requiredItems: [],
    rewardItems: [],
  },
  {
    id: 'cold_storage',
    name: 'Cold Storage',
    trader: 'Shani',
    map: ['dam_battlegrounds'],
    previousQuestIds: ['picking_up_the_pieces'],
    nextQuestIds: [],
    hasBlueprint: false,
    blueprintRewards: [],
    description: '',
    objectives: [],
    objectivesOneRound: false,
    otherRequirements: [],
    grantedItems: [],
    requiredItems: [],
    rewardItems: [],
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
      quest: TEST_QUESTS[3],
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
      quest: TEST_QUESTS[3],
      linkedSnapshot: snapshot,
      linkedCompletedQuests: buildLinkedCompletedQuestSet(TEST_QUESTS, snapshot),
    })).toBe('active');
    expect(getObjectiveProgressSummary(snapshot.questsById.picking_up_the_pieces)).toEqual({
      completed: 1,
      total: 2,
    });
  });
});
