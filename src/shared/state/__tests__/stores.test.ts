import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lootStore, questsStore } from '../stores';

const QUESTS_LOCAL_KEY = 'rt_state_quests';

describe('questsStore concrete behavior', () => {
  beforeEach(async () => {
    localStorage.clear();
    await questsStore.setBackend('local');
    await questsStore.clearAll();
  });

  afterEach(async () => {
    await questsStore.setBackend('local');
    await questsStore.clearAll();
    localStorage.clear();
  });

  it('migrates legacy quest progress payloads into schema v2', async () => {
    localStorage.setItem(QUESTS_LOCAL_KEY, JSON.stringify({
      schemaVersion: 1,
      data: { completedQuestIds: ['ss1', '12_cold_storage'] },
    }));

    await questsStore.hydrate();

    expect(questsStore.get()).toEqual({
      mode: 'manual',
      manualCompletedQuestIds: ['picking_up_the_pieces', 'cold_storage'],
    });
  });

  it('preserves manual progress when switching between manual and linked modes', () => {
    questsStore.set({
      mode: 'manual',
      manualCompletedQuestIds: ['cold_storage', 'in_my_image'],
    });

    questsStore.set({
      ...questsStore.get(),
      mode: 'linked',
    });
    expect(questsStore.get()).toEqual({
      mode: 'linked',
      manualCompletedQuestIds: ['cold_storage', 'in_my_image'],
    });

    questsStore.set({
      ...questsStore.get(),
      mode: 'manual',
    });
    expect(questsStore.get()).toEqual({
      mode: 'manual',
      manualCompletedQuestIds: ['cold_storage', 'in_my_image'],
    });
  });
});

describe('lootStore schema v2 (game classification filters)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await lootStore.setBackend('local');
    await lootStore.clearAll();
  });

  afterEach(async () => {
    await lootStore.setBackend('local');
    await lootStore.clearAll();
    localStorage.clear();
  });

  it('drops type and location filters stored with English names, keeps goals and rarities', async () => {
    localStorage.setItem('rt_state_loot', JSON.stringify({
      schemaVersion: 1,
      data: {
        goalItems: ['anvil'],
        disabledItems: [],
        stashItems: ['bandage'],
        disabledStashItems: [],
        enabledTypes: ['Quick Use', 'Topside Material'],
        enabledRarities: ['Common', 'Rare'],
        enabledLocations: ['Old World', 'Medical'],
      },
    }));

    await lootStore.hydrate();

    expect(lootStore.get()).toEqual({
      goalItems: ['anvil'],
      disabledItems: [],
      stashItems: ['bandage'],
      disabledStashItems: [],
      enabledTypes: null,
      enabledRarities: ['Common', 'Rare'],
      enabledLocations: null,
    });
  });
});
