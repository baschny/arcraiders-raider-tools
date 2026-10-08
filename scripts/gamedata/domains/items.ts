import type { Item, Rarity } from '../../../src/shared/gamedata/types';
import type { CanonItem, Localization } from '../arcData';
import type { GenContext } from '../context';
import { itemIconUrl } from '../icons';
import { offersOfClass } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Canonical item types that ship to the site. Everything referenced by site domains must be in
 * here (benches/Generators are modelled in `benches`, not as items). Items without an English name
 * never ship (no slug).
 */
export const SHIPPED_ITEM_TYPES = new Set([
  'GameItem',
  'OutpostFurniture',
  'OutpostRoom',
  'OutpostSlot',
  'ItemSkin',
  'ItemSkinSlot',
]);

/**
 * Site item properties the API does not carry (S02 decision, docs/Game-Data.md): standalone
 * overlay data file arc-data/overlay/item-properties.json, seeded from the last arcraiders-data
 * snapshot. Replaced by game-file item data later.
 */
interface ItemProperties {
  type?: string;
  rarity?: Rarity;
  weightKg?: number;
  questItem?: boolean;
  foundIn?: string[];
  modSlots?: Record<string, string[]>;
  effects?: Record<string, { value: unknown; label: Localization }>;
}

/** Site type for items without seeded properties (new content). */
function fallbackType(item: CanonItem, currencyIds: Set<number>): string {
  if (currencyIds.has(item.id)) return 'Currency';
  switch (item.type) {
    case 'OutpostFurniture':
      return 'Furniture';
    case 'OutpostRoom':
      return 'Outpost Room';
    case 'OutpostSlot':
      return 'Outpost Slot';
    case 'ItemSkin':
      return 'Stencil';
    case 'ItemSkinSlot':
      return 'Stencil Slot';
    case 'Modification':
      return 'Modification';
  }
  const name = item.name?.en ?? '';
  if (/ Blueprint$/.test(name)) return 'Blueprint';
  if (/^Furniture Design: /.test(name) || /Design$/.test(name)) return 'Design';
  if (item.slots?.discriminator === 'arraySlot' || item.slots?.discriminator === 'singleSlot') return 'Weapon';
  return 'Misc';
}

/** Decides shipping and registers ctx.shippedItems (asset id → slug). Runs before every other domain. */
export function registerShippedItems(ctx: GenContext): CanonItem[] {
  const currencyIds = new Set(Object.values(ctx.arc.constants.currencies));
  const shipped: CanonItem[] = [];
  for (const item of [...ctx.arc.items.values()].sort((a, b) => a.id - b.id)) {
    if (!SHIPPED_ITEM_TYPES.has(item.type ?? '') && !currencyIds.has(item.id)) continue;
    if (!item.name?.en) {
      ctx.report.add('itemsWithoutName', `${item.id} ${item.type}${item.internalName ? ` ${item.internalName}` : ''}`);
      continue;
    }
    const slug = ctx.slugFor('items', item.id, item);
    if (!slug) continue;
    ctx.shippedItems.set(item.id, slug);
    shipped.push(item);
  }
  return shipped;
}

/**
 * Weapon chains: the tier chain follows ungated upgrades from the chain base (baseId); an upgrade
 * with `requires` (e.g. Gunsmith 4, research flags) leads into amplified variants, and everything
 * reachable from there is amplified. Returns per item: base slug, tier, amplifiedFrom.
 */
export interface ChainInfo {
  baseId?: string;
  tier?: number;
  amplifiedFrom?: string;
}

export function computeChains(ctx: GenContext, shipped: CanonItem[]): Map<number, ChainInfo> {
  const info = new Map<number, ChainInfo>();
  const byId = new Map(shipped.map((i) => [i.id, i]));
  const bases = new Set(shipped.filter((i) => i.baseId && byId.has(i.baseId)).map((i) => i.baseId));
  for (const baseAsset of bases) {
    const baseSlug = ctx.shippedItems.get(baseAsset)!;
    let tier = 1;
    let cur: CanonItem | undefined = byId.get(baseAsset);
    const seen = new Set<number>();
    const tierItems: CanonItem[] = [];
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      tierItems.push(cur);
      info.set(cur.id, { baseId: baseSlug, tier: tier++ });
      const next = cur.upgrades.find((u) => !u.requires.length && byId.get(u.next)?.baseId === baseAsset);
      cur = next ? byId.get(next.next) : undefined;
    }
    // amplified: targets of gated upgrades from tier items, then everything reachable from them
    const queue: { id: number; from: string }[] = [];
    for (const t of tierItems) {
      for (const u of t.upgrades) {
        if (u.requires.length && byId.has(u.next) && !seen.has(u.next)) queue.push({ id: u.next, from: ctx.shippedItems.get(t.id)! });
      }
    }
    while (queue.length) {
      const { id, from } = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      info.set(id, { amplifiedFrom: from });
      for (const u of byId.get(id)!.upgrades) if (byId.has(u.next) && !seen.has(u.next)) queue.push({ id: u.next, from });
    }
  }
  return info;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * 2.0 game text names every tier of a weapon chain alike ("Anvil"); the site shows tiers as
 * "Anvil I" … "Anvil IV" (as before). Appends the numeral unless the name already ends with one.
 */
export function withTier<T extends Localization | null | undefined>(name: T, tier: number | undefined, chainLength: number): T {
  if (!name || !tier || chainLength < 2) return name;
  const numeral = ROMAN[tier - 1];
  const out = { ...name } as Localization;
  for (const [k, v] of Object.entries(out)) {
    if (k === 'key' || typeof v !== 'string' || !v) continue;
    if (!/\s(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(v)) (out as Record<string, string | null>)[k] = `${v} ${numeral}`;
  }
  return out as T;
}

const module: DomainModule = {
  domain: 'items',
  build(ctx) {
    const shipped = registerShippedItems(ctx);
    const currencyIds = new Set(Object.values(ctx.arc.constants.currencies));
    const props = ctx.arc.json<{ items: Record<string, ItemProperties> }>('overlay/item-properties.json')?.items ?? {};
    const chains = computeChains(ctx, shipped);
    const chainLength = new Map<string, number>();
    for (const c of chains.values()) if (c.baseId && c.tier) chainLength.set(c.baseId, Math.max(chainLength.get(c.baseId) ?? 0, c.tier));

    // salvage (FieldCrafting owner 511): cost = the salvaged item, rewards = what it yields
    const salvage = new Map<number, ReturnType<GenContext['rewards']>>();
    for (const offer of offersOfClass(ctx, 'items:salvage')) {
      const src = offer.cost.type === 'itemAmounts' ? (offer.cost as { items: { id: number }[] }).items[0]?.id : undefined;
      if (src != null && !salvage.has(src)) salvage.set(src, ctx.rewards(offer.rewards, `salvage ${offer.id}`));
    }

    const items: Record<string, Item> = {};
    const arctrackerAliases: Record<string, string> = {};
    let defaulted = 0;
    for (const item of shipped) {
      const slug = ctx.shippedItems.get(item.id)!;
      const p = props[String(item.id)];
      if (!p) defaulted++;
      const chain = chains.get(item.id) ?? {};
      const name = withTier(item.name, chain.tier, chain.baseId ? (chainLength.get(chain.baseId) ?? 0) : 0)!;
      const arctrackerId = ctx.slugs.get('items', item.id)?.arctrackerId ?? null;
      if (arctrackerId && arctrackerId !== slug) arctrackerAliases[arctrackerId] = slug;

      const upgradesTo = item.upgrades
        .filter((u) => ctx.shippedItems.has(u.next))
        .map((u) => {
          const requires = ctx.requirements(u.requires, `upgrade ${slug}`);
          return { itemId: ctx.shippedItems.get(u.next)!, cost: ctx.cost(u.cost, `upgrade ${slug}`), ...(requires.length ? { requires } : {}) };
        });

      const effects: Record<string, unknown> = {};
      for (const [labelEn, e] of Object.entries(p?.effects ?? {})) {
        effects[labelEn] = e.value;
        ctx.text.add('items', slug, ['effects', labelEn], e.label);
      }

      items[slug] = {
        id: slug,
        nameEn: name.en,
        type: p?.type ?? fallbackType(item, currencyIds),
        rarity: p?.rarity ?? 'Common',
        icon: itemIconUrl(slug, { arctrackerId }),
        value: item.value,
        stackSize: item.maxStack || 1,
        ...(p?.weightKg != null ? { weightKg: p.weightKg } : {}),
        ...(item.addedIn ? { addedIn: item.addedIn } : {}),
        ...chain,
        upgradesTo,
        recyclesInto: ctx.rewards(item.recycle, `recycle ${slug}`),
        salvagesInto: salvage.get(item.id),
        repairCost: ctx.amounts(item.repair.cost, `repair ${slug}`),
        ...(item.repair.durability ? { repairDurability: item.repair.durability } : {}),
        ...(p?.modSlots ? { modSlots: p.modSlots } : {}),
        ...(Object.keys(effects).length ? { effects } : {}),
        ...(p?.foundIn?.length ? { foundIn: p.foundIn } : {}),
        ...(p?.questItem ? { questItem: true } : {}),
      };
      ctx.text.add('items', slug, 'name', name);
      ctx.text.add('items', slug, 'description', item.description);
    }
    if (defaulted) ctx.report.add('itemsWithDefaultProperties', `${defaulted} items without seeded properties (type from fallback, rarity Common)`);

    // upgradesFrom (reverse of upgradesTo)
    for (const it of Object.values(items)) {
      for (const u of it.upgradesTo ?? []) {
        const target = items[u.itemId];
        if (target) target.upgradesFrom = [...new Set([...(target.upgradesFrom ?? []), it.id])].sort();
      }
    }
    return { items, arctrackerAliases };
  },
};

export default module;
