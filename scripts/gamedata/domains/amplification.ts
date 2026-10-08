import type { AmplificationBranch, AmplifiedWeapon, Item } from '../../../src/shared/gamedata/types';
import type { DomainModule } from './types';

/**
 * Amplified weapons (spec-site.md#amplification), derived from the items domain: variants are items
 * with `amplifiedFrom`; the graph holds every upgrade edge leaving the weapon's tier chain into the
 * variants and between variants. Must run after `items`.
 */
const module: DomainModule = {
  domain: 'amplification',
  build(ctx) {
    const items = (ctx.results.items?.items ?? {}) as Record<string, Item>;
    const weapons: Record<string, AmplifiedWeapon> = {};
    for (const it of Object.values(items).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!it.amplifiedFrom) continue;
      const from = items[it.amplifiedFrom];
      const baseId = from?.baseId ?? it.amplifiedFrom;
      const w = (weapons[baseId] ??= { id: baseId, fromItemId: it.amplifiedFrom, variants: [], graph: {} });
      w.variants!.push(it.id);
    }
    for (const w of Object.values(weapons)) {
      const variants = w.variants!;
      for (const id of [w.fromItemId, ...variants]) {
        const branches: AmplificationBranch[] = (items[id]?.upgradesTo ?? [])
          .filter((u) => variants.includes(u.itemId))
          .map((u) => ({ itemId: u.itemId, cost: u.cost, ...(u.requires?.length ? { requires: u.requires } : {}) }));
        if (branches.length) w.graph[id] = branches;
      }
      // repair material of the variants (Amplified Fragments)
      const repair = variants.flatMap((v) => items[v]?.repairCost ?? []).map((a) => a.itemId);
      if (repair.length) w.repairItemId = repair[0];
      variants.sort();
    }
    return { weapons };
  },
};

export default module;
