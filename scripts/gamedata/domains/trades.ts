import type { Trade, Trader } from '../../../src/shared/gamedata/types';
import { baseOffer, offerRef, offersOfClass } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Domain 'trades': NPC offers (buy and scrap-value sell offers), keyed by offer id.
 * The trader is the NPC owner's asset id as a string; `traders` maps it to the name.
 */
const module: DomainModule = {
  domain: 'trades',
  build(ctx) {
    const trades: Record<string, Trade> = {};
    const traders: Record<string, Trader> = {};
    for (const offer of offersOfClass(ctx, 'trades')) {
      const slug = offerRef(ctx, 'trades', offer);
      if (!slug) continue;
      const npc = ctx.arc.items.get(offer.owner) ?? null;
      const traderId = String(offer.owner);
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
