import type { CachedStash, CachedLoadout } from '../types/arctracker';

function addQuantity(map: Map<string, number>, itemId: string | null, quantity: number): void {
  if (!itemId || quantity <= 0) return;
  map.set(itemId, (map.get(itemId) ?? 0) + quantity);
}

export function aggregateInventoryQuantities(
  cachedStash: CachedStash | null,
  cachedLoadout: CachedLoadout | null,
): Map<string, number> {
  const inventory = new Map<string, number>();

  for (const item of cachedStash?.items ?? []) {
    addQuantity(inventory, item.itemId, item.quantity);
  }

  const loadout = cachedLoadout?.loadout;
  if (loadout) {
    addQuantity(inventory, loadout.augment?.itemId ?? null, loadout.augment?.quantity ?? 0);
    addQuantity(inventory, loadout.shield?.itemId ?? null, loadout.shield?.quantity ?? 0);
    addQuantity(inventory, loadout.weapon1?.itemId ?? null, loadout.weapon1?.quantity ?? 0);
    addQuantity(inventory, loadout.weapon2?.itemId ?? null, loadout.weapon2?.quantity ?? 0);
    for (const slot of loadout.backpack ?? []) {
      addQuantity(inventory, slot.itemId, slot.quantity);
    }
    for (const slot of loadout.quickItems ?? []) {
      addQuantity(inventory, slot.itemId, slot.quantity);
    }
    for (const slot of loadout.safePocket ?? []) {
      addQuantity(inventory, slot.itemId, slot.quantity);
    }
    for (const slot of loadout.augmentedSlots ?? []) {
      addQuantity(inventory, slot.itemId, slot.quantity);
    }
  }

  return inventory;
}
