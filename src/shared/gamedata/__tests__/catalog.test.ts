import { describe, expect, it } from 'vitest';
import { buildCatalogItem, inheritTierBench, type CatalogItem } from '../catalog';
import type { Item, Recipe, Research } from '../types';

const item = (p: Partial<Item> & { id: string }): Item => ({
  nameEn: p.id,
  type: 'Assault Rifle',
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
    const c = buildCatalogItem(item({ id: 'bandage', type: 'Quick Use', craftedBy: ['recipes:bandage-wb', 'recipes:bandage'] }), undefined, recipes);
    expect(c.craftBench).toBe('med_station');
    expect(c.isWeapon).toBe(false);
  });

  it('falls back to research for researched items and inherits the bench along tiers', () => {
    const bp = buildCatalogItem(item({ id: 'gun_blueprint', type: 'Blueprint', researchedBy: ['research:gun_blueprint'] }), undefined, recipes, research);
    expect(bp).toMatchObject({ researchId: 'research:gun_blueprint', craftBench: 'research_station', stationLevelRequired: 2, recipe: { research_points: 3000 } });
    const all: Record<string, CatalogItem> = {
      gun_i: buildCatalogItem(item({ id: 'gun_i', baseId: 'gun_i', tier: 1, craftedBy: ['recipes:gun_i'] }), undefined, recipes),
      gun_ii: buildCatalogItem(item({ id: 'gun_ii', baseId: 'gun_i', tier: 2 }), undefined, recipes),
    };
    inheritTierBench(all);
    expect(all.gun_ii.craftBench).toBe('weapon_bench');
  });
});
