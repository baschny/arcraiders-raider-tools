import { describe, expect, it } from 'vitest';
import type { ItemsMap, PlannerItem } from '../../../types/item';
import type { OwnedItemDisplayRow, RequiredSource } from '../../../types/planner';
import { runRepairPrePass, getRepairMaterialIds } from '../repairPlanner';

function item(overrides: Partial<PlannerItem> & Pick<PlannerItem, 'id' | 'name'>): PlannerItem {
  const { id, name, ...rest } = overrides;
  return {
    id,
    name,
    description: '',
    icon: '',
    rarity: 'Common',
    type: 'Topside Material',
    category: 'Topside Material',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
    ...rest,
  };
}

function ownedRow(
  itemId: string,
  quantity: number,
  durabilityPercent?: number,
  instanceIndex?: number,
): OwnedItemDisplayRow {
  return {
    itemId,
    quantity,
    locations: [{ source: 'stash', quantity }],
    durabilityPercent,
    instanceIndex,
  };
}

const itemsMap: ItemsMap = {
  bobcat_i: item({
    id: 'bobcat_i',
    name: 'Bobcat I',
    type: 'SMG',
    category: 'Weapon',
    repairCost: { mechanical_components: 5, simple_gun_parts: 5 },
    repairDurability: 0.5,
  }),
  rattler_i: item({
    id: 'rattler_i',
    name: 'Rattler I',
    type: 'Pistol',
    category: 'Weapon',
    repairCost: { simple_gun_parts: 3 },
    repairDurability: 0.5,
  }),
  metal_parts: item({
    id: 'metal_parts',
    name: 'Metal Parts',
    category: 'Basic Material',
    stackSize: 50,
  }),
  mechanical_components: item({
    id: 'mechanical_components',
    name: 'Mechanical Components',
    category: 'Refined Material',
    stackSize: 10,
  }),
  simple_gun_parts: item({
    id: 'simple_gun_parts',
    name: 'Simple Gun Parts',
    category: 'Refined Material',
    stackSize: 10,
  }),
  light_ammo: item({
    id: 'light_ammo',
    name: 'Light Ammo',
    category: 'Ammunition',
  }),
};

const listSources: Record<string, RequiredSource[]> = {
  bobcat_i: [{ listId: 'user1', listName: 'My Loadout', quantity: 1, listType: 'user' }],
  rattler_i: [{ listId: 'user1', listName: 'My Loadout', quantity: 1, listType: 'user' }],
};

describe('repairPlanner', () => {
  it('repairs item in list with durability < 30% — materials consumed from owned', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 25)];
    const listItems = new Set(['bobcat_i']);
    const avail: Record<string, number> = {
      mechanical_components: 10,
      simple_gun_parts: 10,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(1);
    expect(result.repairPlan.actions[0].itemId).toBe('bobcat_i');
    expect(result.repairPlan.actions[0].durabilityPercent).toBe(25);
    expect(result.repairPlan.committedMaterials.mechanical_components).toBe(5);
    expect(result.repairPlan.committedMaterials.simple_gun_parts).toBe(5);
    expect(result.updatedAvail.mechanical_components).toBe(5);
    expect(result.updatedAvail.simple_gun_parts).toBe(5);
    expect(result.repairPlan.deficits).toEqual({});
  });

  it('does not repair item with durability >= 30%', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 35)];
    const listItems = new Set(['bobcat_i']);
    const avail: Record<string, number> = {
      mechanical_components: 10,
      simple_gun_parts: 10,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(0);
    expect(result.updatedAvail).toEqual(avail);
  });

  it('does not repair item not in any list', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 25)];
    const listItems = new Set<string>(); // empty — bobcat_i not in any list
    const avail: Record<string, number> = {
      mechanical_components: 10,
      simple_gun_parts: 10,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(0);
  });

  it('records deficits when insufficient repair materials', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 25)];
    const listItems = new Set(['bobcat_i']);
    const avail: Record<string, number> = {
      mechanical_components: 2,
      simple_gun_parts: 0,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(1);
    expect(result.repairPlan.committedMaterials.mechanical_components).toBe(2);
    expect(result.repairPlan.deficits.mechanical_components).toBe(3);
    expect(result.repairPlan.deficits.simple_gun_parts).toBe(5);
    expect(result.updatedAvail.mechanical_components).toBe(0);
  });

  it('consumes repair materials once across multiple repair needs', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 25), ownedRow('rattler_i', 1, 20, 1)];
    const listItems = new Set(['bobcat_i', 'rattler_i']);
    const avail: Record<string, number> = {
      mechanical_components: 5,
      simple_gun_parts: 8,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(2);
    // Bobcat needs: 5 mechanical + 5 simple
    // Rattler needs: 3 simple
    // Total committed: 5 mechanical + 8 simple
    expect(result.repairPlan.committedMaterials.mechanical_components).toBe(5);
    expect(result.repairPlan.committedMaterials.simple_gun_parts).toBe(8);
    expect(result.repairPlan.deficits.simple_gun_parts).toBeUndefined();
    expect(result.updatedAvail.simple_gun_parts).toBe(0);
  });

  it('produces empty repair plan when no items have repairCost', () => {
    const ownedRows = [ownedRow('metal_parts', 50), ownedRow('light_ammo', 100)];
    const listItems = new Set(['metal_parts', 'light_ammo']);
    const avail: Record<string, number> = {
      metal_parts: 50,
      light_ammo: 100,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(0);
    expect(result.updatedAvail).toEqual(avail);
  });

  it('deterministic: same inputs produce identical repair plan', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 25), ownedRow('rattler_i', 1, 10, 1)];
    const listItems = new Set(['bobcat_i', 'rattler_i']);
    const avail: Record<string, number> = {
      mechanical_components: 10,
      simple_gun_parts: 10,
    };

    const result1 = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);
    const result2 = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result1).toEqual(result2);
  });

  it('sorts repair candidates by worst durability first', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 80), ownedRow('rattler_i', 1, 10, 1)];
    const listItems = new Set(['bobcat_i', 'rattler_i']);
    const avail: Record<string, number> = {
      mechanical_components: 10,
      simple_gun_parts: 10,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    // Only rattler_i should be repaired (durability 10% < 30%), not bobcat_i (80%)
    expect(result.repairPlan.actions).toHaveLength(1);
    expect(result.repairPlan.actions[0].itemId).toBe('rattler_i');
  });

  it('getRepairMaterialIds returns material IDs that need protection', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 25), ownedRow('rattler_i', 1, 20, 1)];
    const listItems = new Set(['bobcat_i', 'rattler_i']);

    const materialIds = getRepairMaterialIds(itemsMap, ownedRows, listItems);

    expect(materialIds.has('mechanical_components')).toBe(true);
    expect(materialIds.has('simple_gun_parts')).toBe(true);
    expect(materialIds.has('metal_parts')).toBe(false);
  });

  it('getRepairMaterialIds returns empty set when no items need repair', () => {
    const ownedRows = [ownedRow('bobcat_i', 1, 90)];
    const listItems = new Set(['bobcat_i']);

    const materialIds = getRepairMaterialIds(itemsMap, ownedRows, listItems);

    expect(materialIds.size).toBe(0);
  });

  it('defaults missing durability to 100 (no repair needed)', () => {
    const ownedRows = [ownedRow('bobcat_i', 1)]; // no durabilityPercent
    const listItems = new Set(['bobcat_i']);
    const avail: Record<string, number> = {
      mechanical_components: 10,
      simple_gun_parts: 10,
    };

    const result = runRepairPrePass(itemsMap, ownedRows, avail, listItems, listSources);

    expect(result.repairPlan.actions).toHaveLength(0);
  });
});
