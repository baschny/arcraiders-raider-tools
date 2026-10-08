/**
 * Short site ids for game tags (docs/Game-Data.md "Classification"): the prefixes are stripped so
 * `UI.ItemClassification.Category.Utility.Grenade` becomes `Utility.Grenade`, themes
 * `UI.ItemClassification.Theme.OldWorld` become `OldWorld` and stash groups
 * `UI.Inventory.CategoryFilter.Furniture.Seating` become `Furniture.Seating`.
 */
const CATEGORY_PREFIX = 'UI.ItemClassification.Category.';
const THEME_PREFIX = 'UI.ItemClassification.Theme.';
const BARE_PREFIX = 'UI.ItemClassification.';
const GROUP_PREFIX = 'UI.Inventory.CategoryFilter.';

function strip(tag: string, prefixes: string[]): string {
  for (const p of prefixes) if (tag.startsWith(p)) return tag.slice(p.length);
  return tag;
}

/** Item category (or stash subgroup) tag → short id; bare `UI.ItemClassification.Special…` → `Special…`. */
export const shortCategory = (tag: string): string => strip(tag, [CATEGORY_PREFIX, BARE_PREFIX]);
export const shortTheme = (tag: string): string => strip(tag, [THEME_PREFIX, BARE_PREFIX]);
export const shortGroup = (tag: string): string => strip(tag, [GROUP_PREFIX]);

/** Short id of an `itemCategory` record id, whether it is a category or a theme. */
export const shortClassification = (tag: string): string => (tag.startsWith(THEME_PREFIX) ? shortTheme(tag) : shortCategory(tag));
