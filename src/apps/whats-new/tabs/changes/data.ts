import { nameOf } from '../../../../shared/gamedata/loader';
import type { Amount, WhatsNewChanges, WhatsNewTraderChange } from '../../../../shared/gamedata/types';
import type { ItemRef } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';

/** Display order of trader diffs. */
export const TRADER_ORDER = ['celeste', 'shani', 'tian_wen', 'apollo', 'lance'];

export const TRADER_PORTRAITS: Record<string, string> = {
  apollo: '/images/trader/apollo.png',
  celeste: '/images/trader/celeste.png',
  lance: '/images/trader/lance.png',
  shani: '/images/trader/shani.png',
  tian_wen: '/images/trader/tian_wen.png',
};

/** Traders in display order; unknown traders follow in their original order. */
export function orderTraders<T extends { npc: string }>(traders: T[] = []): T[] {
  const rank = (npc: string) => {
    const i = TRADER_ORDER.indexOf(npc);
    return i === -1 ? TRADER_ORDER.length : i;
  };
  return traders.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.npc) - rank(b.t.npc) || a.i - b.i).map((x) => x.t);
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const ANVIL_RE = /^anvil_(i|ii|iii|iv)$/;

/** Anvil tier (1..4) of an item slug, null when it is not a plain Anvil tier. */
export function anvilTier(id: string): number | null {
  const m = ANVIL_RE.exec(id);
  return m ? ROMAN.indexOf(m[1].toUpperCase()) : null;
}

export function romanTier(tier: number): string {
  return ROMAN[tier] ?? String(tier);
}

/** Localized name of the Anvil family: the tier item's name without its trailing roman numeral. */
export function anvilBaseName(tierName: string): string {
  return tierName.replace(/\s+(?:I{1,3}|IV|V|VI)$/, '') || tierName;
}

export type AnvilRowKind = 'craft' | 'upgrade' | 'repair';

export interface AnvilRow {
  kind: AnvilRowKind;
  /** Tier the row is about (target tier for upgrades). */
  tier: number;
  /** Source tier of an upgrade. */
  fromTier?: number;
  before?: Amount[];
  after?: Amount[];
}

/** The Anvil chain (craft, upgrades, repairs) as rows ordered craft, upgrade, repair, then by tier. */
export function buildAnvilRows(changes: WhatsNewChanges | undefined): AnvilRow[] {
  const rows: AnvilRow[] = [];
  for (const r of changes?.recipes ?? []) {
    const tier = anvilTier(r.result);
    if (tier) rows.push({ kind: 'craft', tier, before: r.before, after: r.after });
  }
  for (const u of changes?.upgrades ?? []) {
    const to = anvilTier(u.to);
    const from = anvilTier(u.from);
    if (to && from) rows.push({ kind: 'upgrade', tier: to, fromTier: from, before: u.before, after: u.after });
  }
  for (const r of changes?.repairs ?? []) {
    const tier = anvilTier(r.id);
    if (tier) rows.push({ kind: 'repair', tier, before: r.before, after: r.after });
  }
  const order: Record<AnvilRowKind, number> = { craft: 0, upgrade: 1, repair: 2 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || a.tier - b.tier);
}

/** Recipes that are not part of the Anvil chain. */
export function otherRecipes(changes: WhatsNewChanges | undefined) {
  return (changes?.recipes ?? []).filter((r) => !anvilTier(r.result));
}

export interface RecyclingRow {
  id: string;
  before?: Amount[];
  after?: Amount[];
}

const sig = (a?: Amount[]) => (a ?? []).map((x) => `${x.itemId}:${x.quantity}`).join('|');

export interface RecyclingGroups {
  rows: RecyclingRow[];
  /** Anvil tiers, ordered I..IV. */
  anvil: (RecyclingRow & { tier: number })[];
  /** True when all Anvil tiers share one before/after pattern: render a single row. */
  anvilUniform: boolean;
}

export function groupRecycling(changes: WhatsNewChanges | undefined): RecyclingGroups {
  const rows: RecyclingRow[] = [];
  const anvil: (RecyclingRow & { tier: number })[] = [];
  for (const r of changes?.recycling ?? []) {
    const tier = anvilTier(r.id);
    if (tier) anvil.push({ ...r, tier });
    else rows.push(r);
  }
  anvil.sort((a, b) => a.tier - b.tier);
  const anvilUniform = anvil.length > 1 && anvil.every((a) => sig(a.before) === sig(anvil[0].before) && sig(a.after) === sig(anvil[0].after));
  return { rows, anvil, anvilUniform };
}

export interface StashTier {
  from: number;
  to: number;
  before?: Amount[];
  after?: Amount[];
  isNew: boolean;
  changed: boolean;
}

export function buildStashTiers(changes: WhatsNewChanges | undefined): StashTier[] {
  return [...(changes?.stash ?? [])]
    .sort((a, b) => a.from - b.from)
    .map((s) => ({ ...s, isNew: !s.before?.length, changed: sig(s.before) !== sig(s.after) }));
}

/** Compact number: 1500000 -> 1.5M, 21000 -> 21k. */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${+(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Bench tier icon tile for a `{bench, level}` ref. */
export function benchTierRef(data: WhatsNewPageData, bench: string, level: number): ItemRef {
  const b = data.benches?.structure.benches[bench];
  const name = b ? nameOf(data.benches, bench, b.nameEn) : bench;
  const icon = b?.levels.find((l) => l.level === level)?.icon ?? undefined;
  return { id: `${bench}-${level}`, name: `${name} ${level}`, icon };
}

export function traderName(data: WhatsNewPageData, npc: string): string {
  return data.trades ? nameOf(data.trades, npc, npc) : npc;
}

export { toItemRef };
export type { WhatsNewTraderChange };
