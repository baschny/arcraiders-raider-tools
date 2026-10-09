import type { StencilsStructure } from '../../../../../shared/gamedata/types';

export const PARTS_ID = 'stencil_parts';
const SLOT_PREFIX = 'stencil_slot_';

/** Optional swatch images per stencil slug (filled by the stencil-art ticket). */
export const STENCIL_IMAGES: Record<string, string> = {};

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
