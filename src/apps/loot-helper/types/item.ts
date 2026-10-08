export interface ItemName {
  en: string;
  [key: string]: string;
}

export type { Rarity as ItemRarity } from '../../../shared/gamedata/types';
import type { Rarity as ItemRarity } from '../../../shared/gamedata/types';
import type { CatalogEffect } from '../../../shared/gamedata/catalog';

export interface Item {
  id: string;
  name: ItemName;
  originalNameEn?: string;
  description?: string;
  /** Game classification ids (logic): category tag, stash group and subgroup. */
  category?: string;
  group?: string;
  subgroup?: string;
  /** Localized item card label (e.g. "Quick Use", "Research Item"). */
  categoryName?: string;
  /** Undefined = the game gives the item no rarity. */
  rarity?: ItemRarity;
  imageFilename?: string;
  value?: number;
  weightKg?: number;
  stackSize?: number;
  /** Theme ids and their localized names (same order). */
  foundIn?: string[];
  foundInNames?: string[];
  /** Item stats, formatted for display. */
  effects?: CatalogEffect[];
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
