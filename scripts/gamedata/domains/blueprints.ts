import type { Blueprint } from '../../../src/shared/gamedata/types';
import type { CanonAmount, CanonOffer } from '../arcData';
import type { GenContext } from '../context';
import { baseOffer, offerSlug, offersOfClass, primaryRewardId } from '../offer-classes';
import type { DomainModule } from './types';

function costItems(offer: CanonOffer): CanonAmount[] {
  const c = offer.cost as { type: string; items?: CanonAmount[] };
  return c.type === 'itemAmounts' ? (c.items ?? []) : [];
}

/** Crafting offers by required unlock asset id (ascending offer id), for unlocksItemId. */
function craftingByRequirement(ctx: GenContext): Map<number, CanonOffer[]> {
  const out = new Map<number, CanonOffer[]>();
  for (const offer of [...ctx.arc.offers.values()].sort((a, b) => a.id - b.id)) {
    if (offer.type !== 'Crafting') continue;
    for (const req of offer.requires) out.set(req.id, [...(out.get(req.id) ?? []), offer]);
  }
  return out;
}

/**
 * Domain 'blueprints': blueprint learning (Chamber, blueprint-learning owner). The blueprint item
 * is consumed (cost); the reward is an unnamed unlock that gates a crafting recipe.
 * `unlocksItemId` is the item crafted by the recipe that requires the rewarded unlock.
 * The offer slug is derived from the consumed blueprint item (the reward has no slug).
 */
const module: DomainModule = {
  domain: 'blueprints',
  build(ctx) {
    const blueprints: Record<string, Blueprint> = {};
    const gated = craftingByRequirement(ctx);
    for (const offer of offersOfClass(ctx, 'blueprints')) {
      const bpAsset = costItems(offer).find((c) => ctx.shippedItems.has(c.id))?.id ?? null;
      const slug = offerSlug(ctx, 'blueprints', offer, bpAsset);
      if (!slug) continue;
      const blueprintItemId = ctx.shippedItems.get(bpAsset!)!;

      let unlocksItemId: string | undefined;
      for (const reward of offer.rewards.items) {
        for (const recipe of gated.get(reward.id) ?? []) {
          const out = primaryRewardId(ctx, recipe);
          if (out != null) {
            unlocksItemId = ctx.shippedItems.get(out);
            break;
          }
        }
        if (unlocksItemId) break;
      }
      if (!unlocksItemId) ctx.report.add('blueprintsWithoutUnlock', `${offer.id} "${offer.title}"`);

      // The reward is an unnamed unlock; the site-visible result is the unlocked item. The gate
      // list repeats the consumed blueprint, which is dropped.
      const consumed = new Set(costItems(offer).map((c) => c.id));
      const base = baseOffer(
        ctx,
        { ...offer, rewards: { items: [], random: null }, requires: offer.requires.filter((r) => !consumed.has(r.id)) },
        slug,
      );
      blueprints[slug] = {
        ...base,
        rewards: unlocksItemId ? [{ itemId: unlocksItemId, quantity: 1 }] : [],
        blueprintItemId,
        ...(unlocksItemId ? { unlocksItemId } : {}),
      };
    }
    return { blueprints };
  },
};

export default module;
