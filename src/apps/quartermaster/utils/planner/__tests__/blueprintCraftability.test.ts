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
    type: 'Topside Material',
    category: 'Topside Material',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
    ...rest,
  };
}

const itemsMap: ItemsMap = {
  arc_alloy: item({
    id: 'arc_alloy',
    name: 'ARC Alloy',
    stackSize: 50,
  }),
  arc_circuitry: item({
    id: 'arc_circuitry',
    name: 'ARC Circuitry',
    craftBench: 'refiner',
    stationLevelRequired: 2,
    recipe: { arc_alloy: 8 },
    stackSize: 5,
  }),
  comet_igniter: item({
    id: 'comet_igniter',
    name: 'Comet Igniter',
    category: 'Recyclable',
  }),
  explosive_compound: item({
    id: 'explosive_compound',
    name: 'Explosive Compound',
    category: 'Refined Material',
  }),
  deadline: item({
    id: 'deadline',
    name: 'Deadline',
    type: 'Quick Use',
    category: 'Quick Use',
    craftBench: 'explosives_bench',
    stationLevelRequired: 3,
    blueprintLocked: true,
    recipe: {
      arc_circuitry: 2,
      comet_igniter: 1,
      explosive_compound: 3,
    },
  }),
};

const lists: StoredList[] = [{
  id: 'desired',
  name: 'Desired',
  type: 'user',
  isEnabled: true,
  items: [{ itemId: 'deadline', quantity: 1, isEnabled: true }],
}];

const stash = [
  { itemId: 'comet_igniter', quantity: 1 },
  { itemId: 'explosive_compound', quantity: 3 },
  { itemId: 'arc_alloy', quantity: 80 },
];

describe('quartermaster blueprint craftability', () => {
  it('blocks blueprint-locked items that are not in the learned blueprint set', () => {
    const result = computePlan(itemsMap, lists, stash, benchLevels, new Set());

    expect(result.blockers.blueprintBlockers).toEqual(['deadline']);
    expect(result.craftPlan.steps).toEqual([]);
    expect(result.satisfiableTargets.has('deadline')).toBe(false);
  });

  it('crafts Deadline when its blueprint is learned and indirect materials are available', () => {
    const result = computePlan(itemsMap, lists, stash, benchLevels, new Set(['deadline']));

    expect(result.blockers.blueprintBlockers).toEqual([]);
    expect(result.satisfiableTargets.has('deadline')).toBe(true);
    expect(result.craftPlan.steps.map((step) => ({
      itemId: step.itemId,
      qty: step.qty,
    }))).toEqual([
      { itemId: 'arc_circuitry', qty: 2 },
      { itemId: 'deadline', qty: 1 },
    ]);
  });
});
