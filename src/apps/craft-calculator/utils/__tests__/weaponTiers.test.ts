import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { ItemCatalog, CatalogItem } from '../../../../shared/gamedata/catalog';

const ci = (id: string, extra: Partial<CatalogItem>): CatalogItem =>
  ({ id, name: id, nameEn: id, description: '', category: 'Firearm.LMG', rarity: 'Rare', icon: '', value: 1, stackSize: 1, craftQuantity: 1, isWeapon: true, inRaidCraftable: false, blueprintLocked: false, ...extra }) as CatalogItem;

// Deliberately slug-shape-free ids: tiers come from baseId/tier only.
const catalog = {
  items: {
    gun_a: ci('gun_a', { baseId: 'gun_a', tier: 1, recipe: { metal: 5 }, upgradesTo: 'gun_b', upgradeCost: { gears: 1 } }),
    gun_b: ci('gun_b', { baseId: 'gun_a', tier: 2, upgradesFrom: 'gun_a', upgradesTo: 'gun_c', upgradeCost: { gears: 2 } }),
    gun_c: ci('gun_c', { baseId: 'gun_a', tier: 3, upgradesFrom: 'gun_b' }),
  },
  recipes: {},
  research: {},
  arctrackerAliases: {},
  aliases: {},
} as unknown as ItemCatalog;

vi.mock('../../../../shared/gamedata/catalog', () => ({ loadItemCatalog: async () => catalog }));

import { loadItems, getItem } from '../itemData';
import { calculateTotalMaterials, getUpgradeBreakdown, isCraftableItem } from '../weaponTiers';

describe('weaponTiers (baseId/tier driven)', () => {
  beforeAll(async () => {
    await loadItems('en');
  });

  it('maps cost-to-reach from the previous tier', () => {
    expect(getItem('gun_b')?.upgradeCost).toEqual({ gears: 1 });
    expect(getItem('gun_c')?.upgradeCost).toEqual({ gears: 2 });
    expect(getItem('gun_a')?.upgradeCost).toBeUndefined();
  });

  it('sums base recipe and upgrades up to the tier', () => {
    expect(calculateTotalMaterials(getItem('gun_a')!)).toEqual({ metal: 5 });
    expect(calculateTotalMaterials(getItem('gun_c')!)).toEqual({ metal: 5, gears: 3 });
  });

  it('builds a per-tier breakdown', () => {
    expect(getUpgradeBreakdown(getItem('gun_c')!).map((b) => [b.tier, b.itemId])).toEqual([
      [1, 'gun_a'],
      [2, 'gun_b'],
      [3, 'gun_c'],
    ]);
  });

  it('treats upgrade tiers of a craftable base as craftable', () => {
    expect(isCraftableItem(getItem('gun_c')!)).toBe(true);
  });
});
