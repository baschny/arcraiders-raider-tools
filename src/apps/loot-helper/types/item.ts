export interface ItemName {
  en: string;
  [key: string]: string;
}

export interface ItemEffect {
  en: string;
  value: string | number;
  [key: string]: string | number;
}

export type { Rarity as ItemRarity } from '../../../shared/gamedata/types';
import type { Rarity as ItemRarity } from '../../../shared/gamedata/types';

export interface Item {
  id: string;
  name: ItemName;
  originalNameEn?: string;
  description?: string;
  /** Localized game category name (display and filter key). */
  type: string;
  /** Game category / stash group ids (logic). */
  category?: string;
  group?: string;
  /** The game gives some items no rarity; the app shows those as Common for now. */
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
  weaponBaseId?: string;
  weaponTier?: 1 | 2 | 3 | 4;
  craftBench?: string;
  stationLevelRequired?: number;
  blueprintLocked?: boolean;
  updatedAt?: string;
  isWeapon?: boolean;
}

export interface ItemsMap {
  [itemId: string]: Item;
}
