import { describe, expect, it } from 'vitest';
import blueprintSample from '../../../../../docs/sample/arctracker-api/blueprints.json';
import { aggregateOwnedInventory, aggregateStashItems, getUnlockedBlueprintItemIds, toOwnedItemQuantities } from '../api';
import type { ItemsMap, PlannerItem } from '../../types/item';
import type { CachedBlueprints, CachedLoadout, CachedStash } from '../../../../shared/types/arctracker';

function item(id: string, name = id): PlannerItem {
  return {
    id,
    name,
    description: '',
    icon: '',
    rarity: 'Common',
    type: 'Modification',
    category: 'Modification',
    stationLevelRequired: 1,
    blueprintLocked: false,
    craftQuantity: 1,
    stackSize: 1,
  };
}

const itemsMap: ItemsMap = {
  stitcher_iii: item('stitcher_iii', 'Stitcher III'),
  extended_barrel: item('extended_barrel', 'Extended Barrel'),
  extended_light_mag_i: item('extended_light_mag_i', 'Extended Light Mag I'),
  padded_stock: item('padded_stock', 'Padded Stock'),
  light_ammo: item('light_ammo', 'Light Ammo'),
};

describe('quartermaster API utilities', () => {
  it('ignores stash rows without item IDs while aggregating', () => {
    const stash: CachedStash = {
      items: [
        { itemId: 'metal_parts', name: 'Metal Parts', quantity: 2, slotIndex: 0 },
        { itemId: null, name: '', quantity: 1, slotIndex: 1 },
        { itemId: 'metal_parts', name: 'Metal Parts', quantity: 3, slotIndex: 2 },
        { itemId: 'wires', name: 'Wires', quantity: 0, slotIndex: 3 },
      ],
      currencies: { credits: 0, cred: 0, raiderTokens: 0, xp: 0 },
      slots: { used: 0, max: 0 },
      syncedAt: '2026-05-03T00:00:00.000Z',
      cachedAt: 0,
    };

    expect(aggregateStashItems(stash)).toEqual([
      { itemId: 'metal_parts', quantity: 5 },
    ]);
  });

  it('derives learned blueprint target item IDs from cached blueprints', () => {
    const cachedBlueprints: CachedBlueprints = {
      unlockedItemIds: blueprintSample.data.blueprints
        .filter((blueprint) => blueprint.learned)
        .map((blueprint) => blueprint.targetItemId)
        .sort((a, b) => a.localeCompare(b)),
      blueprintsByTargetItemId: Object.fromEntries(
        blueprintSample.data.blueprints.map((blueprint) => [blueprint.targetItemId, blueprint]),
      ),
      syncedAt: '2026-05-10T00:00:00.000Z',
      cachedAt: 0,
    };

    const unlocked = getUnlockedBlueprintItemIds(cachedBlueprints);

    expect(unlocked.has('anvil')).toBe(true);
    expect(unlocked.has('canto')).toBe(false);
  });

  it('aggregates canonical owned inventory from stash, loadout, and attachments', () => {
    const stash: CachedStash = {
      items: [
        {
          itemId: 'stitcher_iii',
          name: 'Stitcher III',
          quantity: 1,
          slotIndex: 21,
          durabilityPercent: 74.3618,
          attachments: [
            { itemId: 'extended_barrel', name: 'Extended Barrel', quantity: 1, slotIndex: 0, durabilityPercent: 100 },
            { itemId: null, name: null, quantity: 1, slotIndex: 1, durabilityPercent: 100 },
            { itemId: 'extended_light_mag_i', name: 'Extended Light Mag I', quantity: 1, slotIndex: 2, durabilityPercent: 100 },
            { itemId: 'padded_stock', name: 'Padded Stock', quantity: 1, slotIndex: 3, durabilityPercent: 100 },
          ],
        },
        { itemId: 'unknown_item', name: 'Unknown', quantity: 99, slotIndex: 22 },
      ],
      currencies: { credits: 0, cred: 0, raiderTokens: 0, xp: 0 },
      slots: { used: 0, max: 0 },
      syncedAt: '2026-05-03T00:00:00.000Z',
      cachedAt: 0,
    };
    const loadout: CachedLoadout = {
      loadout: {
        augment: { itemId: null, name: null, quantity: 1, slotIndex: 0, durabilityPercent: 100 },
        shield: { itemId: null, name: null, quantity: 1, slotIndex: 1, durabilityPercent: 100 },
        weapon1: {
          itemId: 'stitcher_iii',
          name: 'Stitcher III',
          quantity: 1,
          slotIndex: 2,
          durabilityPercent: 100,
          attachments: [
            { itemId: 'extended_barrel', name: 'Extended Barrel', quantity: 1, slotIndex: 0, durabilityPercent: 100 },
          ],
        },
        weapon2: { itemId: null, name: null, quantity: 1, slotIndex: 3, durabilityPercent: 100 },
        backpack: [{ itemId: 'light_ammo', name: 'Light Ammo', quantity: 120, slotIndex: 0, durabilityPercent: 100 }],
        quickItems: [],
        safePocket: [],
        augmentedSlots: [],
        slotCounts: { backpack: 1, quickItems: 0, safePocket: 0, augmentedSlots: 0 },
      },
      syncedAt: '2026-05-03T00:00:00.000Z',
      cachedAt: 0,
    };

    const rows = aggregateOwnedInventory(stash, loadout, itemsMap);

    expect(toOwnedItemQuantities(rows)).toEqual([
      { itemId: 'extended_barrel', quantity: 2 },
      { itemId: 'extended_light_mag_i', quantity: 1 },
      { itemId: 'light_ammo', quantity: 120 },
      { itemId: 'padded_stock', quantity: 1 },
      { itemId: 'stitcher_iii', quantity: 2 },
    ]);
    expect(rows.find((row) => row.itemId === 'extended_barrel')?.locations).toEqual([
      {
        source: 'stash_attachment',
        quantity: 1,
        parentItemId: 'stitcher_iii',
        parentName: 'Stitcher III',
      },
      {
        source: 'loadout_attachment',
        quantity: 1,
        parentItemId: 'stitcher_iii',
        parentName: 'Stitcher III',
      },
    ]);
    expect(rows.find((row) => row.itemId === 'stitcher_iii')?.locations).toEqual([
      { source: 'stash', quantity: 1, hasAttachments: true },
      { source: 'loadout', quantity: 1, hasAttachments: true },
    ]);
  });
});
