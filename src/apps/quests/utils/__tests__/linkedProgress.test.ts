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
  objectiveLeafKeys: [],
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
    id: 'blue_gate_content_unlock',
    name: 'Play 18 rounds',
    category: 'unlock',
    unlock: { kind: 'rounds', label: 'Play 18 rounds' },
    trader: '',
    map: [],
    previousQuestIds: [],
    nextQuestIds: ['picking_up_the_pieces'],
  },
  {
    ...base,
    id: 'picking_up_the_pieces',
    name: 'Picking Up The Pieces',
    trader: 'Shani',
    map: ['dam-battleground'],
    previousQuestIds: ['blue_gate_content_unlock'],
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
  it('treats unlock nodes as done in ArcTracker linked mode', () => {
    const completed = buildLinkedCompletedQuestSet(TEST_QUESTS, {
      source: 'arctracker',
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      questsById: {
        cold_storage: { state: 'unknown', completed: false },
        picking_up_the_pieces: { state: 'unknown', completed: false },
      },
    });

    expect(completed.has('blue_gate_content_unlock')).toBe(true);
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

  it('takes an unlock node from the Embark state of its hidden quest', () => {
    const snapshot = (unlockState: 'completed' | 'active') => ({
      source: 'embark' as const,
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      questsById: {
        blue_gate_content_unlock: { state: unlockState, completed: unlockState === 'completed' },
        picking_up_the_pieces: { state: 'locked' as const, completed: false },
      },
    });
    expect(buildLinkedCompletedQuestSet(TEST_QUESTS, snapshot('completed')).has('blue_gate_content_unlock')).toBe(true);
    expect(buildLinkedCompletedQuestSet(TEST_QUESTS, snapshot('active')).has('blue_gate_content_unlock')).toBe(false);
  });
});
