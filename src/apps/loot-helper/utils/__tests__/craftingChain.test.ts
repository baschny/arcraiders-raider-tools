import { describe, it, expect } from 'vitest';
import { buildCraftingTree, buildReverseMap } from '../craftingChain';
import mockItems from './mockItems.json';
import type { ItemsMap } from '../../types/item';

const itemsMap = mockItems as unknown as ItemsMap;

describe('craftingChain calculations', () => {
  describe('buildCraftingTree', () => {
    it('calculates the tree for Heavy Shield correctly', () => {
      const goalItemId = 'heavy_shield';
      const tree = buildCraftingTree(goalItemId, itemsMap, [goalItemId]);
      
      expect(tree.goalItemId).toBe(goalItemId);
      expect(tree.root.itemId).toBe(goalItemId);
      
      // Heavy Shield recipe: power_rod (1), voltage_converter (2)
      expect(tree.root.children).toHaveLength(2);
      
      const powerRodNode = tree.root.children.find(c => c.itemId === 'power_rod');
      const voltageConverterNode = tree.root.children.find(c => c.itemId === 'voltage_converter');
      
      expect(powerRodNode).toBeDefined();
      expect(powerRodNode?.quantity).toBe(1);
      
      expect(voltageConverterNode).toBeDefined();
      expect(voltageConverterNode?.quantity).toBe(2);
      
      // Power Rod recipe: advanced_electrical_components (2), arc_circuitry (2)
      expect(powerRodNode?.children).toHaveLength(2);
      const advElecNode = powerRodNode?.children.find(c => c.itemId === 'advanced_electrical_components');
      expect(advElecNode?.quantity).toBe(2); // 1 * 2
    });

    it('handles stash correctly (item in stash becomes leaf node)', () => {
      const goalItemId = 'heavy_shield';
      const stashItemIds = new Set(['power_rod']);
      const tree = buildCraftingTree(goalItemId, itemsMap, [goalItemId], stashItemIds);
      
      const powerRodNode = tree.root.children.find(c => c.itemId === 'power_rod');
      expect(powerRodNode?.children).toHaveLength(0); // Should not expand because it's in stash
    });
  });

  describe('buildReverseMap and lootable elements', () => {
    it('identifies what elements to loot for Heavy Shield goal', () => {
      const goalItemId = 'heavy_shield';
      const tree = buildCraftingTree(goalItemId, itemsMap, [goalItemId]);
      const reverseMap = buildReverseMap([tree], itemsMap);
      
      // For Heavy Shield, we need:
      // power_rod -> advanced_electrical_components, arc_circuitry
      // voltage_converter
      // advanced_electrical_components -> wires, electrical_components
      
      // Reverse map should contain all these as keys
      expect(reverseMap.has('power_rod')).toBe(true);
      expect(reverseMap.has('voltage_converter')).toBe(true);
      expect(reverseMap.get('arc_circuitry')).toBeDefined();
      
      // Basic materials (wires, electrical_components) are leaf nodes in recipes
      expect(reverseMap.has('wires')).toBe(true);
      expect(reverseMap.has('electrical_components')).toBe(true);
    });

    it('updates lootable elements when items are added to stash', () => {
      const goalItemId = 'heavy_shield';
      // Scenario: Add "ARC Circuitry" to stash
      const stashItemIds = new Set(['arc_circuitry']);
      
      const tree = buildCraftingTree(goalItemId, itemsMap, [goalItemId], stashItemIds);
      const reverseMap = buildReverseMap([tree], itemsMap, stashItemIds);
      
      // ARC Circuitry should NOT be in the reverse map anymore
      expect(reverseMap.has('arc_circuitry')).toBe(false);
      
      // But other things should still be there
      expect(reverseMap.has('power_rod')).toBe(true);
      expect(reverseMap.has('voltage_converter')).toBe(true);
    });

    it('handles multiple goal items correctly', () => {
      // Add another goal item that might share resources
      const goal1 = 'heavy_shield';
      const goal2 = 'power_rod';
      const trees = [
        buildCraftingTree(goal1, itemsMap, [goal1, goal2]),
        buildCraftingTree(goal2, itemsMap, [goal1, goal2])
      ];
      const reverseMap = buildReverseMap(trees, itemsMap);
      
      // ARC Circuitry is used in power_rod. 
      // Power rod is used in heavy_shield AND is a goal itself.
      const usage = reverseMap.get('arc_circuitry');
      expect(usage).toBeDefined();
      // It should list power_rod as parent, and both goal items should be associated with it
      const powerRodUsage = usage?.find(u => u.parentItemId === 'power_rod');
      expect(powerRodUsage?.goalItemIds).toContain(goal1);
      expect(powerRodUsage?.goalItemIds).toContain(goal2);
    });

    it('prevents infinite recursion for circular dependencies', () => {
      // Create a circular dependency in a local items map
      const circularMap: ItemsMap = {
        'item_a': { id: 'item_a', name: { en: 'A' }, type: 'Material', rarity: 'Common', recipe: { 'item_b': 1 } },
        'item_b': { id: 'item_b', name: { en: 'B' }, type: 'Material', rarity: 'Common', recipe: { 'item_a': 1 } }
      } as unknown as ItemsMap;
      
      const tree = buildCraftingTree('item_a', circularMap, ['item_a']);
      // Depth limit is 10, so it should stop there
      expect(tree.root).toBeDefined();
      
      let depth = 0;
      let current = tree.root;
      while (current.children.length > 0) {
        current = current.children[0];
        depth++;
      }
      expect(depth).toBeLessThanOrEqual(11); // it might be 11 because depth 10 is allowed, then 11 stops.
    });
  });

  describe('Salvageable items (e.g. Broken Handheld Radio)', () => {
    it('calculates the tree for a target material including salvageable sources', () => {
      // Sensor is a Topside Material.
      // Broken Handheld Radio salvages into Sensor.
      
      const goalItemId = 'heavy_shield';
      const tree = buildCraftingTree(goalItemId, itemsMap, [goalItemId]);
      
      // Find the node for Sensor (it's under advanced_electrical_components)
      const powerRodNode = tree.root.children.find(c => c.itemId === 'power_rod');
      const advElecNode = powerRodNode?.children.find(c => c.itemId === 'advanced_electrical_components');
      const sensorNode = advElecNode?.children.find(c => c.itemId === 'sensor');
      
      expect(sensorNode).toBeDefined();
      expect(sensorNode?.salvageableFrom).toBeDefined();
      expect(sensorNode?.salvageableFrom).toContainEqual({
        itemId: 'broken_handheld_radio',
        method: 'salvage'
      });
    });

    it('correctly identifies salvageable sources in reverse map', () => {
      const goalItemId = 'heavy_shield';
      const tree = buildCraftingTree(goalItemId, itemsMap, [goalItemId]);
      const reverseMap = buildReverseMap([tree], itemsMap);
      
      // Broken Handheld Radio should be in the reverse map because it salvages into Sensor,
      // and Sensor is needed for the Heavy Shield (via advanced_electrical_components).
      expect(reverseMap.has('broken_handheld_radio')).toBe(true);
      const usage = reverseMap.get('broken_handheld_radio');
      expect(usage).toContainEqual(expect.objectContaining({
        parentItemId: 'sensor',
        relationship: 'salvage'
      }));
    });

    it('identifies Broken Taser for both Heavy Shield and Raider Hatch Key', () => {
      const goal1 = 'heavy_shield';
      const goal2 = 'raider_hatch_key';
      const goals = [goal1, goal2];
      
      const trees = goals.map(id => buildCraftingTree(id, itemsMap, goals));
      const reverseMap = buildReverseMap(trees, itemsMap);
      
      // Broken Taser should be used for both
      expect(reverseMap.has('broken_taser')).toBe(true);
      const usages = reverseMap.get('broken_taser');
      
      // Check if it's used for wires (which is used for Advanced Electrical Components)
      // Note: currently findSalvageableSources excludes Basic Materials (like wires),
      // so we might need to adjust the logic or the mock data if this fails.
      const wiresUsage = usages?.find(u => u.parentItemId === 'wires');
      expect(wiresUsage).toBeDefined();
      expect(wiresUsage?.goalItemIds).toContain(goal1);
      expect(wiresUsage?.goalItemIds).toContain(goal2);
    });

    it('updates Broken Taser requirements when items are added to stash', () => {
      const goal1 = 'heavy_shield';
      const goal2 = 'raider_hatch_key';
      const goals = [goal1, goal2];
      
      // Initially, Broken Taser is needed for both
      const treesInitial = goals.map(id => buildCraftingTree(id, itemsMap, goals));
      const reverseMapInitial = buildReverseMap(treesInitial, itemsMap);
      expect(reverseMapInitial.get('broken_taser')?.find(u => u.parentItemId === 'wires')?.goalItemIds).toHaveLength(2);

      // Now add Power Rod to stash
      // Heavy Shield uses Power Rod. If we have Power Rod, we don't need to craft it,
      // so we don't need the Advanced Electrical Components FOR THE HEAVY SHIELD path.
      const stashItemIds = new Set(['power_rod']);
      const treesStashed = goals.map(id => buildCraftingTree(id, itemsMap, goals, stashItemIds));
      const reverseMapStashed = buildReverseMap(treesStashed, itemsMap, stashItemIds);
      
      expect(reverseMapStashed.has('broken_taser')).toBe(true);
      const usages = reverseMapStashed.get('broken_taser');
      const wiresUsage = usages?.find(u => u.parentItemId === 'wires');
      
      expect(wiresUsage).toBeDefined();
      // Should NOT contain heavy_shield anymore, but SHOULD still contain raider_hatch_key
      expect(wiresUsage?.goalItemIds).not.toContain(goal1);
      expect(wiresUsage?.goalItemIds).toContain(goal2);
    });
  });
});
