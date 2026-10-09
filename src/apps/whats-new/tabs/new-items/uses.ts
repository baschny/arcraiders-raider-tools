import type {
  WhatsNewExistingItem,
  WhatsNewNewItem,
  WhatsNewRef,
  WhatsNewSystem,
  WhatsNewUse,
  WhatsNewVerdict,
} from '../../../../shared/gamedata/types';
import { SYSTEM_ORDER } from './systems';

export const VERDICT_ORDER: WhatsNewVerdict[] = ['keep', 'quest', 'optional', 'sell'];

const RARITY_RANK: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, amplified: 6 };

export function rarityRank(rarity?: string): number {
  return rarity ? (RARITY_RANK[rarity.toLowerCase()] ?? 0) : 0;
}

export interface ItemSortInfo {
  name: string;
  rarity?: string;
}

/** keep > quest > optional > sell, then rarity desc, then name. */
export function sortNewItems(
  items: WhatsNewNewItem[],
  info: (id: string) => ItemSortInfo,
): WhatsNewNewItem[] {
  return [...items].sort((a, b) => {
    const v = VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict);
    if (v) return v;
    const ia = info(a.id);
    const ib = info(b.id);
    const r = rarityRank(ib.rarity) - rarityRank(ia.rarity);
    return r || ia.name.localeCompare(ib.name);
  });
}

export function filterNewItems(
  items: WhatsNewNewItem[],
  verdict: WhatsNewVerdict | 'all',
  group: string,
): WhatsNewNewItem[] {
  return items.filter((i) => (verdict === 'all' || i.verdict === verdict) && (group === 'all' || i.group === group));
}

export function countBy<T>(list: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

function refKey(ref: WhatsNewRef): string {
  return typeof ref === 'string' ? ref : JSON.stringify(ref);
}

export function viaKey(use: WhatsNewUse): string {
  return use.via ? refKey(use.via) : '';
}

/** Uses grouped by system in display order. */
export function groupBySystem(uses: WhatsNewUse[] | undefined): { system: WhatsNewSystem; uses: WhatsNewUse[] }[] {
  const map = new Map<WhatsNewSystem, WhatsNewUse[]>();
  for (const use of uses ?? []) {
    const list = map.get(use.system);
    if (list) list.push(use);
    else map.set(use.system, [use]);
  }
  return SYSTEM_ORDER.filter((s) => map.has(s)).map((system) => ({ system, uses: map.get(system)! }));
}

export interface UseRow {
  amount: number;
  via?: WhatsNewRef;
  /** Representative use, for resolving `via` and system. */
  use: WhatsNewUse;
  /** Distinct targets in input order. */
  targets: WhatsNewRef[];
  /** Set on a merged row: the amounts span `amount`..`amountMax`. */
  amountMax?: number;
}

/** More distinct amounts than this in one system collapse into a single range row. */
export const MAX_AMOUNT_ROWS = 3;

/**
 * Collapses the per-amount rows of a system into one range row ("5–50× → targets") when it has
 * too many distinct amounts or is furniture (one row per amount is noise there).
 */
export function mergeAmountRows(system: WhatsNewSystem, rows: UseRow[]): UseRow[] {
  if (rows.length === 0 || (system !== 'outpostFurniture' && rows.length <= MAX_AMOUNT_ROWS)) return rows;
  const amounts = rows.map((r) => r.amount);
  const targets = rows
    .flatMap((r) => r.targets)
    .filter((t, i, all) => all.findIndex((o) => refKey(o) === refKey(t)) === i);
  const sameVia = rows.every((r) => viaKey(r.use) === viaKey(rows[0].use));
  const merged: UseRow = {
    amount: Math.min(...amounts),
    amountMax: Math.max(...amounts),
    via: sameVia ? rows[0].via : undefined,
    use: sameVia ? rows[0].use : { ...rows[0].use, via: undefined },
    targets,
  };
  return [merged];
}

/** Collapses uses of one system into rows sharing amount and via, with duplicate targets removed. */
export function collapseRows(uses: WhatsNewUse[]): UseRow[] {
  const rows = new Map<string, UseRow>();
  for (const use of uses) {
    const key = `${use.amount}|${viaKey(use)}`;
    let row = rows.get(key);
    if (!row) {
      row = { amount: use.amount, via: use.via, use, targets: [] };
      rows.set(key, row);
    }
    if (!row.targets.some((t) => refKey(t) === refKey(use.target))) row.targets.push(use.target);
  }
  return [...rows.values()];
}

/** Distinct targets of a system group. */
export function distinctTargets(uses: WhatsNewUse[]): WhatsNewRef[] {
  return collapseRows(uses).flatMap((r) => r.targets).filter((t, i, all) => all.findIndex((o) => refKey(o) === refKey(t)) === i);
}

/** First `max` entries and how many are left over. */
export function capList<T>(list: T[], max: number): { shown: T[]; more: number } {
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

/** Most gained uses first, ties by rarity desc, then name. */
export function sortByImpact(
  items: WhatsNewExistingItem[],
  info: (id: string) => ItemSortInfo,
): WhatsNewExistingItem[] {
  const impact = (i: WhatsNewExistingItem) => i.gained?.length ?? 0;
  return [...items].sort((a, b) => {
    const d = impact(b) - impact(a);
    if (d) return d;
    const ia = info(a.id);
    const ib = info(b.id);
    const r = rarityRank(ib.rarity) - rarityRank(ia.rarity);
    return r || ia.name.localeCompare(ib.name);
  });
}
