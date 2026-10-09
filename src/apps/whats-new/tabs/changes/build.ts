import type { Amount, WhatsNewTradeLine } from '../../../../shared/gamedata/types';
import type { CompareCost, CompareRow, ItemRef } from '../../components';
import { anvilTier, buildAnvilRows, otherRecipes, romanTier, type AnvilRow } from './data';
import type { WhatsNewChanges } from '../../../../shared/gamedata/types';

export type RefOf = (slug: string) => ItemRef;
export type FormatNumber = (n: number) => string;

/** Amounts as currency / material tiles (48 px) with their quantity. */
export function toCosts(amounts: Amount[] | undefined, refOf: RefOf, state?: CompareCost['state']): CompareCost[] {
  return (amounts ?? []).map((a) => ({ item: refOf(a.itemId), amount: a.quantity, state }));
}

/** Price text such as "3 Assorted Seeds" or "15,000 Coins"; several costs are joined with commas. */
export function priceText(cost: Amount[] | undefined, refOf: RefOf, formatNumber: FormatNumber): string {
  return (cost ?? []).map((a) => `${formatNumber(a.quantity)} ${refOf(a.itemId).name}`).join(', ');
}

export function priceOfLine(line: WhatsNewTradeLine, refOf: RefOf, formatNumber: FormatNumber, scrapLabel: (value: string) => string): string {
  if (line.cost?.length) return priceText(line.cost, refOf, formatNumber);
  if (line.scrapValue !== undefined) return scrapLabel(formatNumber(line.scrapValue));
  return '';
}

export interface AnvilLabels {
  craft: string;
  upgrade: (from: string, to: string) => string;
  repair: (tier: string) => string;
}

export function anvilRowLabel(row: AnvilRow, labels: AnvilLabels): string {
  if (row.kind === 'craft') return labels.craft;
  if (row.kind === 'upgrade') return labels.upgrade(romanTier(row.fromTier ?? row.tier - 1), romanTier(row.tier));
  return labels.repair(romanTier(row.tier));
}

const ANVIL_SLUGS = ['', 'anvil_i', 'anvil_ii', 'anvil_iii', 'anvil_iv'];

function compareRow(key: string, item: ItemRef, before: Amount[] | undefined, after: Amount[] | undefined, refOf: RefOf, sublabel?: string): CompareRow {
  return {
    key,
    item: { item, sublabel },
    before: toCosts(before, refOf),
    now: toCosts(after, refOf),
  };
}

/** Rows of the recipes block: the non-Anvil recipes, then the Anvil chain. */
export function buildRecipeRows(changes: WhatsNewChanges | undefined, refOf: RefOf, labels: AnvilLabels) {
  const others = otherRecipes(changes).map((r) => compareRow(`recipe-${r.result}`, refOf(r.result), r.before, r.after, refOf));
  const anvil = buildAnvilRows(changes).map((row) =>
    compareRow(`anvil-${row.kind}-${row.tier}`, refOf(ANVIL_SLUGS[row.tier] ?? 'anvil_i'), row.before, row.after, refOf, anvilRowLabel(row, labels)),
  );
  return { others, anvil };
}

/** Recycling rows (item, before outputs, now outputs); Anvil tiers keep their tier order after the others. */
export function buildRecyclingRows(changes: WhatsNewChanges | undefined, refOf: RefOf): CompareRow[] {
  const all = (changes?.recycling ?? []).map((r, i) => ({ r, i, tier: anvilTier(r.id) }));
  all.sort((a, b) => (a.tier ? 1 : 0) - (b.tier ? 1 : 0) || (a.tier ?? 0) - (b.tier ?? 0) || a.i - b.i);
  return all.map(({ r }) => compareRow(`recycle-${r.id}`, refOf(r.id), r.before, r.after, refOf));
}

export interface StashRow {
  key: string;
  slots: number;
  before?: string;
  now: string;
  isNew: boolean;
  changed: boolean;
}

/** Stash expansions ordered by size; `slots` is the size reached by the expansion. */
export function buildStashRows(changes: WhatsNewChanges | undefined, refOf: RefOf, formatNumber: FormatNumber): StashRow[] {
  return [...(changes?.stash ?? [])]
    .sort((a, b) => a.from - b.from)
    .map((s) => {
      const before = s.before?.length ? priceText(s.before, refOf, formatNumber) : undefined;
      const now = priceText(s.after, refOf, formatNumber);
      return { key: `stash-${s.from}`, slots: s.to, before, now, isNew: before === undefined, changed: before !== now };
    });
}

export interface TraderView {
  npc: string;
  added: WhatsNewTradeLine[];
  removed: WhatsNewTradeLine[];
  prices: CompareRow[];
}

export function buildTraderPrices(
  priceChanged: { result: string; before?: Amount[]; after?: Amount[] }[] | undefined,
  refOf: RefOf,
): CompareRow[] {
  return (priceChanged ?? []).map((p) => compareRow(`price-${p.result}`, refOf(p.result), p.before, p.after, refOf));
}
