import type { StencilsStructure } from '../../../../shared/gamedata/types';
import type { ItemCatalog } from '../../../../shared/gamedata/catalog';
import { toItemRef } from '../../hooks/useWhatsNewData';
import type { ItemRef } from '../../components';
import { buildStencilGroups, type StencilEntry } from '../../legacy/sections/stencils/data';

export { PARTS_ID, STENCIL_IMAGES } from '../../legacy/sections/stencils/data';
export type { StencilEntry };

/** The 14 stencils grouped by Stencil Parts cost, ascending. */
export function stencilGroups(structure: StencilsStructure): Array<[number, StencilEntry[]]> {
  return buildStencilGroups(structure);
}

/** Weapon slug (slot id without prefix) to its display reference; the `_i` variant is the base weapon item. */
export function weaponRef(catalog: ItemCatalog, slug: string): ItemRef {
  const hit = [`${slug}_i`, slug].find((id) => catalog.items[id]);
  return toItemRef(catalog, hit ?? slug);
}
