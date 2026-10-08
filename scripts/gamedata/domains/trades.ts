import type { Trade, Trader } from '../../../src/shared/gamedata/types';
import { baseOffer, offerSlug, offersOfClass } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Domain 'trades': NPC offers (buy and scrap-value sell offers), keyed `trades:<reward-slug>[-n]`.
 * The trader is the slug of the NPC owner (slug kind 'traders'); `traders` maps slug → name.
 */
const module: DomainModule = {
  domain: 'trades',
  build(ctx) {
    const trades: Record<string, Trade> = {};
    const traders: Record<string, Trader> = {};
    for (const offer of offersOfClass(ctx, 'trades')) {
      const slug = offerSlug(ctx, 'trades', offer);
      if (!slug) continue;
      const npc = ctx.arc.items.get(offer.owner) ?? null;
      const traderId = ctx.slugFor('traders', offer.owner, npc);
      if (!traderId) continue;
      if (!traders[traderId]) {
        traders[traderId] = { id: traderId, nameEn: npc?.name?.en ?? traderId };
        ctx.text.add('trades', traderId, 'name', npc?.name);
      }
      const trade: Trade = { ...baseOffer(ctx, offer, slug), traderId };
      if (offer.limit && offer.limit.max > 0) trade.limit = { max: offer.limit.max, refreshSeconds: offer.limit.refreshSeconds };
      trades[slug] = trade;
    }
    return { trades, traders };
  },
};

export default module;
