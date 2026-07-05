import { describe, expect, it } from 'vitest';
import type { ItemsMap, PlannerItem } from '../../types/item';
import { getRecycleTargetItems, getRecycleSourceItems, getRecycleYieldInfo } from '../recycleFilter';

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

describe('recycleFilter utilities', () => {
  describe('getRecycleTargetItems', () => {
    it('returns empty map when no items have recyclesInto', () => {
      const itemsMap: ItemsMap = {
        a: item({ id: 'a', name: 'Item A' }),
        b: item({ id: 'b', name: 'Item B' }),
      };
      expect(getRecycleTargetItems(itemsMap).size).toBe(0);
    });

    it('returns direct target items', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const targets = getRecycleTargetItems(itemsMap);
      expect(targets.size).toBe(1);
      expect(targets.get('metal')!.name).toBe('Metal');
    });

    it('returns indirect (two-step) target items', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap: 1 } }),
        scrap: item({ id: 'scrap', name: 'Scrap', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const targets = getRecycleTargetItems(itemsMap);
      expect(targets.size).toBe(2);
      expect(targets.has('scrap')).toBe(true);
      expect(targets.has('metal')).toBe(true);
    });

    it('includes target items reachable from multiple sources', () => {
      const itemsMap: ItemsMap = {
        junk_a: item({ id: 'junk_a', name: 'Junk A', recyclesInto: { metal: 1 } }),
        junk_b: item({ id: 'junk_b', name: 'Junk B', recyclesInto: { metal: 2 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const targets = getRecycleTargetItems(itemsMap);
      expect(targets.size).toBe(1);
      expect(targets.has('metal')).toBe(true);
    });

    it('excludes target items not existing in itemsMap', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { ghost: 1 } }),
      };
      const targets = getRecycleTargetItems(itemsMap);
      expect(targets.size).toBe(0);
    });

    it('handles salvagesInto (ignored — only recyclesInto matters)', () => {
      const itemsMap: ItemsMap = {
        gear: item({ id: 'gear', name: 'Gear', salvagesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const targets = getRecycleTargetItems(itemsMap);
      expect(targets.size).toBe(0);
    });

    it('handles chain depth=2 where intermediate has no recyclesInto', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap: 1 } }),
        scrap: item({ id: 'scrap', name: 'Scrap' }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const targets = getRecycleTargetItems(itemsMap);
      expect(targets.size).toBe(1);
      expect(targets.has('scrap')).toBe(true);
      expect(targets.has('metal')).toBe(false);
    });
  });

  describe('getRecycleSourceItems', () => {
    it('returns empty set when no items recycle into target', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
        plastic: item({ id: 'plastic', name: 'Plastic' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'plastic');
      expect(sources.size).toBe(0);
    });

    it('returns direct recyclers', () => {
      const itemsMap: ItemsMap = {
        old_gear: item({ id: 'old_gear', name: 'Old Gear', recyclesInto: { metal: 2 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
        plastic: item({ id: 'plastic', name: 'Plastic' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'metal');
      expect(sources.size).toBe(2);
      expect(sources.has('old_gear')).toBe(true);
      expect(sources.has('scrap_metal')).toBe(true);
    });

    it('returns two-step recyclers', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap_metal: 1 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'metal');
      expect(sources.size).toBe(2);
      expect(sources.has('junk')).toBe(true);
      expect(sources.has('scrap_metal')).toBe(true);
    });

    it('returns both direct and two-step recyclers', () => {
      const itemsMap: ItemsMap = {
        old_gear: item({ id: 'old_gear', name: 'Old Gear', recyclesInto: { metal: 2 } }),
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap_metal: 1 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'metal');
      expect(sources.size).toBe(3);
      expect(sources.has('old_gear')).toBe(true);
      expect(sources.has('junk')).toBe(true);
      expect(sources.has('scrap_metal')).toBe(true);
    });

    it('does not return items that recycle into unrelated targets', () => {
      const itemsMap: ItemsMap = {
        old_gear: item({ id: 'old_gear', name: 'Old Gear', recyclesInto: { plastic: 2 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'metal');
      expect(sources.size).toBe(1);
      expect(sources.has('scrap_metal')).toBe(true);
      expect(sources.has('old_gear')).toBe(false);
    });

    it('handles intermediate items not in itemsMap', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'metal');
      expect(sources.size).toBe(0);
    });

    it('returns empty set when target does not exist', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { metal: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const sources = getRecycleSourceItems(itemsMap, 'nonexistent');
      expect(sources.size).toBe(0);
    });

    it('two-step chain where intermediate also recycles into other targets', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap_metal: 1 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 1, wires: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
        wires: item({ id: 'wires', name: 'Wires' }),
      };
      const metalSources = getRecycleSourceItems(itemsMap, 'metal');
      expect(metalSources.size).toBe(2);
      expect(metalSources.has('junk')).toBe(true);
      expect(metalSources.has('scrap_metal')).toBe(true);

      const wireSources = getRecycleSourceItems(itemsMap, 'wires');
      expect(wireSources.size).toBe(2);
      expect(wireSources.has('junk')).toBe(true);
      expect(wireSources.has('scrap_metal')).toBe(true);
    });
  });

  describe('getRecycleYieldInfo', () => {
    it('returns null for item without recyclesInto', () => {
      const itemsMap: ItemsMap = {
        plain: item({ id: 'plain', name: 'Plain Item' }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      expect(getRecycleYieldInfo(itemsMap, 'plain', 'metal')).toBeNull();
    });

    it('returns null when item does not recycle into target', () => {
      const itemsMap: ItemsMap = {
        old_gear: item({ id: 'old_gear', name: 'Old Gear', recyclesInto: { plastic: 2 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      expect(getRecycleYieldInfo(itemsMap, 'old_gear', 'metal')).toBeNull();
    });

    it('returns direct yield info', () => {
      const itemsMap: ItemsMap = {
        old_gear: item({ id: 'old_gear', name: 'Old Gear', recyclesInto: { metal: 3 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const info = getRecycleYieldInfo(itemsMap, 'old_gear', 'metal');
      expect(info).toEqual({ type: 'direct', perItem: 3 });
    });

    it('returns indirect yield info via one intermediate', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap_metal: 2 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 3 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const info = getRecycleYieldInfo(itemsMap, 'junk', 'metal');
      expect(info).toEqual({
        type: 'indirect',
        perItem: 6,
        intermediateId: 'scrap_metal',
        intermediateName: 'Scrap Metal',
        intermediateYield: 2,
        finalYield: 3,
      });
    });

    it('returns null for source that recycles into intermediate that does not recycle to target', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap: 1 } }),
        scrap: item({ id: 'scrap', name: 'Scrap' }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      expect(getRecycleYieldInfo(itemsMap, 'junk', 'metal')).toBeNull();
    });

    it('computes yield when intermediate has multiple outputs', () => {
      const itemsMap: ItemsMap = {
        junk: item({ id: 'junk', name: 'Junk', recyclesInto: { scrap_metal: 1 } }),
        scrap_metal: item({ id: 'scrap_metal', name: 'Scrap Metal', recyclesInto: { metal: 2, plastic: 1 } }),
        metal: item({ id: 'metal', name: 'Metal' }),
      };
      const info = getRecycleYieldInfo(itemsMap, 'junk', 'metal');
      expect(info).toEqual({
        type: 'indirect',
        perItem: 2,
        intermediateId: 'scrap_metal',
        intermediateName: 'Scrap Metal',
        intermediateYield: 1,
        finalYield: 2,
      });
    });
  });
});
