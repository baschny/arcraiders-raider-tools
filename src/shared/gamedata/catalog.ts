/**
 * Item catalog: the v2 `items` + `recipes` domains merged into one per-item view with the
 * convenience fields the apps use (primary recipe, bench, blueprint lock, next tier, weapon flag).
 * Everything is derived from explicit v2 fields — never from slug shapes.
 */
import type { AppLocale } from '../i18n/config';
import { loadDomain, nameOf } from './loader';
import {
  RARITIES,
  type Amount,
  type ClassificationStructure,
  type Item,
  type ItemEffect,
  type LoadedDomain,
  type Rarity,
  type Recipe,
  type Research,
  type Reward,
  type TextEntry,
  type TextFile,
} from './types';

/** One rendered item stat. `value` is '' for stats that are only a label. */
export interface CatalogEffect {
  label: string;
  value: string;
  positive: boolean;
}

/**
 * Formats item stats for display. Game effects: localized `title` and `format` (`{0}` = value,
 * `+` prefix when `showSign` and value >= 0). A stat without title shows the formatted format as
 * label. Stats from the overlay (no format) show `valueText`.
 */
export function formatItemEffects(
  effects: ItemEffect[] | undefined,
  text: TextEntry | undefined,
  locale: string,
): CatalogEffect[] | undefined {
  if (!effects?.length) return undefined;
  const texts = (text?.effects ?? {}) as Record<string, { title?: string; format?: string } | undefined>;
  let numberFormat: Intl.NumberFormat;
  try {
    numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  } catch {
    numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
  }
  return effects.map((e, i) => {
    const { title, format } = texts[String(i)] ?? {};
    const positive = e.positive !== false;
    if (e.value == null) return { label: title ?? '', value: e.valueText ?? '', positive };
    const n = `${e.showSign && e.value >= 0 ? '+' : ''}${numberFormat.format(e.value)}`;
    const formatted = format ? format.replace('{0}', n) : n;
    return title ? { label: title, value: formatted, positive } : { label: formatted, value: '', positive };
  });
}

/** Classification texts of a locale resolved against the structure (names in game order). */
export interface CatalogClassification {
  /** Rarities in level order with game color and localized name. */
  rarities: { rarity: Rarity; level: number; color: string; name: string }[];
  /** Stash tabs in game order (without "All"); only groups and subgroups with shipped items. */
  groups: { id: string; name: string; subgroups: { id: string; name: string }[] }[];
  /** Category / theme id → parent id. */
  parents: Record<string, string | undefined>;
  categoryName(id: string | undefined): string | undefined;
  themeName(id: string | undefined): string | undefined;
  groupName(id: string | undefined): string | undefined;
  subgroupName(id: string | undefined): string | undefined;
}

type NameMap = Record<string, string>;

/** Classification without any data (tests, fallbacks). */
export function emptyClassification(): CatalogClassification {
  return buildClassification({ rarities: {} as ClassificationStructure['rarities'], groups: [], categories: {} }, {});
}

export function buildClassification(structure: ClassificationStructure, text: TextFile): CatalogClassification {
  const names = (field: string): NameMap => (text[field] ?? {}) as NameMap;
  const rarityNames = names('rarities');
  const groupNames = names('groups');
  const subgroupNames = names('subgroups');
  const categoryNames = names('categories');
  const themeNames = names('themes');
  return {
    rarities: RARITIES.filter((r) => structure.rarities[r]).map((r) => ({
      rarity: r,
      level: structure.rarities[r].level,
      color: structure.rarities[r].color,
      name: rarityNames[r] ?? r,
    })),
    groups: [...structure.groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        id: g.id,
        name: groupNames[g.id] ?? g.id,
        subgroups: (g.subgroups ?? []).map((id) => ({ id, name: subgroupNames[id] ?? categoryNames[id] ?? id })),
      })),
    parents: Object.fromEntries(Object.entries(structure.categories).map(([id, c]) => [id, c.parent])),
    categoryName: (id) => (id ? (categoryNames[id] ?? subgroupNames[id]) : undefined),
    themeName: (id) => (id ? (themeNames[id] ?? categoryNames[id]) : undefined),
    groupName: (id) => (id ? groupNames[id] : undefined),
    subgroupName: (id) => (id ? (subgroupNames[id] ?? categoryNames[id]) : undefined),
  };
}

export interface CatalogItem {
  id: string;
  /** Localized name (English fallback). */
  name: string;
  nameEn: string;
  description: string;
  /** Game classification ids (see the `classification` domain) and their localized names. */
  category?: string;
  group?: string;
  subgroup?: string;
  /** Localized item card label (e.g. "Quick Use", "Research Item"). */
  categoryName?: string;
  groupName?: string;
  subgroupName?: string;
  /** Undefined = the game gives the item no rarity. */
  rarity?: Rarity;
  icon: string;
  value: number;
  weightKg?: number;
  stackSize: number;
  /** Theme ids and their localized names (same order). */
  foundIn?: string[];
  foundInNames?: string[];
  addedIn?: string;
  questItem?: boolean;
  isWeapon: boolean;
  /** Weapon tier chain (explicit v2 baseId/tier). */
  baseId?: string;
  tier?: number;
  amplifiedFrom?: string;
  /**
   * Primary way to obtain the item by crafting: bench recipes before in-raid crafting (lowest bench
   * level first); items that are only researched (blueprints, research items) use their research.
   */
  recipeId?: string;
  researchId?: string;
  recipe?: Record<string, number>;
  craftQuantity: number;
  craftBench?: string;
  stationLevelRequired?: number;
  inRaidCraftable: boolean;
  blueprintLocked: boolean;
  blueprintId?: string;
  /** Next tier in the weapon chain (ungated upgrade) and its cost. */
  upgradesTo?: string;
  upgradeCost?: Record<string, number>;
  upgradesFrom?: string;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurability?: number;
  modSlots?: Record<string, string[]>;
  /** Item stats, formatted for display, in game order. */
  effects?: CatalogEffect[];
  /** The full v2 item. */
  item: Item;
}

export interface ItemCatalog {
  items: Record<string, CatalogItem>;
  recipes: Record<string, Recipe>;
  research: Record<string, Research>;
  /** arctracker item id → our slug where they differ. */
  arctrackerAliases: Record<string, string>;
  /** Old slug → current slug (renames). */
  aliases: Record<string, string>;
  /** Groups (stash tabs in game order), rarities and category names for filters and labels. */
  classification: CatalogClassification;
}

const toRecord = (list: (Amount | Reward)[] | undefined): Record<string, number> | undefined => {
  if (!list?.length) return undefined;
  const out: Record<string, number> = {};
  for (const a of list) out[a.itemId] = (out[a.itemId] ?? 0) + a.quantity;
  return out;
};

function primaryRecipe(item: Item, recipes: Record<string, Recipe>): Recipe | undefined {
  const candidates = (item.craftedBy ?? []).map((id) => recipes[id]).filter((r): r is Recipe => !!r);
  return candidates.sort((a, b) => {
    if (a.station !== b.station) return a.station === 'bench' ? -1 : 1;
    // the specialized bench is the item's "home"; the basic Workbench is the alternative
    const aw = a.benchId === 'workbench' ? 1 : 0;
    const bw = b.benchId === 'workbench' ? 1 : 0;
    if (aw !== bw) return aw - bw;
    return (a.benchLevel ?? 0) - (b.benchLevel ?? 0) || a.id.localeCompare(b.id);
  })[0];
}

function primaryResearch(item: Item, research: Record<string, Research>): Research | undefined {
  return (item.researchedBy ?? [])
    .map((id) => research[id])
    .filter((r): r is Research => !!r)
    .sort((a, b) => a.benchLevel - b.benchLevel || a.id.localeCompare(b.id))[0];
}

export function buildCatalogItem(
  item: Item,
  text: TextEntry | undefined,
  recipes: Record<string, Recipe>,
  research: Record<string, Research> = {},
  classification?: CatalogClassification,
  locale = 'en',
): CatalogItem {
  const crafted = primaryRecipe(item, recipes);
  const researched = crafted ? undefined : primaryResearch(item, research);
  const recipe: (Recipe | Research) | undefined = crafted ?? researched;
  const inRaid = (item.craftedBy ?? []).some((id) => recipes[id]?.station === 'in_raid');
  const nextTier = item.tier
    ? item.upgradesTo?.find((u) => !u.requires?.length && 'items' in u.cost)
    : undefined;
  const previousTier = item.tier && item.tier > 1 ? item.upgradesFrom?.[0] : undefined;
  const isWeapon = !!item.category?.startsWith('Firearm.');

  return {
    id: item.id,
    name: (typeof text?.name === 'string' && text.name) || item.nameEn,
    nameEn: item.nameEn,
    description: typeof text?.description === 'string' ? text.description : '',
    category: item.category,
    group: item.group,
    subgroup: item.subgroup,
    categoryName: classification?.categoryName(item.category),
    groupName: classification?.groupName(item.group),
    subgroupName: classification?.subgroupName(item.subgroup),
    rarity: item.rarity,
    icon: item.icon,
    value: item.value,
    weightKg: item.weightKg,
    stackSize: item.stackSize,
    foundIn: item.foundIn,
    foundInNames: item.foundIn?.map((id) => classification?.themeName(id) ?? id),
    addedIn: item.addedIn,
    questItem: item.questItem,
    isWeapon,
    baseId: item.baseId,
    tier: item.tier,
    amplifiedFrom: item.amplifiedFrom,
    recipeId: crafted?.id,
    researchId: researched?.id,
    recipe: recipe && 'items' in recipe.cost ? toRecord(recipe.cost.items) : undefined,
    craftQuantity: recipe?.rewards?.find((r) => r.itemId === item.id)?.quantity ?? 1,
    craftBench: researched ? researched.benchId : crafted?.station === 'bench' ? crafted.benchId : crafted ? 'in_raid' : undefined,
    stationLevelRequired: recipe?.benchLevel,
    inRaidCraftable: inRaid,
    blueprintLocked: !!(recipe?.requires?.some((r) => r.kind === 'unlock') || item.blueprintId),
    blueprintId: item.blueprintId,
    upgradesTo: nextTier?.itemId,
    upgradeCost: nextTier && 'items' in nextTier.cost ? toRecord(nextTier.cost.items) : undefined,
    upgradesFrom: previousTier,
    recyclesInto: toRecord(item.recyclesInto),
    salvagesInto: toRecord(item.salvagesInto),
    repairCost: toRecord(item.repairCost),
    repairDurability: item.repairDurability,
    modSlots: item.modSlots,
    effects: formatItemEffects(item.effects, text, locale),
    item,
  };
}

/** Upgrade-only tiers (no own recipe) are made at their chain base's bench. Mutates `items`. */
export function inheritTierBench(items: Record<string, CatalogItem>): void {
  for (const it of Object.values(items)) {
    if (it.craftBench || !it.baseId || it.baseId === it.id) continue;
    const base = items[it.baseId];
    if (base?.craftBench && base.craftBench !== 'in_raid') it.craftBench = base.craftBench;
  }
}

const catalogs = new Map<string, Promise<ItemCatalog>>();

/** Loads items + recipes for a locale (cached per locale; structures are shared). */
export function loadItemCatalog(locale: AppLocale | string): Promise<ItemCatalog> {
  let pending = catalogs.get(locale);
  if (!pending) {
    pending = Promise.all([
      loadDomain('items', locale),
      loadDomain('recipes', locale),
      loadDomain('research', locale),
      loadDomain('classification', locale),
    ]).then(
      ([items, recipes, research, classified]: [
        LoadedDomain<'items'>,
        LoadedDomain<'recipes'>,
        LoadedDomain<'research'>,
        LoadedDomain<'classification'>,
      ]) => {
        const classification = buildClassification(classified.structure, classified.text);
        const out: Record<string, CatalogItem> = {};
        for (const item of Object.values(items.structure.items)) {
          out[item.id] = buildCatalogItem(
            item,
            items.text[item.id],
            recipes.structure.recipes,
            research.structure.research,
            classification,
            String(locale),
          );
        }
        inheritTierBench(out);
        return {
          items: out,
          recipes: recipes.structure.recipes,
          research: research.structure.research,
          arctrackerAliases: items.structure.arctrackerAliases ?? {},
          aliases: items.structure.aliases ?? {},
          classification,
        };
      },
    );
    pending.catch(() => catalogs.delete(locale));
    catalogs.set(locale, pending);
  }
  return pending;
}

/** Localized name of any item slug in a loaded items domain. */
export function itemName(items: LoadedDomain<'items'>, slug: string): string {
  return nameOf(items, slug, items.structure.items[slug]?.nameEn);
}

/** Test helper. */
export function resetItemCatalog(): void {
  catalogs.clear();
}
