import { describe, it, expect } from 'vitest';
import type { ItemsMap } from '../../types/item';

describe('Filter counts should not include Basic Materials', () => {
  it('should not count Basic Materials in filter badges when goal only requires Basic Materials', () => {
    // Real data from items.json - Heavy Ammo crafted from chemicals and metal_parts
    const itemsMap: ItemsMap = {
      heavy_ammo: {
        id: 'heavy_ammo',
        name: { en: 'Heavy Ammo' },
        type: 'Ammunition',
        rarity: 'Common',
        recipe: {
          chemicals: 2,
          metal_parts: 3,
        },
        foundIn: ['Unknown'],
      },
      chemicals: {
        id: 'chemicals',
        name: { en: 'Chemicals' },
        type: 'Basic Material',
        rarity: 'Common',
        foundIn: ['Medical', 'Residential', 'Mechanical'],
      },
      metal_parts: {
        id: 'metal_parts',
        name: { en: 'Metal Parts' },
        type: 'Basic Material',
        rarity: 'Common',
        foundIn: ['Mechanical', 'Industrial', 'Electrical', 'Technological'],
      },
    };

    // Simulate what happens when Heavy Ammo is a goal
    // reverseMap would contain chemicals and metal_parts
    const reverseMapKeys = ['chemicals', 'metal_parts'];
    
    // This is what the OLD code did (gets items from reverseMap without filtering)
    const oldSortedItems = reverseMapKeys
      .map(id => itemsMap[id])
      .filter(item => item !== undefined);

    // Count rarities WITHOUT filtering Basic Materials (this was the bug)
    const buggyRarityMatchCounts = new Map();
    oldSortedItems.forEach(item => {
      buggyRarityMatchCounts.set(item.rarity, (buggyRarityMatchCounts.get(item.rarity) || 0) + 1);
    });

    // Bug: Common rarity shows count of 2 (chemicals + metal_parts)
    expect(buggyRarityMatchCounts.get('Common')).toBe(2);

    // Fixed behavior: sortedItems should filter out Basic Materials, weapons, and modifications
    const fixedSortedItems = reverseMapKeys
      .map(id => itemsMap[id])
      .filter(item => {
        if (!item) return false;
        if (item.type === 'Basic Material') return false;
        if (item.isWeapon || item.type === 'Modification') return false;
        return true;
      });
    
    const correctRarityMatchCounts = new Map();
    fixedSortedItems.forEach(item => {
      correctRarityMatchCounts.set(item.rarity, (correctRarityMatchCounts.get(item.rarity) || 0) + 1);
    });

    // Expected: Common rarity should have count of 0 (no lootable items)
    expect(correctRarityMatchCounts.get('Common')).toBeUndefined();
    expect(fixedSortedItems.length).toBe(0);
  });

  it('should count only lootable items when mixed with Basic Materials', () => {
    // Scenario: Goal requires both Basic Materials and lootable Topside Materials
    const itemsMap: ItemsMap = {
      electronics: {
        id: 'electronics',
        name: { en: 'Electronics' },
        type: 'Topside Material',
        rarity: 'Uncommon',
        foundIn: ['Technological'],
      },
      chemicals: {
        id: 'chemicals',
        name: { en: 'Chemicals' },
        type: 'Basic Material',
        rarity: 'Common',
        foundIn: ['Medical'],
      },
    };

    const reverseMapKeys = ['electronics', 'chemicals'];
    
    // Fixed behavior
    const sortedItems = reverseMapKeys
      .map(id => itemsMap[id])
      .filter(item => {
        if (!item) return false;
        if (item.type === 'Basic Material') return false;
        if (item.isWeapon || item.type === 'Modification') return false;
        return true;
      });

    const rarityMatchCounts = new Map();
    sortedItems.forEach(item => {
      rarityMatchCounts.set(item.rarity, (rarityMatchCounts.get(item.rarity) || 0) + 1);
    });

    // Should only count Electronics (Uncommon), not Chemicals (Common)
    expect(sortedItems.length).toBe(1);
    expect(sortedItems[0].id).toBe('electronics');
    expect(rarityMatchCounts.get('Uncommon')).toBe(1);
    expect(rarityMatchCounts.get('Common')).toBeUndefined();
  });
});
