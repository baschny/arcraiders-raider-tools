/**
 * Item catalog: the v2 `items` + `recipes` domains merged into one per-item view with the
 * convenience fields the apps use (primary recipe, bench, blueprint lock, next tier, weapon flag).
 * Everything is derived from explicit v2 fields — never from slug shapes.
 */
import type { AppLocale } from '../i18n/config';
import { loadDomain, nameOf } from './loader';
import type { Amount, Item, LoadedDomain, Recipe, Research, Reward, TextEntry } from './types';

export const WEAPON_TYPES: ReadonlySet<string> = new Set([
  'Assault Rifle',
  'Battle Rifle',
  'Hand Cannon',
  'LMG',
  'Pistol',
  'SMG',
  'Shotgun',
  'Sniper Rifle',
  'Special',
]);

export interface CatalogItem {
  id: string;
  /** Localized name (English fallback). */
  name: string;
  nameEn: string;
  description: string;
  type: string;
  rarity: Item['rarity'];
  icon: string;
  value: number;
  weightKg?: number;
  stackSize: number;
  foundIn?: string[];
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
  /** Effect label (localized) → value. */
  effects?: Record<string, { label: string; value: unknown }>;
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
): CatalogItem {
  const crafted = primaryRecipe(item, recipes);
  const researched = crafted ? undefined : primaryResearch(item, research);
  const recipe: (Recipe | Research) | undefined = crafted ?? researched;
  const inRaid = (item.craftedBy ?? []).some((id) => recipes[id]?.station === 'in_raid');
  const nextTier = item.tier
    ? item.upgradesTo?.find((u) => !u.requires?.length && 'items' in u.cost)
    : undefined;
  const previousTier = item.tier && item.tier > 1 ? item.upgradesFrom?.[0] : undefined;
  const effectLabels = (text?.effects ?? {}) as Record<string, string>;
  const isWeapon = WEAPON_TYPES.has(item.type) && !!(item.baseId || item.amplifiedFrom);

  return {
    id: item.id,
    name: (typeof text?.name === 'string' && text.name) || item.nameEn,
    nameEn: item.nameEn,
    description: typeof text?.description === 'string' ? text.description : '',
    type: item.type,
    rarity: item.rarity,
    icon: item.icon,
    value: item.value,
    weightKg: item.weightKg,
    stackSize: item.stackSize,
    foundIn: item.foundIn,
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
    effects: item.effects
      ? Object.fromEntries(
          Object.entries(item.effects).map(([labelEn, value]) => [labelEn, { label: effectLabels[labelEn] || labelEn, value }]),
        )
      : undefined,
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
    pending = Promise.all([loadDomain('items', locale), loadDomain('recipes', locale), loadDomain('research', locale)]).then(
      ([items, recipes, research]: [LoadedDomain<'items'>, LoadedDomain<'recipes'>, LoadedDomain<'research'>]) => {
        const out: Record<string, CatalogItem> = {};
        for (const item of Object.values(items.structure.items)) {
          out[item.id] = buildCatalogItem(item, items.text[item.id], recipes.structure.recipes, research.structure.research);
        }
        inheritTierBench(out);
        return {
          items: out,
          recipes: recipes.structure.recipes,
          research: research.structure.research,
          arctrackerAliases: items.structure.arctrackerAliases ?? {},
          aliases: items.structure.aliases ?? {},
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
