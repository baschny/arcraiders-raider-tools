import type {
  OutpostDesign,
  OutpostFurniture,
  OutpostLevel,
  OutpostRoom,
  OutpostSlot,
  Research,
} from '../../../src/shared/gamedata/types';
import type { CanonAmount, CanonOffer, CanonRewardPackage } from '../arcData';
import type { GenContext } from '../context';
import { offersOfClass, offerSlug } from '../offer-classes';
import type { DomainModule } from './types';

/** Outpost rooms group: levels by number of installed rooms. */
const OUTPOST_ROOMS_GROUP = '807616292';

const tagValue = (tags: string[], prefix: string): string | undefined =>
  tags.find((t) => t.startsWith(prefix))?.slice(prefix.length);

function craftOf(ctx: GenContext, prefix: string, offer: CanonOffer | undefined, baseItemId?: number) {
  if (!offer) return undefined;
  const offerId = offerSlug(ctx, prefix, offer, baseItemId);
  if (!offerId) return undefined;
  const requires = ctx.requirements(offer.requires, `offer ${offerId}`);
  return { offerId, cost: ctx.cost(offer.cost, `offer ${offerId}`), ...(requires.length ? { requires } : {}) };
}

/**
 * Outpost (spec-site.md#outpost). Rooms, slots, furniture and designs are items (same slugs).
 * Design chain: a design item is consumed by an 'outpost:design' offer that rewards an unlock; the
 * furniture's 'outpost:furniture' craft offer requires that unlock.
 */
const module: DomainModule = {
  domain: 'outpost',
  build(ctx) {
    const items = (type: string) =>
      [...ctx.arc.items.values()].filter((i) => i.type === type && ctx.shippedItems.has(i.id)).sort((a, b) => a.id - b.id);
    const slugOf = (id: number) => ctx.shippedItems.get(id)!;
    const byReward = (cls: Parameters<typeof offersOfClass>[1]) => {
      const m = new Map<number, CanonOffer>();
      for (const o of offersOfClass(ctx, cls)) for (const r of o.rewards.items) if (!m.has(r.id)) m.set(r.id, o);
      return m;
    };
    const furnitureCraft = byReward('outpost:furniture');
    const roomCraft = byReward('outpost:room');

    // design learning: unlock asset → design item (consumed)
    const designOfUnlock = new Map<number, { design: number; offer: CanonOffer }>();
    for (const o of offersOfClass(ctx, 'outpost:design')) {
      const design = o.cost.type === 'itemAmounts' ? (o.cost as { items: CanonAmount[] }).items[0]?.id : undefined;
      for (const r of o.rewards.items) if (design != null) designOfUnlock.set(r.id, { design, offer: o });
    }

    const rooms: Record<string, OutpostRoom> = {};
    for (const r of items('OutpostRoom')) {
      const slug = slugOf(r.id);
      const slotIds = ((r.slots.slotAssetIds as number[] | undefined) ?? []).filter((id) => ctx.shippedItems.has(id));
      rooms[slug] = {
        id: slug,
        nameEn: r.name!.en,
        slots: [...new Set(slotIds.map(slugOf))].sort(),
        craft: craftOf(ctx, 'outpost', roomCraft.get(r.id)),
      };
      ctx.text.add('outpost', slug, 'name', r.name);
    }

    const furniture: Record<string, OutpostFurniture> = {};
    const furnitureCategory = new Map<number, string>();
    const designs: Record<string, OutpostDesign> = {};
    for (const f of items('OutpostFurniture')) {
      const slug = slugOf(f.id);
      const category = tagValue(f.tags, 'Outpost.Furniture.') ?? 'Other';
      furnitureCategory.set(f.id, category);
      const x = Number(tagValue(f.tags, 'Outpost.ItemSize.X.'));
      const y = Number(tagValue(f.tags, 'Outpost.ItemSize.Y.'));
      const craftOffer = furnitureCraft.get(f.id);
      const learned = craftOffer?.requires.map((g) => designOfUnlock.get(g.id)).find(Boolean);
      const designId = learned && ctx.shippedItems.get(learned.design);
      furniture[slug] = {
        id: slug,
        category,
        placement: tagValue(f.tags, 'Outpost.ItemType.Furniture.'),
        ...(x && y ? { size: { x, y } } : {}),
        craft: craftOf(ctx, 'outpost', craftOffer),
        ...(designId ? { designId } : {}),
      };
      if (!craftOffer) ctx.report.add('outpost:furnitureWithoutCraft', slug);
      if (learned && designId) {
        const d = (designs[designId] ??= { id: designId, learn: craftOf(ctx, 'outpost', learned.offer, learned.design), unlocks: [] });
        d.unlocks = [...new Set([...(d.unlocks ?? []), slug])].sort();
      }
    }
    // research offers that reward a design item
    for (const r of Object.values((ctx.results.research?.research ?? {}) as Record<string, Research>)) {
      for (const rw of r.rewards ?? []) {
        const d = designs[rw.itemId];
        if (d) d.researchedBy = [...new Set([...(d.researchedBy ?? []), r.id])].sort();
      }
    }

    const slots: Record<string, OutpostSlot> = {};
    for (const s of items('OutpostSlot')) {
      const slug = slugOf(s.id);
      const allowedIds = (s.slots.allowedSlotAssetIds as number[] | undefined) ?? [];
      const allowedFurniture = allowedIds.filter((id) => furnitureCategory.has(id)).map(slugOf).sort();
      const allowedCategories = [...new Set(allowedIds.map((id) => furnitureCategory.get(id)).filter((c): c is string => !!c))].sort();
      slots[slug] = { id: slug, nameEn: s.name!.en, allowedCategories, allowedFurniture };
      ctx.text.add('outpost', slug, 'name', s.name);
    }

    const levels: OutpostLevel[] = [];
    const group = ctx.arc.file('level-groups').get(OUTPOST_ROOMS_GROUP);
    for (const l of (group?.levels as { level: number; absoluteAmountRequired: number; reward: CanonRewardPackage }[]) ?? []) {
      levels.push({ level: l.level, roomsInstalled: l.absoluteAmountRequired, rewards: ctx.rewards(l.reward, `outpost level ${l.level}`) });
    }
    if (!group) ctx.report.add('outpost', `level group ${OUTPOST_ROOMS_GROUP} missing`);

    return { rooms, slots, furniture, designs, levels };
  },
};

export default module;
