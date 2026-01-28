export interface ItemName {
  en: string;
  [key: string]: string;
}

export interface ItemEffect {
  en: string;
  value: string | number;
  [key: string]: string | number;
}

export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface Item {
  id: string;
  name: ItemName;
  description?: ItemName;
  type: string;
  rarity: ItemRarity;
  imageFilename?: string;
  value?: number;
  weightKg?: number;
  stackSize?: number;
  foundIn?: string[];
  effects?: Record<string, ItemEffect>;
  recipe?: Record<string, number>;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  tier?: number;
  craftBench?: string;
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  updatedAt?: string;
  isWeapon?: boolean;
}

export interface ItemsMap {
  [itemId: string]: Item;
}
