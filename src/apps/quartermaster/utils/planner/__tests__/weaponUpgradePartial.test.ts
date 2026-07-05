import { describe, expect, it } from 'vitest';
import type { ItemsMap, PlannerItem, BenchId } from '../../../types/item';
import type { StoredList } from '../../../types/list';
import { computePlan } from '../index';

const benchLevels: Record<BenchId, number> = {
  equipment_bench: 3,
  explosives_bench: 3,
  med_station: 3,
  refiner: 3,
  utility_bench: 3,
  weapon_bench: 3,
  workbench: 3,
};

function item(overrides: Partial<PlannerItem> & Pick<PlannerItem, 'id' | 'name'>): PlannerItem {
  const { id, name, ...rest } = overrides;
  return {
    id,
    name,
    description: '',
    icon: '',
    rarity: 'Common',
    type: 'Material',
    category: 'Basic Material',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
    ...rest,
  };
}

const itemsMap: ItemsMap = {
  base_mat: item({
    id: 'base_mat',
    name: 'Base Material',
    stackSize: 50,
  }),

  upgrade_mat: item({
    id: 'upgrade_mat',
    name: 'Upgrade Material',
    stackSize: 50,
  }),

  weapon_i: item({
    id: 'weapon_i',
    name: 'Weapon I',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    stationLevelRequired: 3,
    blueprintLocked: false,
    recipe: { base_mat: 1 },
    upgradesTo: 'weapon_ii',
    weaponBaseId: 'weapon_i',
    weaponTier: 1,
    rarity: 'Epic',
  }),

  weapon_ii: item({
    id: 'weapon_ii',
    name: 'Weapon II',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    upgradeCost: { upgrade_mat: 1 },
    upgradesFrom: 'weapon_i',
    upgradesTo: 'weapon_iv',
    weaponBaseId: 'weapon_i',
    weaponTier: 2,
    rarity: 'Epic',
  }),

  weapon_iv: item({
    id: 'weapon_iv',
    name: 'Weapon IV',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    upgradeCost: { upgrade_mat: 2 },
    upgradesFrom: 'weapon_ii',
    weaponBaseId: 'weapon_i',
    weaponTier: 4,
    rarity: 'Epic',
  }),
};

describe('weapon upgrade partial satisfaction', () => {
  it('commits partial upgrades from owned lower-tier weapons when full need cannot be met', () => {
    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'weapon_iv', quantity: 3, isEnabled: true }],
    }];

    const result = computePlan(
      itemsMap,
      lists,
      [
        { itemId: 'weapon_iv', quantity: 1 },
        { itemId: 'weapon_i', quantity: 1 },
        { itemId: 'upgrade_mat', quantity: 4 },
        { itemId: 'base_mat', quantity: 1 },
      ],
      benchLevels,
      new Set(['weapon_i']),
    );

    expect(result.satisfiableTargets.has('weapon_iv')).toBe(false);
    expect(result.deficit['weapon_iv']).toBe(2);

    const upgradeStepIds = result.weaponUpgradePlan.steps.map(
      (step) => `${step.fromItemId}->${step.toItemId}`,
    );
    expect(upgradeStepIds).toContain('weapon_i->weapon_ii');
    expect(upgradeStepIds).toContain('weapon_ii->weapon_iv');
    expect(result.weaponUpgradePlan.steps.length).toBe(2);

    const iToIiStep = result.weaponUpgradePlan.steps.find(
      (s) => s.fromItemId === 'weapon_i' && s.toItemId === 'weapon_ii',
    );
    expect(iToIiStep?.qty).toBe(1);
    expect(iToIiStep?.isFullySatisfiable).toBe(true);

    const iiToIvStep = result.weaponUpgradePlan.steps.find(
      (s) => s.fromItemId === 'weapon_ii' && s.toItemId === 'weapon_iv',
    );
    expect(iiToIvStep?.qty).toBe(1);
    expect(iiToIvStep?.isFullySatisfiable).toBe(true);

    const craftIds = result.craftPlan.steps.map((s) => s.itemId);
    expect(craftIds).not.toContain('weapon_i');

    expect(result.recyclePlan.actions).toEqual([]);

    expect(result.inRaidSuggestions.items.find(
      (s) => s.itemId === 'weapon_iv',
    )).toBeDefined();
  });

  it('fully satisfies when enough owned lower-tier weapons cover the need', () => {
    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'weapon_iv', quantity: 2, isEnabled: true }],
    }];

    const result = computePlan(
      itemsMap,
      lists,
      [
        { itemId: 'weapon_iv', quantity: 1 },
        { itemId: 'weapon_i', quantity: 1 },
        { itemId: 'upgrade_mat', quantity: 6 },
        { itemId: 'base_mat', quantity: 1 },
      ],
      benchLevels,
      new Set(['weapon_i']),
    );

    expect(result.satisfiableTargets.has('weapon_iv')).toBe(true);
    expect(result.deficit['weapon_iv'] ?? 0).toBe(0);

    const upgradeStepIds = result.weaponUpgradePlan.steps.map(
      (step) => `${step.fromItemId}->${step.toItemId}`,
    );
    expect(upgradeStepIds).toContain('weapon_i->weapon_ii');
    expect(upgradeStepIds).toContain('weapon_ii->weapon_iv');
  });

  it('suggests nothing when no lower-tier weapons are owned and the base craft fails', () => {
    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'weapon_iv', quantity: 1, isEnabled: true }],
    }];

    const result = computePlan(
      itemsMap,
      lists,
      [
        { itemId: 'upgrade_mat', quantity: 10 },
      ],
      benchLevels,
      new Set(['weapon_i']),
    );

    expect(result.satisfiableTargets.has('weapon_iv')).toBe(false);
    expect(result.weaponUpgradePlan.steps).toEqual([]);
    expect(result.craftPlan.steps).toEqual([]);
    expect(result.deficit['weapon_iv']).toBe(1);
  });
});
