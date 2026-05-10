import { describe, expect, it } from 'vitest';
import blueprintSample from '../../../../../docs/sample/arctracker-api/blueprints.json';
import { aggregateStashItems, getUnlockedBlueprintItemIds } from '../api';
import type { CachedBlueprints, CachedStash } from '../../../../shared/types/arctracker';

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
});
