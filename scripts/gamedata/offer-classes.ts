/**
 * Offer classification: every canonical offer carries `class` (written by the arc-data build,
 * embark-api lib/canonical/offer-class.js, ordered rule table, first match wins) naming the mechanic
 * it belongs to; `null` = unclassified. This module maps a class to the site domain that ships it.
 *
 * Offers with class `null` (or an unknown class) are reported under `unclassifiedOffers` (fails
 * --strict) and not shipped. Other domain modules (benches, outpost, stencils, projects) get their
 * offers via offersOfClass(ctx, '<class>').
 */
import type { GameDomain, Offer } from '../../src/shared/gamedata/types';
import type { CanonOffer } from './arcData';
import type { GenContext } from './context';

export type OfferClass =
  | 'research'
  | 'recipes:bench'
  | 'recipes:in_raid'
  | 'items:salvage'
  | 'blueprints'
  | 'benches:build'
  | 'outpost:furniture'
  | 'outpost:room'
  | 'outpost:design'
  | 'stencils:learn'
  | 'stencils:craft'
  | 'trades'
  | 'benches:scrappy'
  | 'projects:event'
  | 'excluded:promo'; // NPC-typed offers whose owner is not an NPC (promo/store/migration): known, not shipped

/** Site domain that ships each class; 'none' for known-but-not-shipped offers. */
const CLASS_DOMAIN: Record<OfferClass, GameDomain | 'none'> = {
  research: 'research',
  'recipes:bench': 'recipes',
  'recipes:in_raid': 'recipes',
  'items:salvage': 'items',
  blueprints: 'blueprints',
  'benches:build': 'benches',
  'outpost:furniture': 'outpost',
  'outpost:room': 'outpost',
  'outpost:design': 'outpost',
  'stencils:learn': 'stencils',
  'stencils:craft': 'stencils',
  trades: 'trades',
  'benches:scrappy': 'benches',
  'projects:event': 'projects',
  'excluded:promo': 'none',
};

interface Classified {
  byClass: Map<OfferClass, CanonOffer[]>;
  byOffer: Map<number, OfferClass>;
}

const cache = new WeakMap<GenContext, Classified>();

/** Groups all offers by their `class` once per context (memoized), ascending offer id; reports unclassified. */
export function classifyAll(ctx: GenContext): Classified {
  let res = cache.get(ctx);
  if (res) return res;
  res = { byClass: new Map(), byOffer: new Map() };
  for (const offer of [...ctx.arc.offers.values()].sort((a, b) => a.id - b.id)) {
    const cls = offer.class as OfferClass | null | undefined;
    if (!cls || !(cls in CLASS_DOMAIN)) {
      ctx.report.add('unclassifiedOffers', `${offer.id} ${offer.type} owner=${offer.owner} "${offer.title}"${cls ? ` class=${cls}` : ''}`);
      continue;
    }
    res.byOffer.set(offer.id, cls);
    const list = res.byClass.get(cls) ?? [];
    list.push(offer);
    res.byClass.set(cls, list);
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
  for (const [id, cls] of classifyAll(ctx).byOffer) if (CLASS_DOMAIN[cls] === domain) out.push(ctx.arc.offers.get(id)!);
  return out.sort((a, b) => a.id - b.id);
}

/** Per-class counts, for reports/tests. */
export function classCounts(ctx: GenContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cls, list] of classifyAll(ctx).byClass) out[cls] = list.length;
  return out;
}

/** Asset id of the first reward item that is a shipped item, else null. */
export function primaryRewardId(ctx: GenContext, offer: CanonOffer): number | null {
  for (const r of offer.rewards.items) if (ctx.shippedItems.has(r.id)) return r.id;
  for (const pool of offer.rewards.random?.pools ?? []) for (const i of pool.items) if (ctx.shippedItems.has(i.id)) return i.id;
  return null;
}

/**
 * Public id of an offer: its numeric offer id as a string. Offers without a shippable reward item
 * (`baseItemId` overrides the reward item, used by blueprints whose reward is an unnamed unlock) are
 * not shipped: null (reported).
 */
export function offerRef(ctx: GenContext, prefix: string, offer: CanonOffer, baseItemId?: number | null): string | null {
  const itemId = baseItemId ?? primaryRewardId(ctx, offer);
  if (itemId == null || !ctx.shippedItems.has(itemId)) {
    ctx.report.add('offersWithoutReward', `${prefix} ${offer.id} "${offer.title}"`);
    return null;
  }
  return String(offer.id);
}

/** Common Offer fields (cost, requires, rewards, duration, visible) resolved to slugs; `id` is the offer id. */
export function baseOffer(ctx: GenContext, offer: CanonOffer, id: string): Offer {
  const context = `offer ${id}`;
  const out: Offer = {
    id,
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
