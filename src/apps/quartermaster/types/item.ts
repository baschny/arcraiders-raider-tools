/**
 * Quartermaster Item Types
 * See specification section 2.1.2 for schema definition
 */

/** Bench slug; the valid set comes from the `benches` game-data domain (see dataLoader). */
export type BenchId = string;

import type { ItemRarity } from '../../../shared/types/item';
import type { CatalogEffect } from '../../../shared/gamedata/catalog';
import { isWeaponCategory } from '../../../shared/gamedata/classificationFilters';
export type { ItemRarity };

export interface PlannerItem {
  id: string;
  name: string;
  originalNameEn?: string;
  description: string;
  icon: string;
  /** Undefined = the game gives the item no rarity. */
  rarity?: ItemRarity;

  /**
   * Game classification: item category tag (`Utility.Grenade`, `Firearm.Pistol`), stash group
   * (`Utilities`, `Weapons`) and subgroup, with their localized names. Logic and persisted filters
   * use the ids, the UI shows the names (`categoryName` is the item card label, e.g. "Quick Use").
   */
  category?: string;
  group?: string;
  subgroup?: string;
  categoryName?: string;
  groupName?: string;
  subgroupName?: string;

  craftBench?: BenchId;
  stationLevelRequired: number;
  blueprintLocked: boolean;

  craftQuantity: number;

  recipe?: Record<string, number>;
  upgradeCost?: Record<string, number>;
  upgradesTo?: string;
  upgradesFrom?: string;
  /** v2 `baseId` of the weapon chain (kept under the old name; semantics unchanged). */
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
  /** Theme ids and their localized names (same order). */
  foundIn?: string[];
  foundInNames?: string[];
  /** Item stats, formatted for display, in game order. */
  effects?: CatalogEffect[];
  questItem?: boolean;
}

export interface ItemsMap {
  [itemId: string]: PlannerItem;
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
  'research_station',
];

/** True for firearms (game category `Firearm.*`). */
export function isWeaponItem(item: Pick<PlannerItem, 'category'>): boolean {
  return isWeaponCategory(item.category);
}

/** True for weapon mods (stash group `Modifications`, categories `Modification.*`). */
export function isModItem(item: Pick<PlannerItem, 'group'>): boolean {
  return item.group === 'Modifications';
}

/**
 * Stash groups that cannot be recycled (section 5.1): ammunition, augments, shields (`Armor`),
 * weapon mods and quick use items (`Utilities`). Weapons are excluded via {@link isWeaponItem}.
 */
export const NON_RECYCLABLE_GROUPS = new Set([
  'Ammunition',
  'Augment',
  'Modifications',
  'Utilities',
  'Armor',
]);

/** True when the item can never be recycled or salvaged (weapons and the groups above). */
export function isNonRecyclable(item: Pick<PlannerItem, 'category' | 'group'>): boolean {
  return isWeaponItem(item) || (!!item.group && NON_RECYCLABLE_GROUPS.has(item.group));
}
