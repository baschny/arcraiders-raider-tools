import { describe, expect, it } from 'vitest';
import type { ItemsMap } from '../../../types/item';
import type { StoredList } from '../../../types/list';
import type { ItemId, Qty, RequiredSource, OwnedItemQuantity } from '../../../types/planner';
import { generateInRaidSuggestions } from '../inRaidSuggestions';
import { computePlan } from '../index';
import { calculateProvenance, walkDependencies } from '../provenance';

describe('In Raid Suggestions Provenance (P2 Fixes)', () => {
  const baseItem = {
    description: '',
    icon: '',
    rarity: 'Common' as const,
    type: 'Material',
    stationLevelRequired: 1 as const,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 10,
  };

  const itemsMap: ItemsMap = {
    photoelectric_cloak: {
      ...baseItem,
      id: 'photoelectric_cloak',
      name: 'Photoelectric Cloak',
      category: 'Armor',
      recipe: { speaker_component: 4 },
      craftBench: 'equipment_bench',
    },
    speaker_component: {
      ...baseItem,
      id: 'speaker_component',
      name: 'Speaker Component',
      category: 'Basic Material',
    },
    magnet: {
      ...baseItem,
      id: 'magnet',
      name: 'Magnet',
      category: 'Basic Material',
    },
    scrap_metal: {
      ...baseItem,
      id: 'scrap_metal',
      name: 'Scrap Metal',
      category: 'Recyclable',
      recyclesInto: { magnet: 1 },
    },
    helmet: {
      ...baseItem,
      id: 'helmet',
      name: 'Helmet',
      category: 'Armor',
      recipe: { magnet: 1 },
      craftBench: 'equipment_bench',
    },
  };

  it('correctly aggregates listSources for items that are both direct targets and crafting materials', () => {
    const deficits: Record<ItemId, Qty> = {
      photoelectric_cloak: 1,
      speaker_component: 4,
    };
    const requiredFinal: Record<ItemId, Qty> = {
      photoelectric_cloak: 1,
      speaker_component: 1,
    };
    const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {
      photoelectric_cloak: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
      speaker_component: [{ listId: 'list-b', listName: 'List B', quantity: 1, listType: 'user' }],
    };

    const result = generateInRaidSuggestions(
      itemsMap,
      deficits,
      requiredFinal,
      new Set(),
      requiredSourcesByItemId,
    );

    const speakerSuggestion = result.items.find((s) => s.itemId === 'speaker_component');
    expect(speakerSuggestion).toBeDefined();

    // List B: direct 1x (isDirect: true)
    // List A: support for 1x cloak -> 4x speakers (isDirect: false)
    // When direct already exists, we ignore subsequent support quantities.
    expect(speakerSuggestion?.listSources).toHaveLength(2);
    const listA = speakerSuggestion?.listSources?.find((s) => s.listId === 'list-a');
    const listB = speakerSuggestion?.listSources?.find((s) => s.listId === 'list-b');

    // list-b is processed as direct target first
    // Then list-a support for speaker is added.
    expect(listB?.quantity).toBe(1);
    expect(listA?.quantity).toBe(4);
  });

  it('correctly tracks deep dependencies (photoelectric_cloak -> speaker_component)', () => {
    const deficits: Record<ItemId, Qty> = {
      speaker_component: 8,
    };
    const requiredFinal: Record<ItemId, Qty> = {
      photoelectric_cloak: 2,
    };
    const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {
      photoelectric_cloak: [{ listId: 'list-a', listName: 'List A', quantity: 2, listType: 'user' }],
    };

    const result = generateInRaidSuggestions(
      itemsMap,
      deficits,
      requiredFinal,
      new Set(),
      requiredSourcesByItemId,
    );

    const speakerSuggestion = result.items.find(s => s.itemId === 'speaker_component');
    expect(speakerSuggestion).toBeDefined();
    expect(speakerSuggestion?.impactedTargetItemIds).toContain('photoelectric_cloak');

    // 2x cloak needs 8x speakers
    const listA = speakerSuggestion?.listSources?.find(s => s.listId === 'list-a');
    expect(listA?.quantity).toBe(8);
  });

  it('provides provenance for recycle sources based on materials they yield', () => {
    const multiYieldItemsMap: ItemsMap = {
      ...itemsMap,
      scrap_metal: {
        ...baseItem,
        id: 'scrap_metal',
        name: 'Scrap Metal',
        category: 'Recyclable',
        recyclesInto: { magnet: 1, speaker_component: 1 },
      },
    };

    const deficits: Record<ItemId, Qty> = {
      magnet: 1,
      speaker_component: 4,
    };
    const requiredFinal: Record<ItemId, Qty> = {
      helmet: 1,
      photoelectric_cloak: 1,
    };
    const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {
      helmet: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
      photoelectric_cloak: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
    };

    const result = generateInRaidSuggestions(
      multiYieldItemsMap,
      deficits,
      requiredFinal,
      new Set(),
      requiredSourcesByItemId,
    );

    const scrapSuggestion = result.items.find((s) => s.itemId === 'scrap_metal');
    expect(scrapSuggestion).toBeDefined();
    expect(scrapSuggestion?.impactedTargetItemIds).toContain('helmet');
    expect(scrapSuggestion?.impactedTargetItemIds).toContain('photoelectric_cloak');

    const listA = scrapSuggestion?.listSources?.find((s) => s.listId === 'list-a');
    expect(listA).toBeDefined();
    // 1x magnet for helmet + 4x speaker for cloak = 5x yield items supported
    expect(listA?.quantity).toBe(5);
  });

  it('correctly handles craftQuantity for multi-output recipes', () => {
    const multiItemsMap: ItemsMap = {
      ...itemsMap,
      multi_output_item: {
        ...baseItem,
        id: 'multi_output_item',
        name: 'Multi Output Item',
        category: 'Armor',
        recipe: { speaker_component: 1 },
        craftQuantity: 5,
        craftBench: 'equipment_bench',
      },
    };

    // Requiring 6 items with craftQuantity 5 should need 2 crafts worth of ingredients.
    // Each craft needs 1 speaker_component, so 2 total.
    const deficits: Record<ItemId, Qty> = {
      speaker_component: 2,
    };
    const requiredFinal: Record<ItemId, Qty> = {
      multi_output_item: 6,
    };
    const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {
      multi_output_item: [{ listId: 'list-a', listName: 'List A', quantity: 6, listType: 'user' }],
    };

    const result = generateInRaidSuggestions(
      multiItemsMap,
      deficits,
      requiredFinal,
      new Set(),
      requiredSourcesByItemId,
    );

    const speakerSuggestion = result.items.find(s => s.itemId === 'speaker_component');
    expect(speakerSuggestion).toBeDefined();
    const listA = speakerSuggestion?.listSources?.find(s => s.listId === 'list-a');
    expect(listA?.quantity).toBe(2);
  });

  it('provides cycle protection for recursive recipes', () => {
    const cycleItemsMap: ItemsMap = {
      ...itemsMap,
      item_a: {
        ...baseItem,
        id: 'item_a',
        name: 'Item A',
        category: 'Armor',
        recipe: { item_b: 1 },
        craftBench: 'equipment_bench',
      },
      item_b: {
        ...baseItem,
        id: 'item_b',
        name: 'Item B',
        category: 'Material',
        recipe: { item_a: 1 },
        craftBench: 'equipment_bench',
      },
    };

    const deficits: Record<ItemId, Qty> = { item_b: 1 };
    const requiredFinal: Record<ItemId, Qty> = { item_a: 1 };
    const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {
      item_a: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
    };

    // Should not crash
    const result = generateInRaidSuggestions(
      cycleItemsMap,
      deficits,
      requiredFinal,
      new Set(),
      requiredSourcesByItemId,
    );

    expect(result.items.length).toBeGreaterThan(0);
  });

  it('combines recipe and upgradeCost ingredients without double-counting', () => {
    const combinedItemsMap: ItemsMap = {
      ...itemsMap,
      hybrid_item: {
        ...baseItem,
        id: 'hybrid_item',
        name: 'Hybrid Item',
        category: 'Armor',
        recipe: { magnet: 1, speaker_component: 1 },
        upgradeCost: { speaker_component: 2, scrap_metal: 2 },
        craftBench: 'equipment_bench',
      },
    };

    const provenance = calculateProvenance(
      combinedItemsMap,
      {
        hybrid_item: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
      },
      {},
    );

    expect(provenance.magnet?.[0].quantity).toBe(1);
    expect(provenance.scrap_metal?.[0].quantity).toBe(2);
    expect(provenance.speaker_component?.[0].quantity).toBe(3);
  });

  it('keeps direct target quantity when the same item also supports a recycle yield', () => {
    const provenance = calculateProvenance(
      itemsMap,
      {
        helmet: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
        scrap_metal: [{ listId: 'list-a', listName: 'List A', quantity: 2, listType: 'user' }],
      },
      { magnet: 1 },
    );

    const scrapSource = provenance.scrap_metal?.find((source) => source.listId === 'list-a');
    expect(scrapSource?.quantity).toBe(2);
    expect(scrapSource?.impactedTargetItemIds).toEqual(['helmet', 'scrap_metal']);
  });

  it('does not double-count when recycle and salvage both yield the same material', () => {
    const duplicateYieldItemsMap: ItemsMap = {
      ...itemsMap,
      scrap_metal: {
        ...baseItem,
        id: 'scrap_metal',
        name: 'Scrap Metal',
        category: 'Recyclable',
        recyclesInto: { magnet: 1 },
        salvagesInto: { magnet: 1 },
      },
    };

    const provenance = calculateProvenance(
      duplicateYieldItemsMap,
      {
        helmet: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
      },
      { magnet: 1 },
    );

    expect(provenance.scrap_metal?.[0].quantity).toBe(1);
    expect(provenance.scrap_metal?.[0].impactedTargetItemIds).toEqual(['helmet']);
  });

  it('does not include a cyclic back-edge as a dependency chain', () => {
    const cycleItemsMap: ItemsMap = {
      ...itemsMap,
      item_a: {
        ...baseItem,
        id: 'item_a',
        name: 'Item A',
        category: 'Armor',
        recipe: { item_b: 1 },
        craftBench: 'equipment_bench',
      },
      item_b: {
        ...baseItem,
        id: 'item_b',
        name: 'Item B',
        category: 'Material',
        recipe: { item_a: 1 },
        craftBench: 'equipment_bench',
      },
    };

    expect(walkDependencies(cycleItemsMap, 'item_a')).toEqual([
      {
        targetItemId: 'item_a',
        ingredientItemId: 'item_b',
        chainItemIds: ['item_a', 'item_b'],
      },
    ]);
  });

  it('merges duplicate list IDs deterministically', () => {
    const deficits: Record<ItemId, Qty> = { speaker_component: 1 };
    const requiredFinal: Record<ItemId, Qty> = { speaker_component: 1 };

    // Two entries for same list (could happen if list has duplicate items)
    const requiredSourcesByItemId: Record<ItemId, RequiredSource[]> = {
      speaker_component: [
        { listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' },
        { listId: 'list-a', listName: 'List A', quantity: 2, listType: 'user' },
      ],
    };

    const result = generateInRaidSuggestions(
      itemsMap,
      deficits,
      requiredFinal,
      new Set(),
      requiredSourcesByItemId,
    );

    const speakerSuggestion = result.items.find(s => s.itemId === 'speaker_component');
    expect(speakerSuggestion?.listSources).toHaveLength(1);
    expect(speakerSuggestion?.listSources?.[0].quantity).toBe(3);
  });

  it('works end-to-end via computePlan', () => {
    const lists: StoredList[] = [
      {
        id: 'list-1',
        name: 'My List',
        type: 'user',
        isEnabled: true,
        items: [{ itemId: 'photoelectric_cloak', quantity: 1, isEnabled: true }],
      },
    ];

    const owned: OwnedItemQuantity[] = [];
    const result = computePlan(itemsMap, lists, owned);

    // Both the direct target and its ingredients should have proper provenance
    const cloakSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'photoelectric_cloak');
    expect(cloakSuggestion).toBeDefined();

    const speakerSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'speaker_component');
    expect(speakerSuggestion).toBeDefined();
    expect(speakerSuggestion?.listSources?.[0].quantity).toBe(4);
    expect(speakerSuggestion?.impactedTargetItemIds).toContain('photoelectric_cloak');
  });
});
