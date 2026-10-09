import type { Amplification, AmplifiedWeapon, Cost } from '../../../../shared/gamedata/types';

/** Why an Amplification cannot be chosen right now; `by` is the Amplification id responsible. */
export type LockReason = 'requires' | 'excluded' | 'limit';
export type CanSelect = { ok: true } | { ok: false; reason: LockReason; by?: string };

/** The generated data omits empty `requires` / `excludes`. */
export const requiresOf = (a: Amplification): string[] => a.requires ?? [];
export const excludesOf = (a: Amplification): string[] => a.excludes ?? [];

/** `IncendiaryRounds` -> `incendiary_rounds`, `XRounds` -> `x_rounds` (the spelling used in variant item ids). */
function snake(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * The Amplification sets of the weapon's variant items (e.g. `hairpin_amplified_semi_auto_sprint_shooting`),
 * or null when a variant cannot be matched to the Amplification ids (some weapons name a variant differently),
 * in which case the variants cannot be used to validate a selection.
 */
export function variantSets(weapon: AmplifiedWeapon): Set<string>[] | null {
  const tokens = weapon.amplifications.map((a) => ({ id: a.id, snake: snake(a.id) }));
  const prefix = `${weapon.amplifiedItemId}_`;
  const sets: Set<string>[] = [];
  for (const variant of weapon.variants ?? []) {
    if (variant === weapon.amplifiedItemId) {
      sets.push(new Set());
      continue;
    }
    if (!variant.startsWith(prefix)) return null;
    const parse = (rest: string): string[] | null => {
      if (!rest) return [];
      for (const t of tokens) {
        if (rest === t.snake || rest.startsWith(`${t.snake}_`)) {
          const tail = parse(rest.slice(t.snake.length + 1));
          if (tail) return [t.id, ...tail];
        }
      }
      return null;
    };
    const ids = parse(variant.slice(prefix.length));
    if (!ids) return null;
    sets.push(new Set(ids));
  }
  return sets.length ? sets : null;
}

/** Whether `selection` is (a subset of) an existing variant; true when the variants cannot be matched. */
function reachable(weapon: AmplifiedWeapon, selection: string[]): boolean {
  const sets = variantSets(weapon);
  return !sets || sets.some((s) => selection.every((id) => s.has(id)));
}

export function canSelect(selected: string[], amp: Amplification, weapon: AmplifiedWeapon): CanSelect {
  if (selected.includes(amp.id)) return { ok: true };
  const excludedBy = selected.find((id) => excludesOf(amp).includes(id) || excludesOf(weapon.amplifications.find((a) => a.id === id) ?? amp).includes(amp.id));
  if (excludedBy) return { ok: false, reason: 'excluded', by: excludedBy };
  const missing = requiresOf(amp).find((id) => !selected.includes(id));
  if (missing) return { ok: false, reason: 'requires', by: missing };
  if (selected.length >= weapon.maxAmplifications) return { ok: false, reason: 'limit' };
  if (!reachable(weapon, [...selected, amp.id])) return { ok: false, reason: 'excluded' };
  return { ok: true };
}

/** Selection after clicking `amp`: adds it when allowed, removes it (and everything depending on it) when chosen. */
export function toggle(selected: string[], amp: Amplification, weapon: AmplifiedWeapon): string[] {
  if (selected.includes(amp.id)) {
    const removed = new Set([amp.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of weapon.amplifications) {
        if (!removed.has(a.id) && requiresOf(a).some((r) => removed.has(r))) {
          removed.add(a.id);
          grew = true;
        }
      }
    }
    return selected.filter((id) => !removed.has(id));
  }
  return canSelect(selected, amp, weapon).ok ? [...selected, amp.id] : selected;
}

const partsOf = (cost: Cost | undefined) => (cost && 'items' in cost ? cost.items : []);

/** Total parts of the chosen Amplifications, summed per item in first-seen order. */
export function totalParts(selected: string[], weapon: AmplifiedWeapon): { itemId: string; quantity: number }[] {
  const sums = new Map<string, number>();
  for (const id of selected) {
    const amp = weapon.amplifications.find((a) => a.id === id);
    for (const p of partsOf(amp?.variantStep?.cost)) sums.set(p.itemId, (sums.get(p.itemId) ?? 0) + p.quantity);
  }
  return [...sums.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Research items needed by the chosen Amplifications (distinct, in selection order). */
export function researchNeeded(selected: string[], weapon: AmplifiedWeapon): string[] {
  const out: string[] = [];
  for (const id of selected) {
    const r = weapon.amplifications.find((a) => a.id === id)?.researchItemId;
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

/** The variant item that results from the selection, when the variants can be matched. */
export function resultingVariant(selected: string[], weapon: AmplifiedWeapon): string | undefined {
  const sets = variantSets(weapon);
  if (!sets || !weapon.variants) return undefined;
  const i = sets.findIndex((s) => s.size === selected.length && selected.every((id) => s.has(id)));
  return i >= 0 ? weapon.variants[i] : undefined;
}
