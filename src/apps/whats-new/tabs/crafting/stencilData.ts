import type { StencilsStructure } from '../../../../shared/gamedata/types';

export const PARTS_ID = 'stencil_parts';
const SLOT_PREFIX = 'stencil_slot_';

/** Colour swatch per stencil slug, generated from the game files by `npm run generate:stencil-swatches`. */
export const STENCIL_IMAGES: Record<string, string> = {
  garnet: '/images/whats-new/stencils/garnet.webp',
  verdigris_itemskin_commonblue: '/images/whats-new/stencils/verdigris_itemskin_commonblue.webp',
  ochre: '/images/whats-new/stencils/ochre.webp',
  slipstream: '/images/whats-new/stencils/slipstream.webp',
  milky_terraccota: '/images/whats-new/stencils/milky_terraccota.webp',
  empyrean: '/images/whats-new/stencils/empyrean.webp',
  serac: '/images/whats-new/stencils/serac.webp',
  cerulean_itemskin_muraltree: '/images/whats-new/stencils/cerulean_itemskin_muraltree.webp',
  fortuna: '/images/whats-new/stencils/fortuna.webp',
  dragons_breath: '/images/whats-new/stencils/dragons_breath.webp',
  tortoise_itemskin_tortoiseshell: '/images/whats-new/stencils/tortoise_itemskin_tortoiseshell.webp',
  bulwark_itemskin_outlander: '/images/whats-new/stencils/bulwark_itemskin_outlander.webp',
  dusty_camo: '/images/whats-new/stencils/dusty_camo.webp',
  sacrifice_itemskin_bells: '/images/whats-new/stencils/sacrifice_itemskin_bells.webp',
};

export interface StencilEntry {
  id: string;
  cost: number;
  /** Weapon slugs (slot ids without the prefix). */
  weapons: string[];
}

/** Stencils grouped by Stencil Parts cost, ascending. Weapons come from `appliesTo`, else from the slots' `allowed` lists. */
export function buildStencilGroups(structure: StencilsStructure): Array<[number, StencilEntry[]]> {
  const { stencils, slots } = structure;
  const groups = new Map<number, StencilEntry[]>();
  for (const s of Object.values(stencils)) {
    const cost = (s.craft && 'items' in s.craft.cost ? s.craft.cost.items.find((c) => c.itemId === PARTS_ID)?.quantity : undefined) ?? 0;
    let weapons = s.appliesTo;
    if (!weapons?.length) {
      weapons = Object.values(slots)
        .filter((slot) => slot.allowed?.includes(s.id))
        .map((slot) => slot.id.replace(SLOT_PREFIX, ''));
      if (!weapons.length && s.slotId) weapons = [s.slotId.replace(SLOT_PREFIX, '')];
    }
    const list = groups.get(cost) ?? [];
    list.push({ id: s.id, cost, weapons });
    groups.set(cost, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}
