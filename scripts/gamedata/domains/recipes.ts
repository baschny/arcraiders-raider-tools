import type { Recipe } from '../../../src/shared/gamedata/types';
import { baseOffer, offerSlug, offersOfClass } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Domain 'recipes': bench crafting (Crafting offers owned by a non-research bench level) and
 * in-raid crafting (FieldCrafting owner 510, station 'in_raid').
 */
const module: DomainModule = {
  domain: 'recipes',
  build(ctx) {
    const recipes: Record<string, Recipe> = {};
    const offers = [...offersOfClass(ctx, 'recipes:bench'), ...offersOfClass(ctx, 'recipes:in_raid')].sort((a, b) => a.id - b.id);
    for (const offer of offers) {
      const slug = offerSlug(ctx, 'recipes', offer);
      if (!slug) continue;
      const inRaid = offer.type === 'FieldCrafting';
      const recipe: Recipe = { ...baseOffer(ctx, offer, slug), station: inRaid ? 'in_raid' : 'bench' };
      if (!inRaid) {
        const bench = ctx.benchLevel(offer.owner);
        if (!bench?.benchId) {
          ctx.report.add('recipesWithoutBench', `${offer.id} owner=${offer.owner}`);
          continue;
        }
        recipe.benchId = bench.benchId;
        recipe.benchLevel = bench.level;
      }
      recipes[slug] = recipe;
    }
    return { recipes };
  },
};

export default module;
