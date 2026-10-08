import type { Item, ItemRarity } from '../types/item';

type Translate = (key: string) => string;

const rarityKeys: Record<ItemRarity, string> = {
  Common: 'lootHelper.rarities.common',
  Uncommon: 'lootHelper.rarities.uncommon',
  Rare: 'lootHelper.rarities.rare',
  Epic: 'lootHelper.rarities.epic',
  Legendary: 'lootHelper.rarities.legendary',
  Amplified: 'lootHelper.rarities.amplified',
};

export function getItemDisplayName(item: Pick<Item, 'name'>): string {
  return item.name.en;
}

export const getLootHelperItemName = getItemDisplayName;

export function getLootHelperItemDescription(item: Pick<Item, 'description'>): string | null {
  return item.description ?? null;
}

export function getLocalizedLootHelperRarity(t: Translate, rarity: ItemRarity): string {
  return t(rarityKeys[rarity]);
}
