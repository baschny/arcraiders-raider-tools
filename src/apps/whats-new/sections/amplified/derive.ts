import type { AmplificationStructure, AmplifiedWeapon, Cost } from '../../../../shared/gamedata/types';

export interface PerkInfo {
  /** Perk name derived from the variant id (e.g. "Bigger Mag"). */
  name: string;
  parts: { itemId: string; quantity: number }[];
  /** Research unlock item slug, absent for perks without a research gate. */
  researchId?: string;
}

export interface WeaponRow {
  baseId: string;
  fromItemId: string;
  amplifiedId: string;
  moduleId: string;
  perks: PerkInfo[];
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

export function humanize(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const partsOf = (cost: Cost) => ('items' in cost ? cost.items : []);

/** Distinct perks of one weapon: every permutation edge is one perk, deduplicated by cost + research. */
export function perksOf(weapon: AmplifiedWeapon): PerkInfo[] {
  const root = weapon.graph[weapon.fromItemId]?.[0];
  if (!root) return [];
  const perks = new Map<string, PerkInfo>();
  const seen = new Set<string>([root.itemId]);
  const queue = [root.itemId];
  while (queue.length) {
    const source = queue.shift() as string;
    for (const branch of weapon.graph[source] ?? []) {
      const parts = partsOf(branch.cost);
      const research = branch.requires?.find((r) => r.kind === 'item')?.id;
      const key = `${research ?? ''}|${parts.map((p) => `${p.itemId}x${p.quantity}`).join(',')}`;
      if (!perks.has(key) && parts.length) {
        const name = branch.itemId.startsWith(`${source}_`)
          ? humanize(branch.itemId.slice(source.length + 1))
          : humanize(research?.replace(/_research$/, '') ?? branch.itemId);
        perks.set(key, { name, parts: parts.map((p) => ({ itemId: p.itemId, quantity: p.quantity })), researchId: research });
      }
      if (!seen.has(branch.itemId)) {
        seen.add(branch.itemId);
        queue.push(branch.itemId);
      }
    }
  }
  return [...perks.values()];
}

export function weaponRows(structure: AmplificationStructure): WeaponRow[] {
  const rows: WeaponRow[] = [];
  for (const weapon of Object.values(structure.weapons)) {
    const root = weapon.graph[weapon.fromItemId]?.[0];
    const module = root && partsOf(root.cost)[0];
    if (!root || !module) continue;
    rows.push({
      baseId: weapon.id,
      fromItemId: weapon.fromItemId,
      amplifiedId: root.itemId,
      moduleId: module.itemId,
      perks: perksOf(weapon),
    });
  }
  return rows;
}

/** Module MK number from its name ("Amplification Module MK. III"); unknown names sort last. */
export function moduleOrder(name: string): number {
  const m = /MK\.?\s*([IVX]+)\s*$/i.exec(name);
  return (m && ROMAN[m[1].toUpperCase()]) || 99;
}
