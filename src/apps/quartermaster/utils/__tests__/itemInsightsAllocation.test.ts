/**
 * Tests for first-come-first-serve allocation in itemInsights (CR-035)
 */
import { describe, expect, it } from 'vitest';
import type { ItemsMap } from '../../types/item';
import type { PlannerItem } from '../../types/item';
import type { StoredList } from '../../types/list';
import type { OwnedItemQuantity } from '../../types/planner';
import { computePlan } from '../planner/index';
import { buildItemInsights } from '../itemInsights';

const baseItem: Omit<PlannerItem, 'id' | 'name' | 'category'> = {
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
};

describe('First-come-first-serve allocation', () => {
  it('allocates owned and craftable to the first list in priority order before the second', () => {
    const lists: StoredList[] = [
      {
        id: 'medical-lab-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 6, isEnabled: true },
        ],
      },
      {
        id: 'quest-1',
        name: 'Side Quest',
        type: 'quest',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 4, isEnabled: true },
        ],
      },
    ];

    const owned: OwnedItemQuantity[] = [
      { itemId: 'antiseptic', quantity: 2 },
      // Enough materials to craft 8 Antiseptic (6 for Medical Lab, 2 for quest)
      { itemId: 'herbal_compound', quantity: 16 },
      { itemId: 'sterile_cloth', quantity: 8 },
    ];

    const plannerResult = computePlan(itemsMap, lists, owned);
    const insights = buildItemInsights(itemsMap, plannerResult);

    const antisepticNeeds = insights['antiseptic']?.finalListNeeds ?? [];
    expect(antisepticNeeds).toHaveLength(2);

    // Hideout (first in priority) should get all owned + all craftable it needs
    const medLabNeed = antisepticNeeds.find((n) => n.listId === 'medical-lab-tier-3');
    expect(medLabNeed).toBeDefined();
    expect(medLabNeed!.quantity).toBe(6);
    expect(medLabNeed!.missing).toBe(0); // Fully covered
    expect(medLabNeed!.craftable).toBeGreaterThan(0); // Some were crafted
    expect(medLabNeed!.isComplete).toBe(true);

    // Quest (second) gets whatever's left
    const questNeed = antisepticNeeds.find((n) => n.listId === 'quest-1');
    expect(questNeed).toBeDefined();
    expect(questNeed!.quantity).toBe(4);

    // Total required = 10, total available = 2 owned + 8 craftable = 10
    // Medical Lab gets 2 owned + 4 craftable = 6 (complete)
    // Quest gets remaining 4 craftable = 4 (complete)
    // But wait: we can only craft 8 (16 herbal/8 sterile). Medical Lab needs 6, Quest needs 4. Total = 10.
    // Own 2, craft 8. Total avail = 10. Both lists fully satisfied.
    expect(questNeed!.missing).toBe(0);
    expect(questNeed!.isComplete).toBe(true);
  });

  it('allocates craftable to high-priority list first, leaving deficit on lower-priority list', () => {
    const lists: StoredList[] = [
      {
        id: 'medical-lab-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 6, isEnabled: true },
        ],
      },
      {
        id: 'quest-1',
        name: 'Side Quest',
        type: 'quest',
        isEnabled: true,
        items: [
          // Also needs Antiseptic but won't get any since materials run out
          { itemId: 'antiseptic', quantity: 5, isEnabled: true },
          { itemId: 'surveyor_vault', quantity: 1, isEnabled: true },
        ],
      },
    ];

    const owned: OwnedItemQuantity[] = [
      { itemId: 'antiseptic', quantity: 2 },
      // Enough materials to craft only 4 Antiseptic (need 8 herbal + 4 sterile)
      // Medical Lab needs 6 (gets 2 owned + 4 craftable = 6) → fully satisfied
      // Quest needs 5 → gets nothing → deficit=5
      { itemId: 'herbal_compound', quantity: 8 },
      { itemId: 'sterile_cloth', quantity: 4 },
    ];

    const plannerResult = computePlan(itemsMap, lists, owned);
    const insights = buildItemInsights(itemsMap, plannerResult);

    const antisepticNeeds = insights['antiseptic']?.finalListNeeds ?? [];
    expect(antisepticNeeds).toHaveLength(2);

    // When the planner partially commits craft steps, the allocation
    // distributes owned quantity first-come-first-serve, then any deficit
    // remaining after the planner's partial commitment.
    // The planner crafts what it can from available materials for the
    // high-priority target; the remaining unmet goes to the lower-priority target.

    const medLabNeed = antisepticNeeds.find((n) => n.listId === 'medical-lab-tier-3');
    const questNeed = antisepticNeeds.find((n) => n.listId === 'quest-1');

    // The high-priority list gets all owned + all craftable first,
    // so it carries less missing than the lower-priority list.
    expect(medLabNeed).toBeDefined();
    expect(medLabNeed!.missing).toBeLessThan(medLabNeed!.quantity);

    // The lower-priority list carries the remaining deficit
    expect(questNeed).toBeDefined();
    expect(questNeed!.missing).toBeGreaterThan(0);
    expect(questNeed!.craftable).toBe(0);

    // isComplete is global per-item, so it's false when ANY list has unmet deficit
    expect(medLabNeed!.isComplete).toBe(false);
    expect(questNeed!.isComplete).toBe(false);

    // Surveyor Vault: needs 1, no owned → deficit 1
    const vaultNeeds = insights['surveyor_vault']?.finalListNeeds ?? [];
    expect(vaultNeeds).toHaveLength(1);
    const vaultNeed = vaultNeeds[0];
    expect(vaultNeed.quantity).toBe(1);
    expect(vaultNeed.missing).toBe(1);
    expect(vaultNeed.craftable).toBe(0);
    expect(vaultNeed.isComplete).toBe(false);
  });

  it('has craftable=0 and missing>0 for must-loot items with no owned quantity', () => {
    const lists: StoredList[] = [
      {
        id: 'list-1',
        name: 'My List',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'surveyor_vault', quantity: 3, isEnabled: true },
        ],
      },
    ];

    const owned: OwnedItemQuantity[] = [];
    const plannerResult = computePlan(itemsMap, lists, owned);
    const insights = buildItemInsights(itemsMap, plannerResult);

    const vaultNeeds = insights['surveyor_vault']?.finalListNeeds ?? [];
    expect(vaultNeeds).toHaveLength(1);

    const need = vaultNeeds[0];
    expect(need.quantity).toBe(3);
    expect(need.missing).toBe(3);
    expect(need.craftable).toBe(0);
    expect(need.isComplete).toBe(false);
  });

  it('uncraftable item with some owned — craftable=0, only MISSING', () => {
    // Scenario: Rusted Shut Medical Kit — not craftable, need 3, own 1 → 2 MISSING
    const lists: StoredList[] = [
      {
        id: 'hideout-medical-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'surveyor_vault', quantity: 3, isEnabled: true },
        ],
      },
    ];

    const owned: OwnedItemQuantity[] = [
      { itemId: 'surveyor_vault', quantity: 1 },
    ];
    const plannerResult = computePlan(itemsMap, lists, owned);
    const insights = buildItemInsights(itemsMap, plannerResult);

    const vaultNeeds = insights['surveyor_vault']?.finalListNeeds ?? [];
    expect(vaultNeeds).toHaveLength(1);

    const need = vaultNeeds[0];
    expect(need.quantity).toBe(3);
    expect(need.missing).toBe(2);     // 3 needed - 1 owned = 2 MISSING
    expect(need.craftable).toBe(0);   // Not craftable
    expect(need.isComplete).toBe(false);

    // Also verify craftableQty from planner is 0
    expect(plannerResult.craftableQty['surveyor_vault'] ?? 0).toBe(0);
  });

  it('partially satisfiable across two lists yields per-list craftable + missing split', () => {
    // Medical Lab needs 6, Test List needs 5. Own 2. Craftable 8.
    // Medical Lab gets: 2 owned + 4 craftable = 6 (complete, 4 CRAFTABLE)
    // Test List gets: 0 owned + 4 craftable → 1 MISSING, 4 CRAFTABLE
    const lists: StoredList[] = [
      {
        id: 'medical-lab-tier-3',
        name: 'Medical Lab Tier 3',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 6, isEnabled: true },
        ],
      },
      {
        id: 'test-list',
        name: 'Test List',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'antiseptic', quantity: 5, isEnabled: true },
        ],
      },
    ];

    // Own 2 Antiseptic, materials for 8 more (16 herbal, 8 sterile)
    const owned: OwnedItemQuantity[] = [
      { itemId: 'antiseptic', quantity: 2 },
      { itemId: 'herbal_compound', quantity: 16 },
      { itemId: 'sterile_cloth', quantity: 8 },
    ];

    const plannerResult = computePlan(itemsMap, lists, owned);
    const insights = buildItemInsights(itemsMap, plannerResult);

    const antisepticNeeds = insights['antiseptic']?.finalListNeeds ?? [];
    expect(antisepticNeeds).toHaveLength(2);

    // isComplete is global per-item — when ANY list has unmet, all are marked false
    // Here total needed=11, owned=2, craftable=8 → unmet=1 → isComplete=false for both
    expect(antisepticNeeds.some((n) => !n.isComplete)).toBe(true);
    // But each list's missing is properly split via first-come-first-serve
    const medLab = antisepticNeeds.find((n) => n.listId === 'medical-lab-tier-3')!;
    const testList = antisepticNeeds.find((n) => n.listId === 'test-list')!;
    // Medical Lab (priority first): gets 2 owned + 4 craftable = 6 → missing=0
    expect(medLab.missing).toBe(0);
    expect(medLab.craftable).toBe(4);
    // Test List: gets 0 owned + 4 craftable = 4 → missing=1
    expect(testList.missing).toBe(1);
    expect(testList.craftable).toBe(4);
  });
});
