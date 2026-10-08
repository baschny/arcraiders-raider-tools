import { describe, it, expect } from 'vitest';
import { catalogToItems, consolidateWeaponTiers } from '../dataLoader';
import type { ItemCatalog, CatalogItem } from '../../../../shared/gamedata/catalog';

const ci = (id: string, extra: Partial<CatalogItem>): CatalogItem =>
  ({ id, name: `N ${id}`, nameEn: `E ${id}`, description: 'd', category: 'Firearm.LMG', categoryName: 'LMG', rarity: 'Rare', icon: `${id}.png`, value: 1, stackSize: 1, craftQuantity: 1, isWeapon: true, inRaidCraftable: false, blueprintLocked: false, ...extra }) as CatalogItem;

const catalog = {
  items: {
    w_one: ci('w_one', { baseId: 'w_one', tier: 1, recipe: { metal: 5 }, craftBench: 'gunsmith', upgradeCost: { gears: 1 } }),
    w_two: ci('w_two', { baseId: 'w_one', tier: 2, upgradesFrom: 'w_one', upgradeCost: { gears: 2 } }),
    w_three: ci('w_three', { baseId: 'w_one', tier: 3, upgradesFrom: 'w_two' }),
    junk: ci('junk', { category: 'Misc', categoryName: 'Misc', isWeapon: false, baseId: 'junk', tier: 1 }),
  },
  recipes: {}, research: {}, arctrackerAliases: {}, aliases: {},
} as unknown as ItemCatalog;

describe('loot-helper catalog mapping', () => {
  it('maps catalog fields to the app shape', () => {
    const j = catalogToItems(catalog).find((i) => i.id === 'junk')!;
    expect(j.name).toEqual({ en: 'N junk' });
    expect(j.originalNameEn).toBe('E junk');
    expect(j.imageFilename).toBe('junk.png');
    expect(j.weaponBaseId).toBeUndefined();
  });

  it('consolidates weapon tiers by baseId into the highest tier', () => {
    const out = consolidateWeaponTiers(catalogToItems(catalog));
    expect(out.map((i) => i.id).sort()).toEqual(['junk', 'w_three']);
    const top = out.find((i) => i.id === 'w_three')!;
    expect(top.weaponBaseId).toBe('w_one');
    expect(top.recipe).toEqual({ metal: 5, gears: 3 });
  });
});
