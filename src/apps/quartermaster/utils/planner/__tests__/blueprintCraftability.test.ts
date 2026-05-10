import { describe, expect, it } from 'vitest';
import type { ItemsMap, PlannerItem, BenchId } from '../../../types/item';
import type { StoredList } from '../../../types/list';
import { computePlan } from '../index';
import { buildItemInsights } from '../../itemInsights';

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
  advanced_electrical_components: item({
    id: 'advanced_electrical_components',
    name: 'Advanced Electrical Components',
    category: 'Refined Material',
  }),
  voltage_converter: item({
    id: 'voltage_converter',
    name: 'Voltage Converter',
    category: 'Topside Material',
  }),
  vaporizer_regulator: item({
    id: 'vaporizer_regulator',
    name: 'Vaporizer Regulator',
    category: 'Recyclable',
    recyclesInto: {
      advanced_electrical_components: 2,
      arc_circuitry: 2,
    },
  }),
  power_rod: item({
    id: 'power_rod',
    name: 'Power Rod',
    craftBench: 'refiner',
    recipe: {
      advanced_electrical_components: 1,
      arc_circuitry: 1,
    },
  }),
  heavy_shield: item({
    id: 'heavy_shield',
    name: 'Heavy Shield',
    type: 'Shield',
    category: 'Shield',
    craftBench: 'equipment_bench',
    recipe: {
      power_rod: 1,
      voltage_converter: 2,
    },
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
  chemicals: item({
    id: 'chemicals',
    name: 'Chemicals',
    stackSize: 50,
  }),
  damaged_heat_sink: item({
    id: 'damaged_heat_sink',
    name: 'Damaged Heat Sink',
    category: 'Recyclable',
    recyclesInto: {
      metal_parts: 6,
      wires: 2,
    },
  }),
  rusted_tools: item({
    id: 'rusted_tools',
    name: 'Rusted Tools',
    category: 'Recyclable',
    recyclesInto: {
      metal_parts: 8,
      steel_spring: 1,
    },
  }),
  steel_spring: item({
    id: 'steel_spring',
    name: 'Steel Spring',
    stackSize: 50,
  }),
  medium_ammo: item({
    id: 'medium_ammo',
    name: 'Medium Ammo',
    type: 'Ammunition',
    category: 'Ammunition',
    craftBench: 'workbench',
    craftQuantity: 20,
    recipe: {
      chemicals: 2,
      metal_parts: 3,
    },
    stackSize: 80,
  }),
  metal_parts: item({
    id: 'metal_parts',
    name: 'Metal Parts',
    stackSize: 50,
  }),
  wires: item({
    id: 'wires',
    name: 'Wires',
    stackSize: 50,
  }),
};

const lists: StoredList[] = [{
  id: 'desired',
  name: 'Desired',
  type: 'user',
  isEnabled: true,
  items: [{ itemId: 'deadline', quantity: 1, isEnabled: true }],
}];

const ownedItems = [
  { itemId: 'comet_igniter', quantity: 1 },
  { itemId: 'explosive_compound', quantity: 3 },
  { itemId: 'arc_alloy', quantity: 80 },
];

describe('quartermaster blueprint craftability', () => {
  it('blocks blueprint-locked items that are not in the learned blueprint set', () => {
    const result = computePlan(itemsMap, lists, ownedItems, benchLevels, new Set());

    expect(result.blockers.blueprintBlockers).toEqual(['deadline']);
    expect(result.craftPlan.steps).toEqual([]);
    expect(result.satisfiableTargets.has('deadline')).toBe(false);
  });

  it('crafts Deadline when its blueprint is learned and indirect materials are available', () => {
    const result = computePlan(itemsMap, lists, ownedItems, benchLevels, new Set(['deadline']));

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

  it('uses canonical owned quantities when computing deficits', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'materials',
        name: 'Materials',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'arc_alloy', quantity: 100, isEnabled: true }],
      }],
      [
        { itemId: 'arc_alloy', quantity: 80 },
        { itemId: 'arc_alloy', quantity: 15 },
      ],
      benchLevels,
    );

    expect(result.deficit.arc_alloy).toBe(5);
    expect(result.planRows.find((row) => row.itemId === 'arc_alloy')?.have).toBe(95);
  });

  it('crafts Medium Ammo when owned ingredients cover the missing output', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'medium_ammo', quantity: 260, isEnabled: true }],
      }],
      [
        { itemId: 'medium_ammo', quantity: 174 },
        { itemId: 'metal_parts', quantity: 28 },
        { itemId: 'chemicals', quantity: 293 },
      ],
      benchLevels,
    );

    expect(result.satisfiableTargets.has('medium_ammo')).toBe(true);
    expect(result.craftPlan.steps.map((step) => ({
      itemId: step.itemId,
      qty: step.qty,
    }))).toEqual([{ itemId: 'medium_ammo', qty: 100 }]);
    expect(result.inRaidSuggestions.items).toEqual([]);
  });

  it('keeps recycle-yield explanations active for missing craft ingredients', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'medium_ammo', quantity: 260, isEnabled: true }],
      }],
      [
        { itemId: 'medium_ammo', quantity: 174 },
        { itemId: 'metal_parts', quantity: 13 },
        { itemId: 'chemicals', quantity: 293 },
      ],
      benchLevels,
    );

    const insights = buildItemInsights(itemsMap, result);

    expect(result.remainingIngredientDeficits).toEqual({ metal_parts: 2 });
    expect(result.inRaidSuggestions.items.find((suggestion) => suggestion.itemId === 'damaged_heat_sink')).toMatchObject({
      reasons: ['BRING_HOME_FOR_RECYCLE_YIELD'],
      impactedTargetItemIds: ['medium_ammo'],
    });
    expect(insights.damaged_heat_sink.recycleSalvageNeeds).toContainEqual(
      expect.objectContaining({
        mode: 'recycle',
        producedItemId: 'metal_parts',
        targetItemId: 'medium_ammo',
        isComplete: false,
      }),
    );
  });

  it('uses owned recycle materials to make a target fully craftable', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'medium_ammo', quantity: 360, isEnabled: true }],
      }],
      [
        { itemId: 'medium_ammo', quantity: 174 },
        { itemId: 'metal_parts', quantity: 28 },
        { itemId: 'chemicals', quantity: 293 },
        { itemId: 'rusted_tools', quantity: 3 },
      ],
      benchLevels,
    );

    expect(result.recyclePlan.actions).toContainEqual(
      expect.objectContaining({
        srcItemId: 'rusted_tools',
        qtyToRecycle: 1,
        reasons: [
          expect.objectContaining({
            targetItemId: 'medium_ammo',
            producedItemId: 'metal_parts',
          }),
        ],
      }),
    );
    expect(result.satisfiableTargets.has('medium_ammo')).toBe(true);
    expect(result.craftPlan.steps.map((step) => ({
      itemId: step.itemId,
      qty: step.qty,
    }))).toEqual([{ itemId: 'medium_ammo', qty: 200 }]);
  });

  it('suggests the partial craft amount available from current base materials', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'medium_ammo', quantity: 360, isEnabled: true }],
      }],
      [
        { itemId: 'medium_ammo', quantity: 174 },
        { itemId: 'metal_parts', quantity: 28 },
        { itemId: 'chemicals', quantity: 293 },
      ],
      benchLevels,
    );

    expect(result.satisfiableTargets.has('medium_ammo')).toBe(false);
    expect(result.craftPlan.steps.map((step) => ({
      itemId: step.itemId,
      qty: step.qty,
    }))).toEqual([{ itemId: 'medium_ammo', qty: 180 }]);
    expect(result.remainingIngredientDeficits).toEqual({ metal_parts: 2 });
  });

  it('does not commit recycle work or reasons for a target blocked by raid-only ingredients', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'loadout',
        name: 'Loadout',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'deadline', quantity: 6, isEnabled: true },
          { itemId: 'heavy_shield', quantity: 1, isEnabled: true },
        ],
      }],
      [
        { itemId: 'deadline', quantity: 3 },
        { itemId: 'comet_igniter', quantity: 3 },
        { itemId: 'explosive_compound', quantity: 9 },
        { itemId: 'arc_circuitry', quantity: 2 },
        { itemId: 'vaporizer_regulator', quantity: 3 },
      ],
      benchLevels,
      new Set(['deadline']),
    );

    expect(result.satisfiableTargets.has('deadline')).toBe(true);
    expect(result.satisfiableTargets.has('heavy_shield')).toBe(false);
    expect(result.recyclePlan.actions).toHaveLength(1);
    expect(result.recyclePlan.actions[0]).toMatchObject({
      srcItemId: 'vaporizer_regulator',
      qtyToRecycle: 2,
      yields: {
        advanced_electrical_components: 4,
        arc_circuitry: 4,
      },
    });
    expect(result.recyclePlan.actions[0].reasons).toEqual([
      expect.objectContaining({
        listId: 'loadout',
        targetItemId: 'deadline',
        producedItemId: 'arc_circuitry',
        chainItemIds: ['deadline', 'arc_circuitry'],
      }),
    ]);
    expect(result.recyclePlan.actions[0].reasons.some((reason) => reason.targetItemId === 'heavy_shield')).toBe(false);
    expect(result.craftPlan.steps.map((step) => step.itemId)).toEqual(['deadline']);
    expect(result.remainingIngredientDeficits).toMatchObject({
      power_rod: 1,
      voltage_converter: 2,
    });
  });
});
