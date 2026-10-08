import type { Stencil, StencilSlot } from '../../../src/shared/gamedata/types';
import type { CanonAmount, CanonOffer } from '../arcData';
import { offersOfClass, offerSlug } from '../offer-classes';
import type { DomainModule } from './types';

/**
 * Stencils (docs/Game-Data.md): ItemSkin items, applied through ItemSkinSlot items (one slot per
 * weapon/item; `allowedSlotAssetIds` lists the stencils). A 'stencils:learn' Chamber offer consumes a
 * stencil design item and rewards an unlock; the 'stencils:craft' offer requires that unlock and
 * costs stencil currency. Both are folded into `craft` (cost of crafting, requires the learn step).
 */
const module: DomainModule = {
  domain: 'stencils',
  build(ctx) {
    const items = (type: string) =>
      [...ctx.arc.items.values()].filter((i) => i.type === type && ctx.shippedItems.has(i.id)).sort((a, b) => a.id - b.id);

    const craftByReward = new Map<number, CanonOffer>();
    for (const o of offersOfClass(ctx, 'stencils:craft')) for (const r of o.rewards.items) if (!craftByReward.has(r.id)) craftByReward.set(r.id, o);
    // unlock → design item consumed to learn it
    const learnedBy = new Map<number, number>();
    for (const o of offersOfClass(ctx, 'stencils:learn')) {
      const design = o.cost.type === 'itemAmounts' ? (o.cost as { items: CanonAmount[] }).items[0]?.id : undefined;
      for (const r of o.rewards.items) if (design != null) learnedBy.set(r.id, design);
    }

    const slots: Record<string, StencilSlot> = {};
    const slotOfStencil = new Map<number, string>();
    for (const s of items('ItemSkinSlot')) {
      const slug = ctx.shippedItems.get(s.id)!;
      const allowedIds = ((s.slots.allowedSlotAssetIds as number[] | undefined) ?? []).filter((id) => ctx.shippedItems.has(id));
      for (const id of allowedIds) if (!slotOfStencil.has(id)) slotOfStencil.set(id, slug);
      slots[slug] = { id: slug, nameEn: s.name!.en, allowed: allowedIds.map((id) => ctx.shippedItems.get(id)!).sort() };
      ctx.text.add('stencils', slug, 'name', s.name);
    }

    const stencils: Record<string, Stencil> = {};
    for (const st of items('ItemSkin')) {
      const slug = ctx.shippedItems.get(st.id)!;
      const offer = craftByReward.get(st.id);
      let craft: Stencil['craft'];
      if (offer) {
        const offerId = offerSlug(ctx, 'stencils', offer);
        if (offerId) {
          const requires = ctx.requirements(offer.requires, `offer ${offerId}`);
          // the learn step: requirement on the consumed design item instead of the unnamed unlock
          for (const g of offer.requires) {
            const design = learnedBy.get(g.id);
            const designSlug = design != null ? ctx.shippedItems.get(design) : undefined;
            if (designSlug && !requires.some((r) => r.id === designSlug)) requires.push({ kind: 'unlock', id: designSlug });
          }
          craft = { offerId, cost: ctx.cost(offer.cost, `offer ${offerId}`), ...(requires.length ? { requires } : {}) };
        }
      }
      const slotId = slotOfStencil.get(st.id);
      stencils[slug] = { id: slug, ...(slotId ? { slotId } : {}), ...(craft ? { craft } : {}) };
      ctx.text.add('stencils', slug, 'name', st.name);
    }
    return { stencils, slots };
  },
};

export default module;
