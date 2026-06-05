export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface RawItemName {
  value: string;
  originalEn: string;
}

export interface RawItem {
  name: RawItemName;
  description: string;
  type: string;
  rarity: string;
  value?: number;
  weightKg?: number;
  stackSize: number;
  isWeapon?: boolean;
  imageFilename?: string;
  foundIn?: string[] | string;
  craftBench?: string | string[];
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  craftQuantity: number;
  recipe?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  upgradesTo?: string;
  upgradesFrom?: string;
  weaponBaseId?: string;
  weaponTier?: 1 | 2 | 3 | 4;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurability?: number;
  questItem?: boolean;
  effects?: Record<string, unknown>;
  modSlots?: Record<string, string[]>;
  craftSkills?: Record<string, string[]>;
  vendors?: unknown[];
  updatedAt?: string;
  addedIn?: string;
  [key: string]: unknown;
}

export interface RawItemsOutput {
  version: number;
  items: Record<string, RawItem>;
}
