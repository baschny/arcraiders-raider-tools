import { describe, expect, it } from 'vitest';
import type { RawItemsOutput } from '../../../../shared/types/item';
import itemsData from '../../../../../public/data/items/items.en.json';

const data = itemsData as RawItemsOutput;

describe('quartermaster weapon upgrade item data', () => {
  it('includes canonical upgrade metadata for weapon chains', () => {
    expect(data.items.anvil_i).toMatchObject({
      upgradesTo: 'anvil_ii',
      weaponBaseId: 'anvil_i',
      weaponTier: 1,
    });
    expect(data.items.anvil_ii).toMatchObject({
      upgradeCost: {
        mechanical_components: 3,
        simple_gun_parts: 1,
      },
      upgradesFrom: 'anvil_i',
      upgradesTo: 'anvil_iii',
      weaponBaseId: 'anvil_i',
      weaponTier: 2,
    });
    expect(data.items.anvil_iv).toMatchObject({
      upgradeCost: {
        heavy_gun_parts: 1,
        mechanical_components: 4,
      },
      upgradesFrom: 'anvil_iii',
      weaponBaseId: 'anvil_i',
      weaponTier: 4,
    });
  });

  it('does not derive weapon tiers for unlinked upgrade-cost items', () => {
    expect(data.items.canto_ii?.upgradeCost).toBeDefined();
    expect(data.items.canto_ii?.weaponBaseId).toBeUndefined();
    expect(data.items.canto_ii?.weaponTier).toBeUndefined();
  });
});
