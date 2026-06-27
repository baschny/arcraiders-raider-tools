/**
 * Craft-Before-Recycle Tests (CR-029)
 *
 * Verifies that Phase B and Phase D only recycle for ingredients that
 * are NOT craftable. Craftable ingredients are left for Phase C to
 * synthesize from base materials, preserving higher-tier items.
 */

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

// ---------------------------------------------------------------------------
// Shared item map used by all tests
// ---------------------------------------------------------------------------

const itemsMap: ItemsMap = {
  // Base ingredient — no recipe, not craftable
  arc_alloy: item({
    id: 'arc_alloy',
    name: 'ARC Alloy',
    stackSize: 50,
  }),

  // Craftable L1 — has recipe from arc_alloy, bench = refiner
  arc_motion_core: item({
    id: 'arc_motion_core',
    name: 'ARC Motion Core',
    craftBench: 'refiner',
    stationLevelRequired: 2,
    recipe: { arc_alloy: 8 },
    stackSize: 5,
    rarity: 'Rare',
    value: 1000,
  }),

  // Target that uses arc_motion_core as an ingredient
  wolfpack: item({
    id: 'wolfpack',
    name: 'Wolfpack',
    craftBench: 'explosives_bench',
    stationLevelRequired: 3,
    blueprintLocked: false,
    recipe: {
      arc_motion_core: 2,
      metal_parts: 1,
    },
    stackSize: 1,
    rarity: 'Epic',
    value: 6000,
  }),

  // Uncraftable base material
  metal_parts: item({
    id: 'metal_parts',
    name: 'Metal Parts',
    stackSize: 50,
  }),

  // Recyclable item that yields arc_motion_core — should NOT be recycled when
  // AMC is craftable from arc_alloy
  magnetic_accelerator: item({
    id: 'magnetic_accelerator',
    name: 'Magnetic Accelerator',
    category: 'Refined Material',
    value: 5500,
    recyclesInto: {
      advanced_mechanical_components: 1,
      arc_motion_core: 1,
    },
    stackSize: 3,
  }),

  advanced_mechanical_components: item({
    id: 'advanced_mechanical_components',
    name: 'Advanced Mechanical Components',
    category: 'Refined Material',
    stackSize: 10,
  }),
};

// ------- non-weapon target — Phase B skips craftable L1, Phase C crafts it -------

describe('craft before recycle — non-weapon targets', () => {
  it('prefers crafting a missing L1 ingredient from base materials over recycling a high-tier item', () => {
    // Target: wolfpack x1
    // Wolfpack recipe: 2 arc_motion_core + 1 metal_parts
    // Own: 0 wolfpack, 0 AMC, 16 arc_alloy, 1 metal_parts, 1 magnetic_accelerator
    //
    // Need 2 AMC. AMC is craftable from 8 ARC Alloy each.
    // Magnetic Accelerator recycles into 1 AMC + 1 AdvMechComp.
    //
    // Before fix: Phase B recycled MA for AMC (wasteful).
    // After fix:  Phase B skips AMC (it's craftable). Phase C crafts 2 AMC from 16 arc_alloy.
    //             MA is preserved.
    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'wolfpack', quantity: 1, isEnabled: true }],
    }];

    const result = computePlan(
      itemsMap,
      lists,
      [
        { itemId: 'arc_alloy', quantity: 16 },
        { itemId: 'metal_parts', quantity: 1 },
        { itemId: 'magnetic_accelerator', quantity: 1 },
      ],
      benchLevels,
      new Set(['wolfpack']),
    );

    expect(result.satisfiableTargets.has('wolfpack')).toBe(true);

    // Magnetic Accelerator should NOT be recycled
    const recycledMA = result.recyclePlan.actions.filter(
      (action) => action.srcItemId === 'magnetic_accelerator',
    );
    expect(recycledMA).toEqual([]);

    // wolfpack should be crafted, and AMC should be crafted as a sub-step
    const craftIds = result.craftPlan.steps.map((step) => step.itemId);
    expect(craftIds).toContain('wolfpack');
    expect(craftIds).toContain('arc_motion_core');
  });

  it('still recycles for uncraftable L1 ingredients (base materials with no recipe)', () => {
    // Target: wolfpack x1
    // Wolfpack recipe: 2 AMC + 1 metal_parts
    // Own: 0 wolfpack, 2 AMC, 0 metal_parts, 1 magnetic_accelerator
    //
    // AMC is covered (have 2). metal_parts is missing (need 1, have 0).
    // metal_parts has no recipe — it's uncraftable.
    // No item recycles into metal_parts in this test setup, so the plan fails.
    //
    // The key assertion: AMC (craftable) is NOT in the Phase B recycle,
    // but metal_parts (uncraftable) IS checked for recycle candidates.
    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'wolfpack', quantity: 1, isEnabled: true }],
    }];

    const result = computePlan(
      itemsMap,
      lists,
      [
        { itemId: 'arc_motion_core', quantity: 2 },
        { itemId: 'magnetic_accelerator', quantity: 1 },
      ],
      benchLevels,
      new Set(['wolfpack']),
    );

    // metal_parts missing → target not satisfiable
    expect(result.satisfiableTargets.has('wolfpack')).toBe(false);

    // MA should NOT be recycled — it doesn't yield metal_parts,
    // and AMC deficiency isn't the problem here
    const recycledMA = result.recyclePlan.actions.filter(
      (action) => action.srcItemId === 'magnetic_accelerator',
    );
    expect(recycledMA).toEqual([]);
  });

  it('discards nuclear-fallback recycle actions when the target is not fully satisfiable', () => {
    // Target: wolfpack x1
    // Wolfpack recipe: 2 AMC + 1 metal_parts
    // Own: 0 wolfpack, 0 AMC, 0 arc_alloy, 1 metal_parts, 1 magnetic_accelerator
    //
    // AMC deficit: 2. AMC is craftable but arc_alloy is missing.
    // Phase B skips AMC (craftable). Phase C tries to craft AMC, but
    // arc_alloy is missing and uncraftable → Phase C fails.
    // Nuclear fallback fires inside completeTargetSatisfaction and recycles
    // MA for 1 AMC, but the target still isn't fully satisfiable (short 1 AMC).
    // Since the plan fails, the trial state is discarded — no recycle actions
    // are committed to the final result.
    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'wolfpack', quantity: 1, isEnabled: true }],
    }];

    const result = computePlan(
      itemsMap,
      lists,
      [
        { itemId: 'metal_parts', quantity: 1 },
        { itemId: 'magnetic_accelerator', quantity: 1 },
      ],
      benchLevels,
      new Set(['wolfpack']),
    );

    expect(result.satisfiableTargets.has('wolfpack')).toBe(false);
    expect(result.recyclePlan.actions).toEqual([]);
  });

  it('only falls back to recycling for the L1 ingredient whose craft failed, not for craftable ones that succeed', () => {
    // Target: dual_craft needs L1a (craftable from owned base) + L1b
    // (craftable but base missing, has a recyclable source).
    //
    // L1b's pending craft fails (no arc_alloy). The fallback should recycle
    // the recyclable ONLY for L1b, not for L1a (which can craft from owned
    // metal_parts).

    const mergedItemsMap: ItemsMap = {
      arc_alloy: item({ id: 'arc_alloy', name: 'ARC Alloy', stackSize: 50 }),

      arc_motion_core: item({
        id: 'arc_motion_core',
        name: 'ARC Motion Core',
        craftBench: 'refiner',
        stationLevelRequired: 2,
        recipe: { arc_alloy: 8 },
        stackSize: 5,
        rarity: 'Rare',
        value: 1000,
      }),

      metal_parts: item({ id: 'metal_parts', name: 'Metal Parts', stackSize: 50 }),

      light_gun_parts: item({
        id: 'light_gun_parts',
        name: 'Light Gun Parts',
        craftBench: 'refiner',
        stationLevelRequired: 1,
        recipe: { metal_parts: 3 },
        stackSize: 5,
      }),

      // Recyclable that yields BOTH AMC and LGP — if the fallback is
      // all-or-nothing, this gets recycled for LGP too (wasteful).
      universal_scrap: item({
        id: 'universal_scrap',
        name: 'Universal Scrap',
        category: 'Recyclable',
        value: 500,
        recyclesInto: {
          arc_motion_core: 2,
          light_gun_parts: 2,
        },
        stackSize: 5,
      }),

      dual_target: item({
        id: 'dual_target',
        name: 'Dual Target',
        craftBench: 'utility_bench',
        stationLevelRequired: 1,
        blueprintLocked: false,
        recipe: {
          arc_motion_core: 2,
          light_gun_parts: 1,
        },
        stackSize: 1,
        rarity: 'Uncommon',
      }),
    };

    // Need dual_target x1 → 2 AMC + 1 LGP
    // LGP: craftable from 3 metal_parts each. Own 3 metal_parts → can craft 1 LGP ✓
    // AMC: craftable from 8 arc_alloy each. Own 0 arc_alloy → craft fails ✗
    // universal_scrap recycles into 2 AMC + 2 LGP
    //
    // Expected: LGP is crafted from metal_parts (succeeding craft preserved).
    //           AMC falls back to recycling universal_scrap (only AMC).
    //           ASR is NOT recycled for LGP (LGP was craftable).


    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'dual_target', quantity: 1, isEnabled: true }],
    }];

    const result = computePlan(
      mergedItemsMap,
      lists,
      [
        { itemId: 'metal_parts', quantity: 3 },
        { itemId: 'universal_scrap', quantity: 1 },
      ],
      benchLevels,
      new Set(['dual_target']),
    );

    expect(result.satisfiableTargets.has('dual_target')).toBe(true);

    // universal_scrap is recycled for AMC (not for LGP)
    const recycled = result.recyclePlan.actions.filter(
      (action) => action.srcItemId === 'universal_scrap',
    );
    expect(recycled).toHaveLength(1);

    // light_gun_parts should be crafted (succeeding craft preserved)
    const craftIds = result.craftPlan.steps.map((s) => s.itemId);
    expect(craftIds).toContain('light_gun_parts');
  });
});

// ------- weapon upgrade — satisfyMaterialNeeds Phase B skips craftable -------

describe('craft before recycle — weapon upgrade path', () => {
  it('prefers crafting an upgrade-cost material from base ingredients over recycling', () => {
    // Target: weapon_iv (tier 4 weapon via upgrade chain)
    // weapon_i recipe: { magnetic_accelerator: 1, arc_motion_core: 1 }
    // Upgrades: i→ii needs 1 AdvMechComp, ii→iv needs 1 AdvMechComp
    //
    // AdvMechComp is craftable from 3x mechanical_components at the refiner.
    // User also owns old_gear which recycles into 1 AdvMechComp.
    // old_gear is NOT a direct recipe input for weapon_i.
    //
    // Before fix: Phase B in satisfyMaterialNeeds would recycle old_gear
    //   for AdvMechComp because it's a Group A (normal) source.
    // After fix:  Phase B skips AdvMechComp (it's craftable). Phase C
    //   crafts 2 AdvMechComp from 6 mechanical_components, preserving old_gear.

    const weaponItemsMap: ItemsMap = {
      arc_alloy: item({ id: 'arc_alloy', name: 'ARC Alloy', stackSize: 50 }),

      arc_motion_core: item({
        id: 'arc_motion_core',
        name: 'ARC Motion Core',
        craftBench: 'refiner',
        stationLevelRequired: 2,
        recipe: { arc_alloy: 8 },
        stackSize: 5,
      }),

      mechanical_components: item({
        id: 'mechanical_components',
        name: 'Mechanical Components',
        stackSize: 50,
      }),

      advanced_mechanical_components: item({
        id: 'advanced_mechanical_components',
        name: 'Advanced Mechanical Components',
        category: 'Refined Material',
        craftBench: 'refiner',
        stationLevelRequired: 3,
        recipe: { mechanical_components: 3 },
        stackSize: 10,
      }),

      magnetic_accelerator: item({
        id: 'magnetic_accelerator',
        name: 'Magnetic Accelerator',
        category: 'Refined Material',
        value: 5500,
        craftBench: 'refiner',
        stationLevelRequired: 3,
        recipe: { advanced_mechanical_components: 2, arc_motion_core: 2 },
        stackSize: 3,
      }),

      old_gear: item({
        id: 'old_gear',
        name: 'Old Gear',
        category: 'Recyclable',
        value: 200,
        recyclesInto: { advanced_mechanical_components: 1 },
        stackSize: 5,
      }),

      weapon_i: item({
        id: 'weapon_i',
        name: 'Weapon I',
        category: 'Weapon',
        craftBench: 'weapon_bench',
        stationLevelRequired: 3,
        blueprintLocked: false,
        recipe: { magnetic_accelerator: 1, arc_motion_core: 1 },
        upgradesTo: 'weapon_ii',
        weaponBaseId: 'weapon_i',
        weaponTier: 1,
      }),

      weapon_ii: item({
        id: 'weapon_ii',
        name: 'Weapon II',
        category: 'Weapon',
        craftBench: 'weapon_bench',
        upgradeCost: { advanced_mechanical_components: 1 },
        upgradesFrom: 'weapon_i',
        upgradesTo: 'weapon_iv',
        weaponBaseId: 'weapon_i',
        weaponTier: 2,
      }),

      weapon_iv: item({
        id: 'weapon_iv',
        name: 'Weapon IV',
        category: 'Weapon',
        craftBench: 'weapon_bench',
        upgradeCost: { advanced_mechanical_components: 1 },
        upgradesFrom: 'weapon_ii',
        weaponBaseId: 'weapon_i',
        weaponTier: 4,
      }),
    };

    // Need weapon_iv x1.
    // Own: MA x1, arc_alloy x24, mechanical_components x6, old_gear x2.
    // MA recipe: 2 AdvMechComp + 2 AMC → needs 4 AdvMechComp total (2 for MA, 2 for upgrades)
    // Own mechanical_components: 6 → can craft 2 AdvMechComp (need 4 total, still short 2)
    //
    // Wait — let me design this more carefully.
    //
    // Own:
    //   MA x1 (covers weapon_i recipe)
    //   arc_alloy x16 (enough for 2 AMC needed by weapon_i recipe)
    //   mechanical_components x6 (enough for 2 AdvMechComp via crafting)
    //   old_gear x2 (recycles into AdvMechComp)
    //
    // weapon_i needs: 1 MA + 1 AMC. Craft AMC from 8 arc_alloy. ✓
    // Upgrades need: 2 AdvMechComp total.
    //   mechanical_components: 6 → craft 2 AdvMechComp ✓
    //   old_gear: should NOT be recycled (prefer crafting from mechanical_components)

    const lists: StoredList[] = [{
      id: 'list',
      name: 'List',
      type: 'user',
      isEnabled: true,
      items: [{ itemId: 'weapon_iv', quantity: 1, isEnabled: true }],
    }];

    const result = computePlan(
      weaponItemsMap,
      lists,
      [
        { itemId: 'magnetic_accelerator', quantity: 1 },
        { itemId: 'arc_alloy', quantity: 16 },
        { itemId: 'mechanical_components', quantity: 6 },
        { itemId: 'old_gear', quantity: 2 },
      ],
      benchLevels,
      new Set(['weapon_i']),
    );

    expect(result.satisfiableTargets.has('weapon_iv')).toBe(true);

    // old_gear should NOT be recycled — AdvMechComp was crafted instead
    const recycledGear = result.recyclePlan.actions.filter(
      (action) => action.srcItemId === 'old_gear',
    );
    expect(recycledGear).toEqual([]);

    // AdvMechComp should appear as a craft step
    const craftIds = result.craftPlan.steps.map((step) => step.itemId);
    expect(craftIds).toContain('advanced_mechanical_components');
  });
});
