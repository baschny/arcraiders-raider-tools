/**
 * Filter and sort helpers on the game item classification. Apps build their type / group filters
 * from `catalog.classification.groups` (stash tabs in game order) and keep ids in logic and
 * persisted state; names are only looked up for display.
 */
import { RARITIES, type Rarity } from './types';
import type { CatalogClassification } from './catalog';

interface Classified {
  category?: string;
  group?: string;
  subgroup?: string;
}

/** True for firearm categories (`Firearm.*`); the game puts Amplified weapon rows in no stash group. */
export function isWeaponCategory(category: string | undefined): boolean {
  return !!category?.startsWith('Firearm.');
}

/** Stash group of an item for filtering; weapons outside the stash count as `Weapons`. */
export function itemFilterGroup(item: Classified): string | undefined {
  return item.group ?? (isWeaponCategory(item.category) ? 'Weapons' : undefined);
}

/** Stash subgroup of an item for filtering (weapon class for weapons). */
export function itemFilterSubgroup(item: Classified): string | undefined {
  return item.subgroup ?? (isWeaponCategory(item.category) ? item.category : undefined);
}

export interface GroupFilterOption {
  id: string;
  name: string;
  subgroups: { id: string; name: string }[];
}

/**
 * Filter options from the classification: stash groups in game order, subgroups in game order,
 * restricted to the groups / subgroups that at least one of `items` belongs to.
 */
export function buildGroupFilters(
  classification: Pick<CatalogClassification, 'groups'>,
  items: Iterable<Classified>,
): GroupFilterOption[] {
  const usedGroups = new Set<string>();
  const usedSubgroups = new Set<string>();
  for (const item of items) {
    const group = itemFilterGroup(item);
    if (group) usedGroups.add(group);
    const subgroup = itemFilterSubgroup(item);
    if (subgroup) usedSubgroups.add(subgroup);
  }
  return classification.groups
    .filter((g) => usedGroups.has(g.id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      subgroups: g.subgroups.filter((s) => usedSubgroups.has(s.id)),
    }));
}

/** Rarity level 1..6; 0 = the game gives the item no rarity (lowest). */
export function rarityLevel(rarity: Rarity | undefined): number {
  return rarity ? RARITIES.indexOf(rarity) + 1 : 0;
}

/** Ascending by level: items without rarity first, then Common … Amplified. */
export function compareRarityAsc(a: Rarity | undefined, b: Rarity | undefined): number {
  return rarityLevel(a) - rarityLevel(b);
}

/** Descending by level, items without rarity last (after Common). */
export function compareRarityDesc(a: Rarity | undefined, b: Rarity | undefined): number {
  return rarityLevel(b) - rarityLevel(a);
}

const THEME_ICON_FILES: Record<string, string> = {
  ARC: 'arc',
  Commercial: 'commercial',
  Electrical: 'electrical',
  Exodus: 'exodus',
  Industrial: 'industrial',
  Mechanical: 'mechanical',
  Medical: 'medical',
  Nature: 'nature',
  OldWorld: 'old_world',
  Raider: 'raider',
  Residential: 'residential',
  Security: 'security',
  Technological: 'technological',
};

/** Icon URL of a game theme id ("found in" location), if the site has one. */
export function getThemeIcon(themeId: string): string | undefined {
  const file = THEME_ICON_FILES[themeId];
  return file ? `/images/locations/${file}.webp` : undefined;
}

/**
 * Single-select filter value over groups and subgroups: `all`, `g:<groupId>` or `s:<subgroupId>`
 * (the prefix keeps a subgroup id like `Misc` apart from the group of the same id).
 */
export const groupFilterValue = (id: string) => `g:${id}`;
export const subgroupFilterValue = (id: string) => `s:${id}`;

export function matchesGroupFilter(filter: string, item: Classified): boolean {
  if (filter === 'all') return true;
  if (filter.startsWith('g:')) return itemFilterGroup(item) === filter.slice(2);
  if (filter.startsWith('s:')) return itemFilterSubgroup(item) === filter.slice(2);
  return false;
}
