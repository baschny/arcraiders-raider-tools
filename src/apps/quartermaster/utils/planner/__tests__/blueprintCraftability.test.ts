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
    value: 1000,
    recyclesInto: {
      arc_alloy: 2,
      crude_explosives: 2,
    },
  }),
  explosive_compound: item({
    id: 'explosive_compound',
    name: 'Explosive Compound',
    category: 'Refined Material',
    value: 1000,
    recyclesInto: {
      crude_explosives: 2,
      oil: 2,
    },
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
  crude_explosives: item({
    id: 'crude_explosives',
    name: 'Crude Explosives',
    craftBench: 'explosives_bench',
    recipe: {
      chemicals: 6,
    },
    stackSize: 50,
  }),
  arc_motion_core: item({
    id: 'arc_motion_core',
    name: 'ARC Motion Core',
    stackSize: 10,
  }),
  launcher_ammo: item({
    id: 'launcher_ammo',
    name: 'Launcher Ammo',
    type: 'Ammunition',
    category: 'Ammunition',
    craftBench: 'workbench',
    craftQuantity: 60,
    recipe: {
      arc_motion_core: 1,
      crude_explosives: 20,
    },
    stackSize: 60,
  }),
  spare_recycler: item({
    id: 'spare_recycler',
    name: 'Spare Recycler',
    category: 'Recyclable',
    value: 900,
    recyclesInto: {
      crude_explosives: 2,
    },
  }),
  bargain_recycler: item({
    id: 'bargain_recycler',
    name: 'Bargain Recycler',
    category: 'Recyclable',
    value: 500,
    recyclesInto: {
      crude_explosives: 2,
    },
  }),
  premium_recycler: item({
    id: 'premium_recycler',
    name: 'Premium Recycler',
    category: 'Recyclable',
    value: 1500,
    recyclesInto: {
      crude_explosives: 2,
    },
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

  it('crafts missing direct inputs from base materials before recycling direct inputs for active targets', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'deadline', quantity: 1, isEnabled: true },
          { itemId: 'launcher_ammo', quantity: 60, isEnabled: true },
        ],
      }],
      [
        { itemId: 'deadline', quantity: 1 },
        { itemId: 'arc_motion_core', quantity: 1 },
        { itemId: 'crude_explosives', quantity: 16 },
        { itemId: 'chemicals', quantity: 24 },
        { itemId: 'comet_igniter', quantity: 2 },
      ],
      benchLevels,
      new Set(['deadline']),
    );

    expect(result.recyclePlan.actions).toEqual([]);
    expect(result.satisfiableTargets.has('launcher_ammo')).toBe(true);
    expect(result.craftPlan.steps.map((step) => ({
      itemId: step.itemId,
      qty: step.qty,
    }))).toEqual([
      { itemId: 'crude_explosives', qty: 4 },
      { itemId: 'launcher_ammo', qty: 60 },
    ]);
  });

  it('prefers non-direct recycle sources over direct recipe inputs for active targets', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'deadline', quantity: 1, isEnabled: true },
          { itemId: 'launcher_ammo', quantity: 60, isEnabled: true },
        ],
      }],
      [
        { itemId: 'deadline', quantity: 1 },
        { itemId: 'arc_motion_core', quantity: 1 },
        { itemId: 'crude_explosives', quantity: 16 },
        { itemId: 'comet_igniter', quantity: 2 },
        { itemId: 'spare_recycler', quantity: 2 },
      ],
      benchLevels,
      new Set(['deadline']),
    );

    expect(result.recyclePlan.actions).toHaveLength(1);
    expect(result.recyclePlan.actions[0]).toMatchObject({
      srcItemId: 'spare_recycler',
      qtyToRecycle: 2,
      sourcePriorityGroup: 'normal',
    });
  });

  it('uses direct recipe input recycle sources as a warned fallback', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'deadline', quantity: 1, isEnabled: true },
          { itemId: 'launcher_ammo', quantity: 60, isEnabled: true },
        ],
      }],
      [
        { itemId: 'deadline', quantity: 1 },
        { itemId: 'arc_motion_core', quantity: 1 },
        { itemId: 'crude_explosives', quantity: 16 },
        { itemId: 'comet_igniter', quantity: 2 },
      ],
      benchLevels,
      new Set(['deadline']),
    );

    expect(result.recyclePlan.actions).toHaveLength(1);
    expect(result.recyclePlan.actions[0]).toMatchObject({
      srcItemId: 'comet_igniter',
      qtyToRecycle: 2,
      sourcePriorityGroup: 'direct_recipe_input',
      sourcePriorityWarnings: [
        expect.objectContaining({
          listId: 'ammo',
          listName: 'Ammo',
          targetItemId: 'deadline',
          targetItemName: 'Deadline',
        }),
      ],
    });
  });

  it('uses lower value as a deterministic tie-breaker within the same recycle group', () => {
    const result = computePlan(
      itemsMap,
      [{
        id: 'ammo',
        name: 'Ammo',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'launcher_ammo', quantity: 60, isEnabled: true }],
      }],
      [
        { itemId: 'arc_motion_core', quantity: 1 },
        { itemId: 'crude_explosives', quantity: 16 },
        { itemId: 'bargain_recycler', quantity: 2 },
        { itemId: 'premium_recycler', quantity: 2 },
      ],
      benchLevels,
    );

    expect(result.recyclePlan.actions).toHaveLength(1);
    expect(result.recyclePlan.actions[0]).toMatchObject({
      srcItemId: 'bargain_recycler',
      qtyToRecycle: 2,
    });
  });
});

const weaponItemsMap: ItemsMap = {
  mechanical_components: item({
    id: 'mechanical_components',
    name: 'Mechanical Components',
    stackSize: 50,
  }),
  simple_gun_parts: item({
    id: 'simple_gun_parts',
    name: 'Simple Gun Parts',
    stackSize: 50,
  }),
  heavy_gun_parts: item({
    id: 'heavy_gun_parts',
    name: 'Heavy Gun Parts',
    stackSize: 50,
  }),
  metal_parts: item({
    id: 'metal_parts',
    name: 'Metal Parts',
    stackSize: 50,
  }),
  steel_spring: item({
    id: 'steel_spring',
    name: 'Steel Spring',
    stackSize: 50,
  }),
  rusted_tools: item({
    id: 'rusted_tools',
    name: 'Rusted Tools',
    category: 'Recyclable',
    recyclesInto: {
      heavy_gun_parts: 1,
      metal_parts: 8,
    },
  }),
  heavy_gun_parts_bundle: item({
    id: 'heavy_gun_parts_bundle',
    name: 'Heavy Gun Parts Bundle',
    craftBench: 'refiner',
    recipe: {
      metal_parts: 2,
      steel_spring: 1,
    },
  }),
  anvil_i: item({
    id: 'anvil_i',
    name: 'Anvil I',
    type: 'Hand Cannon',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    blueprintLocked: true,
    recipe: {
      mechanical_components: 5,
      simple_gun_parts: 6,
    },
    upgradesTo: 'anvil_ii',
    weaponBaseId: 'anvil_i',
    weaponTier: 1,
  }),
  anvil_ii: item({
    id: 'anvil_ii',
    name: 'Anvil II',
    type: 'Hand Cannon',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    upgradeCost: {
      mechanical_components: 3,
      simple_gun_parts: 1,
    },
    upgradesFrom: 'anvil_i',
    upgradesTo: 'anvil_iii',
    weaponBaseId: 'anvil_i',
    weaponTier: 2,
  }),
  anvil_iii: item({
    id: 'anvil_iii',
    name: 'Anvil III',
    type: 'Hand Cannon',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    upgradeCost: {
      heavy_gun_parts: 1,
      mechanical_components: 4,
    },
    upgradesFrom: 'anvil_ii',
    upgradesTo: 'anvil_iv',
    weaponBaseId: 'anvil_i',
    weaponTier: 3,
  }),
  anvil_iv: item({
    id: 'anvil_iv',
    name: 'Anvil IV',
    type: 'Hand Cannon',
    category: 'Weapon',
    craftBench: 'weapon_bench',
    upgradeCost: {
      heavy_gun_parts: 1,
      mechanical_components: 4,
    },
    upgradesFrom: 'anvil_iii',
    weaponBaseId: 'anvil_i',
    weaponTier: 4,
  }),
};

const anvilIvList: StoredList[] = [{
  id: 'weapons',
  name: 'Weapons',
  type: 'user',
  isEnabled: true,
  items: [{ itemId: 'anvil_iv', quantity: 1, isEnabled: true }],
}];

describe('quartermaster weapon upgrade planning', () => {
  it('crafts tier I and upgrades through each tier for a higher-tier weapon from scratch', () => {
    const result = computePlan(
      weaponItemsMap,
      anvilIvList,
      [
        { itemId: 'mechanical_components', quantity: 16 },
        { itemId: 'simple_gun_parts', quantity: 7 },
        { itemId: 'heavy_gun_parts', quantity: 2 },
      ],
      benchLevels,
      new Set(['anvil_i']),
    );

    expect(result.satisfiableTargets.has('anvil_iv')).toBe(true);
    expect(result.craftPlan.steps.map((step) => ({ itemId: step.itemId, qty: step.qty }))).toEqual([
      { itemId: 'anvil_i', qty: 1 },
    ]);
    expect(result.weaponUpgradePlan.steps.map((step) => ({
      fromItemId: step.fromItemId,
      toItemId: step.toItemId,
      qty: step.qty,
    }))).toEqual([
      { fromItemId: 'anvil_i', toItemId: 'anvil_ii', qty: 1 },
      { fromItemId: 'anvil_ii', toItemId: 'anvil_iii', qty: 1 },
      { fromItemId: 'anvil_iii', toItemId: 'anvil_iv', qty: 1 },
    ]);
  });

  it('uses an owned lower-tier weapon as the upgrade base without requiring the tier I blueprint', () => {
    const result = computePlan(
      weaponItemsMap,
      anvilIvList,
      [
        { itemId: 'anvil_ii', quantity: 1 },
        { itemId: 'mechanical_components', quantity: 8 },
        { itemId: 'heavy_gun_parts', quantity: 2 },
      ],
      benchLevels,
      new Set(),
    );

    expect(result.blockers.blueprintBlockers).toEqual([]);
    expect(result.craftPlan.steps).toEqual([]);
    expect(result.weaponUpgradePlan.steps.map((step) => ({
      fromItemId: step.fromItemId,
      toItemId: step.toItemId,
      qty: step.qty,
    }))).toEqual([
      { fromItemId: 'anvil_ii', toItemId: 'anvil_iii', qty: 1 },
      { fromItemId: 'anvil_iii', toItemId: 'anvil_iv', qty: 1 },
    ]);
  });

  it('consumes multiple owned lower-tier weapons highest-tier first', () => {
    const result = computePlan(
      weaponItemsMap,
      [{
        ...anvilIvList[0],
        items: [{ itemId: 'anvil_iv', quantity: 2, isEnabled: true }],
      }],
      [
        { itemId: 'anvil_i', quantity: 1 },
        { itemId: 'anvil_iii', quantity: 1 },
        { itemId: 'mechanical_components', quantity: 15 },
        { itemId: 'simple_gun_parts', quantity: 1 },
        { itemId: 'heavy_gun_parts', quantity: 3 },
      ],
      benchLevels,
      new Set(),
    );

    expect(result.satisfiableTargets.has('anvil_iv')).toBe(true);
    expect(result.weaponUpgradePlan.steps.map((step) => ({
      fromItemId: step.fromItemId,
      toItemId: step.toItemId,
      qty: step.qty,
    }))).toEqual([
      { fromItemId: 'anvil_i', toItemId: 'anvil_ii', qty: 1 },
      { fromItemId: 'anvil_ii', toItemId: 'anvil_iii', qty: 1 },
      { fromItemId: 'anvil_iii', toItemId: 'anvil_iv', qty: 2 },
    ]);
  });

  it('can craft missing upgrade-cost materials before upgrading', () => {
    const result = computePlan(
      {
        ...weaponItemsMap,
        heavy_gun_parts: item({
          id: 'heavy_gun_parts',
          name: 'Heavy Gun Parts',
          craftBench: 'refiner',
          recipe: {
            metal_parts: 2,
            steel_spring: 1,
          },
        }),
      },
      anvilIvList,
      [
        { itemId: 'anvil_ii', quantity: 1 },
        { itemId: 'mechanical_components', quantity: 8 },
        { itemId: 'metal_parts', quantity: 4 },
        { itemId: 'steel_spring', quantity: 2 },
      ],
      benchLevels,
      new Set(),
    );

    expect(result.satisfiableTargets.has('anvil_iv')).toBe(true);
    expect(result.craftPlan.steps.map((step) => step.itemId)).toEqual(['heavy_gun_parts']);
    expect(result.weaponUpgradePlan.steps.map((step) => step.toItemId)).toEqual(['anvil_iii', 'anvil_iv']);
  });

  it('can recycle for missing upgrade-cost materials', () => {
    const result = computePlan(
      weaponItemsMap,
      anvilIvList,
      [
        { itemId: 'anvil_ii', quantity: 1 },
        { itemId: 'mechanical_components', quantity: 8 },
        { itemId: 'heavy_gun_parts', quantity: 2 },
      ],
      benchLevels,
      new Set(),
    );

    expect(result.recyclePlan.actions).toEqual([]);

    const recycleResult = computePlan(
      weaponItemsMap,
      anvilIvList,
      [
        { itemId: 'anvil_ii', quantity: 1 },
        { itemId: 'mechanical_components', quantity: 8 },
        { itemId: 'heavy_gun_parts', quantity: 1 },
        { itemId: 'rusted_tools', quantity: 1 },
      ],
      benchLevels,
      new Set(),
    );

    expect(recycleResult.recyclePlan.actions.map((action) => action.srcItemId)).toEqual(['rusted_tools']);
    expect(recycleResult.satisfiableTargets.has('anvil_iv')).toBe(true);
  });

  it('blocks crafting tier I from scratch when the blueprint is locked', () => {
    const result = computePlan(
      weaponItemsMap,
      anvilIvList,
      [
        { itemId: 'mechanical_components', quantity: 16 },
        { itemId: 'simple_gun_parts', quantity: 7 },
        { itemId: 'heavy_gun_parts', quantity: 2 },
      ],
      benchLevels,
      new Set(),
    );

    expect(result.blockers.blueprintBlockers).toEqual(['anvil_i']);
    expect(result.weaponUpgradePlan.steps).toEqual([]);
    expect(result.satisfiableTargets.has('anvil_iv')).toBe(false);
  });

  it('blocks upgrades when the Gunsmith level is insufficient', () => {
    const result = computePlan(
      {
        ...weaponItemsMap,
        anvil_iii: {
          ...weaponItemsMap.anvil_iii,
          stationLevelRequired: 3,
        },
      },
      anvilIvList,
      [
        { itemId: 'anvil_ii', quantity: 1 },
        { itemId: 'mechanical_components', quantity: 8 },
        { itemId: 'heavy_gun_parts', quantity: 2 },
      ],
      {
        ...benchLevels,
        weapon_bench: 2,
      },
      new Set(),
    );

    expect(result.blockers.benchBlockers).toEqual(['anvil_iii']);
    expect(result.weaponUpgradePlan.steps).toEqual([]);
  });

  it('keeps In Raid weapon suggestions to the exact required tier', () => {
    const result = computePlan(
      weaponItemsMap,
      anvilIvList,
      [],
      benchLevels,
      new Set(),
    );

    const suggestionIds = result.inRaidSuggestions.items.map((suggestion) => suggestion.itemId);
    expect(suggestionIds).toContain('anvil_iv');
    expect(suggestionIds).not.toContain('anvil_i');
    expect(suggestionIds).not.toContain('anvil_ii');
    expect(suggestionIds).not.toContain('anvil_iii');
  });
});
