import { describe, expect, it } from 'vitest';
import { decodeEmbarkInventory, type EmbarkRawInventoryItem } from '../embarkInventoryDecode';
import { gameMappings } from '../gameMappings';

const args = { syncedAt: '2026-10-08T10:00:00.000Z', cachedAt: 1, manifestId: 'm', rawSnapshotId: 'raw' };

function raw(gameAssetId: number, extra: Partial<EmbarkRawInventoryItem> = {}): EmbarkRawInventoryItem {
  return { amount: 1, durability: 0, gameAssetId, instanceId: `i-${gameAssetId}-${Math.random()}`, maxDurability: 0, slots: null, ...extra };
}

const assetOf = (slug: string): number => Number(Object.entries(gameMappings.items).find(([, s]) => s === slug)![0]);

describe('decodeEmbarkInventory', () => {
  it('reads currencies by asset id from the mapping constants', () => {
    const { currencies } = gameMappings.constants;
    const snapshot = decodeEmbarkInventory({
      items: [
        raw(currencies.coins, { amount: 1200 }),
        raw(currencies.creds, { amount: 5 }),
        raw(currencies.raiderTokens, { amount: 30 }),
        raw(currencies.xp, { amount: 99 }),
      ],
    }, args);
    expect(snapshot.stash.currencies).toEqual({ credits: 1200, cred: 5, raiderTokens: 30, xp: 99 });
  });

  it('resolves bench levels and blueprint unlocks from the generated tables', () => {
    const [generatorId, bench] = Object.entries(gameMappings.benches)[0];
    const [unlockId, unlock] = Object.entries(gameMappings.blueprintUnlocks)[0];
    const snapshot = decodeEmbarkInventory({ items: [raw(Number(generatorId)), raw(Number(unlockId))] }, args);
    const module = snapshot.hideout.modules.find((m) => m.moduleId === bench.benchId)!;
    expect(module.currentLevel).toBe(bench.level);
    expect(module.maxLevel).toBeGreaterThanOrEqual(bench.level);
    expect(snapshot.blueprints.unlockedItemIds).toEqual([unlock.itemId]);
    expect(snapshot.blueprints.blueprintsByTargetItemId[unlock.itemId].learned).toBe(true);
  });

  it('never reports inventory structures as actual items', () => {
    const structureId = Number(Object.keys(gameMappings.structures).find((id) => id in gameMappings.items)!);
    const root = gameMappings.constants.inventory;
    const slotItem = raw(structureId);
    const slot = raw(root.regularItemSlot, { slots: [slotItem.instanceId] });
    const stash = raw(root.mainStashRoot, { slots: [slot.instanceId] });
    const tree = raw(root.inventoryRoot, { slots: [stash.instanceId] });
    const snapshot = decodeEmbarkInventory({ items: [tree, stash, slot, slotItem] }, args);
    expect(snapshot.stash.items).toEqual([]);
  });

  it('decodes stash items to site slugs', () => {
    const root = gameMappings.constants.inventory;
    const item = raw(assetOf('metal_parts'), { amount: 7 });
    const slot = raw(root.regularItemSlot, { slots: [item.instanceId] });
    const stash = raw(root.mainStashRoot, { slots: [slot.instanceId] });
    const tree = raw(root.inventoryRoot, { slots: [stash.instanceId] });
    const snapshot = decodeEmbarkInventory({ items: [tree, stash, slot, item] }, args);
    expect(snapshot.stash.items.map((i) => [i.itemId, i.quantity])).toEqual([['metal_parts', 7]]);
  });
});

describe('game-mappings.json', () => {
  it('maps every currency constant to a shipped item', () => {
    for (const id of ['coins', 'creds', 'raiderTokens', 'xp'] as const) {
      expect(gameMappings.items[String(gameMappings.constants.currencies[id])]).toBeTruthy();
    }
  });

  it('keeps objective keys as tree paths rooted at 0', () => {
    for (const quest of Object.values(gameMappings.quests)) {
      expect(Object.values(quest.objectives)).toContain('0');
      for (const key of Object.values(quest.objectives)) expect(key).toMatch(/^0(\.\d+)*$/);
      for (const id of Object.keys(quest.required)) expect(quest.objectives[id]).toBeDefined();
    }
  });

  it('keeps project keys as index paths', () => {
    for (const entry of Object.values(gameMappings.projects)) {
      if (entry.key !== undefined) expect(entry.key).toMatch(/^\d+(\.\d+){0,2}$/);
    }
  });
});
