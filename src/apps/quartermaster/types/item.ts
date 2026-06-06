/**
 * Quartermaster Item Types
 * See specification section 2.1.2 for schema definition
 */

export type BenchId =
  | 'equipment_bench'
  | 'explosives_bench'
  | 'med_station'
  | 'refiner'
  | 'utility_bench'
  | 'weapon_bench'
  | 'workbench';

import type { ItemRarity } from '../../../shared/types/item';
export type { ItemRarity };

export interface PlannerItem {
  id: string;
  name: string;
  originalNameEn?: string;
  description: string;
  icon: string;
  rarity: ItemRarity;

  type: string;

  category: string;
  subCategory?: string;

  craftBench?: BenchId;
  stationLevelRequired: 1 | 2 | 3;
  blueprintLocked: boolean;

  craftQuantity: number;

  recipe?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  upgradesTo?: string;
  upgradesFrom?: string;
  weaponBaseId?: string;
  weaponTier?: 1 | 2 | 3 | 4;
  modSlots?: Record<string, string[]>;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurability?: number;

  stackSize: number;
  value?: number;
  weight?: number;
  foundIn?: string[];
  questItem?: boolean;
}

export interface ItemsMap {
  [itemId: string]: PlannerItem;
}

export interface ItemsData {
  version: number;
  items: Record<string, Omit<PlannerItem, 'id'>>;
}

export interface LocalizedPlannerItemData extends Omit<PlannerItem, 'id' | 'name'> {
  name: {
    value: string;
    originalEn: string;
  };
  repairCost?: Record<string, number>;
  repairDurability?: number;
  questItem?: boolean;
}

export interface LocalizedItemsData {
  version: number;
  items: Record<string, LocalizedPlannerItemData>;
}

/**
 * Canonical bench order for craft plan grouping (section 6.9)
 */
export const BENCH_ORDER: BenchId[] = [
  'refiner',
  'equipment_bench',
  'explosives_bench',
  'med_station',
  'utility_bench',
  'weapon_bench',
  'workbench',
];

/**
 * Categories that cannot be recycled (section 5.1)
 */
export const NON_RECYCLABLE_CATEGORIES = new Set([
  'Weapon',
  'Ammunition',
  'Augment',
  'Modification',
  'Quick Use',
  'Shield',
]);
