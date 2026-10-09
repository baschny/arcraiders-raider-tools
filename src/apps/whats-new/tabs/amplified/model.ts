import type { ItemCatalog } from '../../../../shared/gamedata/catalog';
import type { AmplificationStructure } from '../../../../shared/gamedata/types';
import { moduleOrder, weaponRows, type WeaponRow } from '../../legacy/sections/amplified/derive';

export interface ModuleGroup {
  moduleId: string;
  weapons: WeaponRow[];
}

/** Weapons grouped by the Amplification Module they need, ordered by MK number. */
export function groupByModule(structure: AmplificationStructure, catalog: ItemCatalog): ModuleGroup[] {
  const byModule = new Map<string, WeaponRow[]>();
  for (const row of weaponRows(structure)) byModule.set(row.moduleId, [...(byModule.get(row.moduleId) ?? []), row]);
  return [...byModule.entries()]
    .map(([moduleId, weapons]) => ({ moduleId, weapons, order: moduleOrder(catalog.items[moduleId]?.name ?? '') }))
    .sort((a, b) => a.order - b.order)
    .map(({ moduleId, weapons }) => ({ moduleId, weapons }));
}

/** Amplified Fragments item and how many one module recycles into. */
export function fragmentInfo(structure: AmplificationStructure, catalog: ItemCatalog, moduleId?: string) {
  const fragmentsId = Object.values(structure.weapons)[0]?.repairItemId;
  const recycles = fragmentsId && moduleId ? catalog.items[moduleId]?.recyclesInto?.[fragmentsId] : undefined;
  return { fragmentsId, recycles };
}
