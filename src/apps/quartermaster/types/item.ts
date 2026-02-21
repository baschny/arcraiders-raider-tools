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

export type ItemRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface PlannerItem {
  id: string;
  name: string;
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
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;

  stackSize: number;
  value?: number;
  weight?: number;
  foundIn?: string[];
}

export interface ItemsMap {
  [itemId: string]: PlannerItem;
}

export interface ItemsData {
  version: number;
  items: Record<string, Omit<PlannerItem, 'id'>>;
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

