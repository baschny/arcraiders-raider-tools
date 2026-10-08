import type { Research } from '../../../src/shared/gamedata/types';
import { baseOffer, costAmountOf, offerSlug, offersOfClass, primaryRewardId } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Domain 'research': Research Station offers. `researchPoints` is the Research Points amount of
 * the cost. The display title is the reward item's localized name (docs/Game-Data.md).
 */
const module: DomainModule = {
  domain: 'research',
  build(ctx) {
    const research: Record<string, Research> = {};
    const rp = ctx.arc.constants.currencies.researchPoints;
    for (const offer of offersOfClass(ctx, 'research')) {
      const slug = offerSlug(ctx, 'research', offer);
      if (!slug) continue;
      const bench = ctx.benchLevel(offer.owner);
      if (!bench?.benchId) continue; // cannot happen: rule 1 needs a bench
      research[slug] = {
        ...baseOffer(ctx, offer, slug),
        benchId: bench.benchId,
        benchLevel: bench.level,
        researchPoints: costAmountOf(offer, rp),
      };
      const rewardId = primaryRewardId(ctx, offer);
      const reward = rewardId != null ? ctx.arc.items.get(rewardId) : undefined;
      ctx.text.add('research', slug, 'name', reward?.name ?? offer.title);
    }
    return { research };
  },
};

export default module;
