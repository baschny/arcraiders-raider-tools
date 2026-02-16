/**
 * Quartermaster Loadout Types
 * See specification section 7.1.3 for stored loadout schema
 */

export interface LoadoutItem {
  itemId: string;
  quantity: number;
  isEnabled: boolean;
}

export interface StoredLoadout {
  schemaVersion: number;
  id: string;
  name: string;
  isEnabled: boolean;
  items: LoadoutItem[];
}

/**
 * Current schema version for stored loadouts
 */
export const LOADOUT_SCHEMA_VERSION = 1;

/**
 * Category grouping order for loadout editor (section 7.4.2)
 */
export const LOADOUT_CATEGORY_ORDER = [
  'Augment',
  'Shield',
  'Weapon',
  'Modification',
  'Ammunition',
  'Quick Use',
] as const;

export type LoadoutCategory = typeof LOADOUT_CATEGORY_ORDER[number];
