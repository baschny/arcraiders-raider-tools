import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAllItems } from '../dataLoader';
import { resetGameDataCache } from '../../../../shared/gamedata/loader';
import { resetItemCatalog } from '../../../../shared/gamedata/catalog';
import type { ItemsMap } from '../../types/item';
import { stubGameDataFetch } from './gameDataFetch';

describe('quartermaster weapon upgrade item data (v2 game data)', () => {
  let items: ItemsMap;
  beforeAll(async () => {
    stubGameDataFetch();
    items = await loadAllItems('en');
  });
  afterAll(() => {
    resetGameDataCache();
    resetItemCatalog();
  });

  it('includes canonical upgrade metadata for weapon chains', () => {
    expect(items.anvil_i).toMatchObject({ upgradesTo: 'anvil_ii', weaponBaseId: 'anvil_i', weaponTier: 1 });
    expect(items.anvil_ii).toMatchObject({ upgradesFrom: 'anvil_i', upgradesTo: 'anvil_iii', weaponBaseId: 'anvil_i', weaponTier: 2 });
    expect(Object.keys(items.anvil_ii.upgradeCost ?? {}).length).toBeGreaterThan(0);
    expect(items.anvil_iv).toMatchObject({ upgradesFrom: 'anvil_iii', weaponBaseId: 'anvil_i', weaponTier: 4 });
    expect(Object.keys(items.anvil_iv.upgradeCost ?? {}).length).toBeGreaterThan(0);
  });

  it('chains every weapon tier to its root via baseId', () => {
    for (const item of Object.values(items)) {
      if (!item.weaponTier) continue;
      expect(item.weaponBaseId, item.id).toBeTruthy();
      expect(items[item.weaponBaseId!], item.id).toBeDefined();
    }
  });

  it('does not tag non-weapons with weapon tiers', () => {
    expect(items.silencer_ii?.weaponTier).toBeUndefined();
    expect(items.silencer_ii?.weaponBaseId).toBeUndefined();
  });
});
