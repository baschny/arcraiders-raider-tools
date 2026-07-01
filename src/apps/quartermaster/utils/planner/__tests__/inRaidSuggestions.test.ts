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

  it('uses advisory base recipe plus upgrade costs for generic upgrade chains', () => {
    const genericUpgradeItemsMap: ItemsMap = {
      ...itemsMap,
      field_scanner_i: {
        ...baseItem,
        id: 'field_scanner_i',
        name: 'Field Scanner I',
        category: 'Tool',
        recipe: { magnet: 2 },
        craftBench: 'workbench',
        upgradesTo: 'field_scanner_ii',
      },
      field_scanner_ii: {
        ...baseItem,
        id: 'field_scanner_ii',
        name: 'Field Scanner II',
        category: 'Tool',
        upgradeCost: { speaker_component: 3 },
        upgradesFrom: 'field_scanner_i',
      },
    };

    const provenance = calculateProvenance(
      genericUpgradeItemsMap,
      {
        field_scanner_ii: [{ listId: 'list-a', listName: 'List A', quantity: 1, listType: 'user' }],
      },
      {},
    );

    expect(provenance.magnet?.[0]).toMatchObject({
      quantity: 2,
      impactedTargetItemIds: ['field_scanner_ii'],
    });
    expect(provenance.speaker_component?.[0]).toMatchObject({
      quantity: 3,
      impactedTargetItemIds: ['field_scanner_ii'],
    });
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

// --------------------------------------------------------------------------
// Satisfiable target exclusion + craftableQty tests (CR-035)
// --------------------------------------------------------------------------
describe('Satisfiable target exclusion from In-Raid', () => {
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

  const craftingItemsMap: ItemsMap = {
    antiseptic: {
      ...baseItem,
      id: 'antiseptic',
      name: 'Antiseptic',
      category: 'Basic Material',
      recipe: { herbal_compound: 2, sterile_cloth: 1 },
      craftBench: 'equipment_bench',
    },
    herbal_compound: {
      ...baseItem,
      id: 'herbal_compound',
      name: 'Herbal Compound',
      category: 'Basic Material',
    },
    sterile_cloth: {
      ...baseItem,
      id: 'sterile_cloth',
      name: 'Sterile Cloth',
      category: 'Basic Material',
    },
    surveyor_vault: {
      ...baseItem,
      id: 'surveyor_vault',
      name: 'Surveyor Vault',
      category: 'Other',
    },
    rusted_shut_medical_kit: {
      ...baseItem,
      id: 'rusted_shut_medical_kit',
      name: 'Rusted Shut Medical Kit',
      category: 'Other',
    },
  };

  it('excludes fully satisfiable targets from in-raid suggestions', () => {
    const lists: StoredList[] = [
      {
        id: 'medical-lab-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 6, isEnabled: true },
          { itemId: 'surveyor_vault', quantity: 1, isEnabled: true },
          { itemId: 'rusted_shut_medical_kit', quantity: 1, isEnabled: true },
        ],
      },
    ];

    // Own enough sub-materials to craft all 6 Antiseptic
    const owned: OwnedItemQuantity[] = [
      { itemId: 'herbal_compound', quantity: 12 },
      { itemId: 'sterile_cloth', quantity: 6 },
    ];

    const result = computePlan(craftingItemsMap, lists, owned);

    // Antiseptic should be fully satisfiable
    expect(result.satisfiableTargets.has('antiseptic')).toBe(true);
    // Deficit for Antiseptic should be 0 (post-planner)
    expect(result.deficit['antiseptic'] ?? 0).toBe(0);
    // CraftableQty should be 6 (the entire shortfall)
    expect(result.craftableQty['antiseptic']).toBe(6);

    // Antiseptic should NOT appear in in-raid suggestions
    const antisepticSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'antiseptic');
    expect(antisepticSuggestion).toBeUndefined();

    // Surveyor Vault and Rusted Shut Medical Kit (cannot be crafted) SHOULD appear
    const vaultSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'surveyor_vault');
    expect(vaultSuggestion).toBeDefined();
    const kitSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'rusted_shut_medical_kit');
    expect(kitSuggestion).toBeDefined();
  });

  it('partially satisfiable targets appear in in-raid when uncraftable portion remains', () => {
    const lists: StoredList[] = [
      {
        id: 'medical-lab-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          // Need 3 craftable Antiseptic + 2 must-loot Surveyor Vaults
          { itemId: 'antiseptic', quantity: 3, isEnabled: true },
          { itemId: 'surveyor_vault', quantity: 2, isEnabled: true },
        ],
      },
    ];

    // Own enough sub-materials to craft all 3 Antiseptic
    const owned: OwnedItemQuantity[] = [
      { itemId: 'herbal_compound', quantity: 6 },
      { itemId: 'sterile_cloth', quantity: 3 },
    ];

    const result = computePlan(craftingItemsMap, lists, owned);

    // Antiseptic should be fully satisfiable (need 3, can craft 3)
    expect(result.satisfiableTargets.has('antiseptic')).toBe(true);
    // Post-planner deficit for Antiseptic = 0
    expect(result.deficit['antiseptic'] ?? 0).toBe(0);
    // CraftableQty should be 3
    expect(result.craftableQty['antiseptic']).toBe(3);

    // Antiseptic should NOT appear in in-raid (fully satisfied)
    const antisepticSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'antiseptic');
    expect(antisepticSuggestion).toBeUndefined();

    // Surveyor Vault (uncraftable) should appear with deficit 2
    const vaultSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'surveyor_vault');
    expect(vaultSuggestion).toBeDefined();
    // Vault should not be satisfiable (can't be crafted)
    expect(result.satisfiableTargets.has('surveyor_vault')).toBe(false);
    expect(result.deficit['surveyor_vault']).toBe(2);
    expect(result.craftableQty['surveyor_vault'] ?? 0).toBe(0);
  });

  it('craftableQty is 0 when the item has no recipe and is entirely in deficit', () => {
    const lists: StoredList[] = [
      {
        id: 'list-1',
        name: 'My List',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'surveyor_vault', quantity: 1, isEnabled: true },
        ],
      },
    ];

    const owned: OwnedItemQuantity[] = [];
    const result = computePlan(craftingItemsMap, lists, owned);

    // Surveyor Vault cannot be crafted — craftableQty must be 0
    expect(result.craftableQty['surveyor_vault'] ?? 0).toBe(0);
    // Deficit must be 1
    expect(result.deficit['surveyor_vault']).toBe(1);
    // Appears in In-Raid
    const vaultSuggestion = result.inRaidSuggestions.items.find((s) => s.itemId === 'surveyor_vault');
    expect(vaultSuggestion).toBeDefined();
  });

  it('craftableQty equals full shortfall when partially owned and rest is craftable', () => {
    const lists: StoredList[] = [
      {
        id: 'medical-lab-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 8, isEnabled: true },
        ],
      },
    ];

    // Own 2 Antiseptic, and enough mats for 6 more
    const owned: OwnedItemQuantity[] = [
      { itemId: 'antiseptic', quantity: 2 },
      { itemId: 'herbal_compound', quantity: 12 },
      { itemId: 'sterile_cloth', quantity: 6 },
    ];

    const result = computePlan(craftingItemsMap, lists, owned);

    // Fully satisfiable (need 8, own 2, craft 6 → all covered)
    expect(result.satisfiableTargets.has('antiseptic')).toBe(true);
    // Post-planner deficit = 0
    expect(result.deficit['antiseptic'] ?? 0).toBe(0);
    // craftableQty = 6 (the planner produced 6)
    expect(result.craftableQty['antiseptic']).toBe(6);
    // Not in In-Raid
    expect(result.inRaidSuggestions.items.find((s) => s.itemId === 'antiseptic')).toBeUndefined();
  });
});
