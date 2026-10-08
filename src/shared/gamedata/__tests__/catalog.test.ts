import { describe, expect, it } from 'vitest';
import { buildCatalogItem, buildClassification, emptyClassification, formatItemEffects, inheritTierBench, type CatalogItem } from '../catalog';
import type { Item, Recipe, Research } from '../types';

const item = (p: Partial<Item> & { id: string }): Item => ({
  nameEn: p.id,
  category: 'Firearm.AssaultRifle',
  rarity: 'Common',
  icon: '',
  value: 1,
  stackSize: 1,
  ...p,
});

const recipes: Record<string, Recipe> = {
  'recipes:gun_i': { id: 'recipes:gun_i', station: 'bench', benchId: 'weapon_bench', benchLevel: 1, visible: true, cost: { items: [{ itemId: 'metal', quantity: 3 }] }, rewards: [{ itemId: 'gun_i', quantity: 1 }], requires: [{ kind: 'unlock', id: 'gun_blueprint' }] },
  'recipes:bandage-wb': { id: 'recipes:bandage-wb', station: 'bench', benchId: 'workbench', benchLevel: 1, visible: true, cost: { items: [{ itemId: 'fabric', quantity: 2 }] }, rewards: [{ itemId: 'bandage', quantity: 2 }] },
  'recipes:bandage': { id: 'recipes:bandage', station: 'bench', benchId: 'med_station', benchLevel: 1, visible: true, cost: { items: [{ itemId: 'fabric', quantity: 1 }] }, rewards: [{ itemId: 'bandage', quantity: 1 }] },
};
const research: Record<string, Research> = {
  'research:gun_blueprint': { id: 'research:gun_blueprint', benchId: 'research_station', benchLevel: 2, researchPoints: 3000, visible: true, cost: { items: [{ itemId: 'research_points', quantity: 3000 }] }, rewards: [{ itemId: 'gun_blueprint', quantity: 1 }] },
};

describe('item catalog', () => {
  it('derives recipe, bench and blueprint lock from explicit data', () => {
    const c = buildCatalogItem(item({ id: 'gun_i', baseId: 'gun_i', tier: 1, craftedBy: ['recipes:gun_i'], upgradesTo: [{ itemId: 'gun_ii', cost: { items: [{ itemId: 'metal', quantity: 1 }] } }] }), { name: 'Knarre I' }, recipes);
    expect(c).toMatchObject({ name: 'Knarre I', recipe: { metal: 3 }, craftBench: 'weapon_bench', stationLevelRequired: 1, blueprintLocked: true, isWeapon: true, upgradesTo: 'gun_ii', upgradeCost: { metal: 1 } });
  });

  it('prefers the specialized bench over the workbench', () => {
    const c = buildCatalogItem(item({ id: 'bandage', category: 'Utility.Regenerative', group: 'Utilities', craftedBy: ['recipes:bandage-wb', 'recipes:bandage'] }), undefined, recipes);
    expect(c.craftBench).toBe('med_station');
    expect(c.isWeapon).toBe(false);
  });

  it('falls back to research for researched items and inherits the bench along tiers', () => {
    const bp = buildCatalogItem(item({ id: 'gun_blueprint', category: 'Recipe', researchedBy: ['research:gun_blueprint'] }), undefined, recipes, research);
    expect(bp).toMatchObject({ researchId: 'research:gun_blueprint', craftBench: 'research_station', stationLevelRequired: 2, recipe: { research_points: 3000 } });
    const all: Record<string, CatalogItem> = {
      gun_i: buildCatalogItem(item({ id: 'gun_i', baseId: 'gun_i', tier: 1, craftedBy: ['recipes:gun_i'] }), undefined, recipes),
      gun_ii: buildCatalogItem(item({ id: 'gun_ii', baseId: 'gun_i', tier: 2 }), undefined, recipes),
    };
    inheritTierBench(all);
    expect(all.gun_ii.craftBench).toBe('weapon_bench');
  });
});

describe('formatItemEffects', () => {
  it('renders title and format with the value', () => {
    const text = { effects: { '0': { title: 'Radius', format: '{0}m' }, '1': { title: 'Tether Duration', format: '{0} s' } } };
    expect(formatItemEffects([{ value: 8.5 }, { value: 1 }], text, 'en')).toEqual([
      { label: 'Radius', value: '8.5m', positive: true },
      { label: 'Tether Duration', value: '1 s', positive: true },
    ]);
  });

  it('formats numbers by locale and rounds to two decimals', () => {
    const text = { effects: { '0': { title: 'Radius', format: '{0} m' } } };
    expect(formatItemEffects([{ value: 8.5 }], text, 'de')?.[0].value).toBe('8,5 m');
    expect(formatItemEffects([{ value: 1.23456 }], text, 'en')?.[0].value).toBe('1.23 m');
  });

  it('adds a plus sign when showSign and the value is not negative; keeps positive=false', () => {
    const text = { effects: { '0': { title: 'Speed', format: '{0}%' }, '1': { title: 'Noise', format: '{0}%' } } };
    expect(formatItemEffects([{ value: 10, showSign: true }, { value: -5, showSign: true, positive: false }], text, 'en')).toEqual([
      { label: 'Speed', value: '+10%', positive: true },
      { label: 'Noise', value: '-5%', positive: false },
    ]);
  });

  it('shows the formatted value as label when there is no title, and the bare number without format', () => {
    expect(formatItemEffects([{ value: 25 }], { effects: { '0': { format: '{0}% faster' } } }, 'en')).toEqual([
      { label: '25% faster', value: '', positive: true },
    ]);
    expect(formatItemEffects([{ value: 3 }], { effects: { '0': { title: 'Slots' } } }, 'en')).toEqual([
      { label: 'Slots', value: '3', positive: true },
    ]);
  });

  it('renders overlay effects (no format) from valueText and handles missing input', () => {
    expect(formatItemEffects([{ valueText: 'Heavy Ammo' }, {}], { effects: { '0': { title: 'Ammo Type' }, '1': { title: 'Flag' } } }, 'en')).toEqual([
      { label: 'Ammo Type', value: 'Heavy Ammo', positive: true },
      { label: 'Flag', value: '', positive: true },
    ]);
    expect(formatItemEffects(undefined, undefined, 'en')).toBeUndefined();
    expect(formatItemEffects([], undefined, 'en')).toBeUndefined();
  });

  it('is wired into the catalog item', () => {
    const c = buildCatalogItem(item({ id: 'g', effects: [{ value: 2 }] }), { effects: { '0': { title: 'Radius', format: '{0}m' } } }, {});
    expect(c.effects).toEqual([{ label: 'Radius', value: '2m', positive: true }]);
  });
});

describe('classification', () => {
  const structure = {
    rarities: { Common: { level: 1, color: '#6C6C6C' }, Amplified: { level: 6, color: '#E88629' } } as never,
    groups: [
      { id: 'Weapons', order: 4, subgroups: ['Firearm.SMG'] },
      { id: 'Utilities', order: 2, subgroups: ['Utility.Grenade'] },
    ],
    categories: { 'Utility.Grenade': { parent: 'Utility' }, 'Firearm.SMG': { parent: 'Firearm' } },
  };
  const text = {
    rarities: { Common: 'Gewöhnlich', Amplified: 'Verstärkt' },
    groups: { Weapons: 'Waffen', Utilities: 'Schnelleinsatz' },
    subgroups: { 'Utility.Grenade': 'Granaten' },
    categories: { 'Utility.Grenade': 'Schnelleinsatz', 'Firearm.SMG': 'MP' },
    themes: { OldWorld: 'Alte Welt' },
  };

  it('resolves names and keeps game order of groups', () => {
    const cl = buildClassification(structure, text as never);
    expect(cl.groups.map((g) => g.id)).toEqual(['Utilities', 'Weapons']);
    expect(cl.groups[0].subgroups).toEqual([{ id: 'Utility.Grenade', name: 'Granaten' }]);
    expect(cl.groups[1].subgroups).toEqual([{ id: 'Firearm.SMG', name: 'MP' }]);
    expect(cl.rarities.map((r) => [r.rarity, r.name, r.color])).toEqual([
      ['Common', 'Gewöhnlich', '#6C6C6C'],
      ['Amplified', 'Verstärkt', '#E88629'],
    ]);
    expect(cl.themeName('OldWorld')).toBe('Alte Welt');
    expect(cl.parents['Utility.Grenade']).toBe('Utility');
  });

  it('puts category, group, subgroup, names and theme labels on catalog items; unclassified items stay bare', () => {
    const cl = buildClassification(structure, text as never);
    const c = buildCatalogItem(
      item({ id: 'yank', category: 'Utility.Grenade', group: 'Utilities', subgroup: 'Utility.Grenade', rarity: 'Uncommon', foundIn: ['OldWorld'] }),
      undefined,
      {},
      {},
      cl,
    );
    expect(c).toMatchObject({ category: 'Utility.Grenade', categoryName: 'Schnelleinsatz', groupName: 'Schnelleinsatz', subgroupName: 'Granaten', foundInNames: ['Alte Welt'], isWeapon: false });
    const bare = buildCatalogItem({ id: 'x', nameEn: 'x', icon: '', value: 0, stackSize: 1 }, undefined, {}, {}, emptyClassification());
    expect(bare.rarity).toBeUndefined();
    expect(bare.category).toBeUndefined();
    expect(bare.isWeapon).toBe(false);
  });
});
