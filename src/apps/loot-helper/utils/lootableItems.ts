import type { Item } from '../types/item';

/**
 * Items the loot list never offers as something to loot: basic materials (category
 * `CraftingMaterial.Basic`), weapons and weapon mods (stash group `Modifications`).
 */
export function isExcludedFromLootList(item: Pick<Item, 'category' | 'group' | 'isWeapon'>): boolean {
  return item.category === 'CraftingMaterial.Basic' || !!item.isWeapon || item.group === 'Modifications';
}
