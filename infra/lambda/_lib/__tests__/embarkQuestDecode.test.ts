import { describe, expect, it } from 'vitest';
import { decodeEmbarkQuests } from '../embarkQuestDecode';

describe('decodeEmbarkQuests', () => {
  it('maps completed runtime quests onto ArcTracker ids', () => {
    const snapshot = decodeEmbarkQuests({
      quests: [
        {
          gameAssetId: 112215912,
          state: 'COMPLETED',
          objectives: [
            { gameAssetId: 958797715, amount: 1 },
            { gameAssetId: 659970249, amount: 1 },
          ],
        },
      ],
    }, {
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      rawSnapshotId: 'raw-1',
    });

    expect(snapshot.questsById.cold_storage).toEqual({
      state: 'completed',
      completed: true,
      objectives: [
        { completed: true, currentAmount: 1, requiredAmount: 1 },
        { completed: true, currentAmount: 1, requiredAmount: 1 },
      ],
    });
  });

  it('preserves partial accepted objective progress using required thresholds', () => {
    const snapshot = decodeEmbarkQuests({
      quests: [
        {
          gameAssetId: 411112619,
          state: 'ACCEPTED',
          objectives: [
            { gameAssetId: 492609098, amount: 1 },
            { gameAssetId: 719256869, amount: 2 },
          ],
        },
      ],
    }, {
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      rawSnapshotId: 'raw-2',
    });

    expect(snapshot.questsById.in_my_image).toEqual({
      state: 'active',
      completed: false,
      objectives: [
        { completed: true, currentAmount: 1, requiredAmount: 1 },
        { completed: false, currentAmount: 2, requiredAmount: 3 },
      ],
    });
  });

  it('marks awaiting quests as locked and missing quests as unknown', () => {
    const snapshot = decodeEmbarkQuests({
      quests: [
        {
          gameAssetId: 120673543,
          state: 'AWAITING',
          objectives: [],
        },
      ],
    }, {
      syncedAt: '2026-05-25T10:00:00.000Z',
      cachedAt: 1,
      rawSnapshotId: 'raw-3',
    });

    expect(snapshot.questsById.a_toxic_trail.state).toBe('locked');
    expect(snapshot.questsById.cold_storage.state).toBe('unknown');
  });
});
