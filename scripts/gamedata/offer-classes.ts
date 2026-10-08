/**
 * Offer classification: ONE ordered rule table that assigns every canonical offer to a site
 * domain (spec-site.md#offer-classification). First matching rule wins. Owner ids come from
 * arc-data constants (never literals); "owner is a bench level" goes through ctx.benchLevel().
 *
 * Offers that match no rule are reported under `unclassifiedOffers` (fails --strict) and are
 * not shipped. Classifying a new mechanic means adding one row here.
 *
 * Other domain modules (benches, outpost, stencils, projects) get their offers via
 * offersOfClass(ctx, '<class>').
 */
import type { GameDomain, Offer } from '../../src/shared/gamedata/types';
import type { CanonOffer } from './arcData';
import type { GenContext } from './context';

/** Slug of the Research Station bench (frozen in arc-data/slugs/benches.json). */
export const RESEARCH_STATION_BENCH = 'research_station';

export type OfferClass =
  | 'research' // rule 1
  | 'recipes:bench' // rule 2
  | 'recipes:in_raid' // rule 3
  | 'items:salvage' // rule 4
  | 'blueprints' // rule 5
  | 'benches:build' // rule 6
  | 'outpost:furniture' // rule 7
  | 'outpost:room' // rule 7b
  | 'outpost:design' // rule 8
  | 'stencils:learn' // rule 9 (Chamber)
  | 'stencils:craft' // rule 9b (Crafting owned by the stencil owner)
  | 'trades' // rule 10
  | 'benches:scrappy' // rule 11
  | 'projects:event' // rule 12
  | 'excluded:promo'; // rule 10b: NPC-typed offers whose owner is not an NPC (promo/store/migration)

export interface Classification {
  cls: OfferClass;
  /** Site domain that ships the offer; 'none' for known-but-not-shipped offers. */
  domain: GameDomain | 'none';
}

interface Rule {
  cls: OfferClass;
  domain: GameDomain | 'none';
  match(ctx: GenContext, offer: CanonOffer): boolean;
}

function benchSlugOf(ctx: GenContext, owner: number): string | null {
  return ctx.benchLevel(owner)?.benchId ?? null;
}

function rewardsGenerator(ctx: GenContext, offer: CanonOffer): boolean {
  return offer.rewards.items.some((r) => ctx.benchLevel(r.id) != null);
}

function rewardsType(ctx: GenContext, offer: CanonOffer, type: string): boolean {
  return offer.rewards.items.some((r) => ctx.arc.items.get(r.id)?.type === type);
}

/** The rule table. Order matters. */
const RULES: Rule[] = [
  // 1
  {
    cls: 'research',
    domain: 'research',
    match: (ctx, o) => o.type === 'Crafting' && benchSlugOf(ctx, o.owner) === RESEARCH_STATION_BENCH,
  },
  // 2
  { cls: 'recipes:bench', domain: 'recipes', match: (ctx, o) => o.type === 'Crafting' && ctx.benchLevel(o.owner) != null },
  // 3
  {
    cls: 'recipes:in_raid',
    domain: 'recipes',
    match: (ctx, o) => o.type === 'FieldCrafting' && o.owner === ctx.arc.constants.owners.inRaidCrafting,
  },
  // 4
  {
    cls: 'items:salvage',
    domain: 'items',
    match: (ctx, o) => o.type === 'FieldCrafting' && o.owner === ctx.arc.constants.owners.salvage,
  },
  // 5
  {
    cls: 'blueprints',
    domain: 'blueprints',
    match: (ctx, o) => o.type === 'Chamber' && o.owner === ctx.arc.constants.owners.blueprintLearning,
  },
  // 6
  {
    cls: 'benches:build',
    domain: 'benches',
    match: (ctx, o) => o.type === 'Chamber' && o.owner === ctx.arc.constants.owners.workbenchGenerator && rewardsGenerator(ctx, o),
  },
  // 7
  {
    cls: 'outpost:furniture',
    domain: 'outpost',
    match: (ctx, o) =>
      o.type === 'Chamber' && o.owner === ctx.arc.constants.owners.workbenchGenerator && rewardsType(ctx, o, 'OutpostFurniture'),
  },
  // 7b: Outpost room construction (Chamber, generator owner, reward OutpostRoom)
  {
    cls: 'outpost:room',
    domain: 'outpost',
    match: (ctx, o) =>
      o.type === 'Chamber' && o.owner === ctx.arc.constants.owners.workbenchGenerator && rewardsType(ctx, o, 'OutpostRoom'),
  },
  // 8
  {
    cls: 'outpost:design',
    domain: 'outpost',
    match: (ctx, o) => o.type === 'Chamber' && o.owner === ctx.arc.constants.owners.furnitureDesigns,
  },
  // 9
  {
    cls: 'stencils:learn',
    domain: 'stencils',
    match: (ctx, o) => o.type === 'Chamber' && o.owner === ctx.arc.constants.owners.stencils,
  },
  // 9b: stencil (skin) crafting is a Crafting offer owned by the stencil owner (not a bench level)
  {
    cls: 'stencils:craft',
    domain: 'stencils',
    match: (ctx, o) => o.type === 'Crafting' && o.owner === ctx.arc.constants.owners.stencils,
  },
  // 10: trades of real NPCs
  {
    cls: 'trades',
    domain: 'trades',
    match: (ctx, o) => o.type === 'NPC' && ctx.arc.items.get(o.owner)?.type === 'NPC',
  },
  // 10b: NPC-typed offers owned by something that is not an NPC (promo packs, expedition reward
  // claims, outpost migration): known, not shipped.
  { cls: 'excluded:promo', domain: 'none', match: (_ctx, o) => o.type === 'NPC' },
  // 11
  { cls: 'benches:scrappy', domain: 'benches', match: (_ctx, o) => o.type === 'RoundCrafting' },
  // 12
  { cls: 'projects:event', domain: 'projects', match: (_ctx, o) => o.type === 'CommunityEvent' },
];

/** Classifies one offer without reporting. null = unclassified. */
export function classifyOfferQuiet(ctx: GenContext, offer: CanonOffer): Classification | null {
  for (const rule of RULES) {
    if (rule.match(ctx, offer)) return { cls: rule.cls, domain: rule.domain };
  }
  return null;
}

/**
 * Classifies one offer; unclassified offers are reported (`unclassifiedOffers`) and return null.
 * Prefer offersOfClass() in domain modules, which classifies everything once.
 */
export function classifyOffer(ctx: GenContext, offer: CanonOffer): Classification | null {
  const c = classifyOfferQuiet(ctx, offer);
  if (!c) {
    ctx.report.add('unclassifiedOffers', `${offer.id} ${offer.type} owner=${offer.owner} "${offer.title}"`);
  }
  return c;
}

interface Classified {
  byClass: Map<OfferClass, CanonOffer[]>;
  byOffer: Map<number, Classification>;
}

const cache = new WeakMap<GenContext, Classified>();

/** Classifies all offers once per context (memoized), ascending offer id; reports unclassified. */
export function classifyAll(ctx: GenContext): Classified {
  let res = cache.get(ctx);
  if (res) return res;
  res = { byClass: new Map(), byOffer: new Map() };
  for (const offer of [...ctx.arc.offers.values()].sort((a, b) => a.id - b.id)) {
    const c = classifyOffer(ctx, offer);
    if (!c) continue;
    res.byOffer.set(offer.id, c);
    const list = res.byClass.get(c.cls) ?? [];
    list.push(offer);
    res.byClass.set(c.cls, list);
  }
  cache.set(ctx, res);
  return res;
}

/** Offers of a class, ascending offer id (memoized). */
export function offersOfClass(ctx: GenContext, cls: OfferClass): CanonOffer[] {
  return classifyAll(ctx).byClass.get(cls) ?? [];
}

/** Offers of a domain (all its classes), ascending offer id. */
export function offersOfDomain(ctx: GenContext, domain: GameDomain): CanonOffer[] {
  const out: CanonOffer[] = [];
  for (const [id, c] of classifyAll(ctx).byOffer) if (c.domain === domain) out.push(ctx.arc.offers.get(id)!);
  return out.sort((a, b) => a.id - b.id);
}

/** Per-class counts, for reports/tests. */
export function classCounts(ctx: GenContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cls, list] of classifyAll(ctx).byClass) out[cls] = list.length;
  return out;
}

/** Asset id of the first reward item that is a shipped item (slug known), else null. */
export function primaryRewardId(ctx: GenContext, offer: CanonOffer): number | null {
  for (const r of offer.rewards.items) if (ctx.shippedItems.has(r.id)) return r.id;
  for (const pool of offer.rewards.random?.pools ?? []) for (const i of pool.items) if (ctx.shippedItems.has(i.id)) return i.id;
  return null;
}

/**
 * Frozen offer slug `<prefix>:<reward-item-slug>[-n]` (spec-site.md#offer-slugs). Callers must
 * process their offers in ascending offer id order. `baseItemId` overrides the reward item (used by
 * blueprints, whose reward is an unnamed unlock). Returns null (reported) without a shippable item.
 */
export function offerSlug(ctx: GenContext, prefix: string, offer: CanonOffer, baseItemId?: number | null): string | null {
  const existing = ctx.slugs.slugOf('offers', offer.id);
  if (existing) return existing;
  const itemId = baseItemId ?? primaryRewardId(ctx, offer);
  const itemSlug = itemId != null ? ctx.shippedItems.get(itemId) : undefined;
  if (!itemSlug) {
    ctx.report.add('offersWithoutReward', `${prefix} ${offer.id} "${offer.title}"`);
    return null;
  }
  return ctx.slugs.getOrCreate('offers', offer.id, { base: `${prefix}:${itemSlug}`, numericSep: '-' });
}

/** Common Offer fields (cost, requires, rewards, duration, visible) resolved to slugs. */
export function baseOffer(ctx: GenContext, offer: CanonOffer, slug: string): Offer {
  const context = `offer ${slug}`;
  const out: Offer = {
    id: slug,
    cost: ctx.cost(offer.cost, context),
    rewards: ctx.rewards(offer.rewards, context),
    visible: offer.visible,
  };
  const requires = ctx.requirements(offer.requires, context);
  if (requires.length) out.requires = requires;
  if (offer.durationSeconds > 0) out.durationSeconds = offer.durationSeconds;
  return out;
}

/** Amount of an item (e.g. a currency) in an offer's itemAmounts cost; 0 if none. */
export function costAmountOf(offer: CanonOffer, assetId: number): number {
  const c = offer.cost as { type: string; items?: { id: number; amount: number }[] };
  if (c.type !== 'itemAmounts') return 0;
  return (c.items ?? []).filter((i) => i.id === assetId).reduce((s, i) => s + i.amount, 0);
}
