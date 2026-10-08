import type { Item } from '../../../src/shared/gamedata/types';
import type { CanonItem } from '../arcData';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

/**
 * Canonical item types that ship to the site. Everything referenced by site domains must be in
 * here (benches/Generators are modelled in `benches`, not as items). Items without an English name
 * never ship (no slug).
 */
export const SHIPPED_ITEM_TYPES = new Set([
  'GameItem',
  'Modification',
  'OutpostFurniture',
  'OutpostRoom',
  'OutpostSlot',
  'ItemSkin',
  'ItemSkinSlot',
]);

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
 * Domain 'items' — MINIMAL version (orchestrator, so other domains have item references).
 * Ticket S03 completes it: site type mapping, rarity, weight, relationships, icons, foundIn,
 * arctrackerAliases, exclusions (spec-site.md#items).
 */
const module: DomainModule = {
  domain: 'items',
  build(ctx) {
    const items: Record<string, Item> = {};
    for (const item of registerShippedItems(ctx)) {
      const slug = ctx.shippedItems.get(item.id)!;
      items[slug] = {
        id: slug,
        nameEn: item.name!.en,
        type: item.type ?? 'Unknown',
        rarity: 'Common',
        icon: '',
        value: item.value,
        stackSize: item.maxStack || 1,
      };
      ctx.text.add('items', slug, 'name', item.name);
      ctx.text.add('items', slug, 'description', item.description);
    }
    return { items };
  },
};

export default module;
