import type { Item, ItemRarity } from '../types/item';

type Translate = (key: string) => string;

export const LOOT_HELPER_RARITY_ORDER: ItemRarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
];

export const LOOT_HELPER_LOCATION_ORDER = [
  'Residential',
  'Commercial',
  'Old World',
  'Technological',
  'Medical',
  'Mechanical',
  'Industrial',
  'Electrical',
  'ARC',
  'Nature',
  'Exodus',
  'Raider',
  'Security',
  'Unknown',
];

const rarityKeys: Record<ItemRarity, string> = {
  Common: 'lootHelper.rarities.common',
  Uncommon: 'lootHelper.rarities.uncommon',
  Rare: 'lootHelper.rarities.rare',
  Epic: 'lootHelper.rarities.epic',
  Legendary: 'lootHelper.rarities.legendary',
};

const locationKeys: Record<string, string> = {
  ARC: 'lootHelper.locations.arc',
  Commercial: 'lootHelper.locations.commercial',
  Electrical: 'lootHelper.locations.electrical',
  Exodus: 'lootHelper.locations.exodus',
  Industrial: 'lootHelper.locations.industrial',
  Mechanical: 'lootHelper.locations.mechanical',
  Medical: 'lootHelper.locations.medical',
  Nature: 'lootHelper.locations.nature',
  'Old World': 'lootHelper.locations.oldWorld',
  Raider: 'lootHelper.locations.raider',
  Residential: 'lootHelper.locations.residential',
  Security: 'lootHelper.locations.security',
  Technological: 'lootHelper.locations.technological',
  Unknown: 'lootHelper.locations.unknown',
};

const typeKeys: Record<string, string> = {
  Ammunition: 'lootHelper.types.ammunition',
  'Assault Rifle': 'lootHelper.types.assaultRifle',
  Augment: 'lootHelper.types.augment',
  'Basic Material': 'lootHelper.types.basicMaterial',
  'Battle Rifle': 'lootHelper.types.battleRifle',
  Blueprint: 'lootHelper.types.blueprint',
  'Hand Cannon': 'lootHelper.types.handCannon',
  Key: 'lootHelper.types.key',
  LMG: 'lootHelper.types.lmg',
  Misc: 'lootHelper.types.misc',
  Modification: 'lootHelper.types.modification',
  Nature: 'lootHelper.types.nature',
  Pistol: 'lootHelper.types.pistol',
  'Quick Use': 'lootHelper.types.quickUse',
  Recyclable: 'lootHelper.types.recyclable',
  'Refined Material': 'lootHelper.types.refinedMaterial',
  SMG: 'lootHelper.types.smg',
  Shield: 'lootHelper.types.shield',
  Shotgun: 'lootHelper.types.shotgun',
  'Sniper Rifle': 'lootHelper.types.sniperRifle',
  Special: 'lootHelper.types.special',
  'Topside Material': 'lootHelper.types.topsideMaterial',
  Trinket: 'lootHelper.types.trinket',
};

export function getItemDisplayName(item: Pick<Item, 'name'>): string {
  return item.name.en;
}

export const getLootHelperItemName = getItemDisplayName;

export function getLootHelperItemDescription(item: Pick<Item, 'description'>): string | null {
  return item.description ?? null;
}

export function getLocalizedLootHelperType(t: Translate, type: string): string {
  const key = typeKeys[type];
  return key ? t(key) : type;
}

export function getLocalizedLootHelperRarity(t: Translate, rarity: ItemRarity): string {
  return t(rarityKeys[rarity]);
}

export function getLocalizedLootHelperLocation(t: Translate, location: string): string {
  const key = locationKeys[location];
  return key ? t(key) : location;
}
