import { ListTodo } from 'lucide-react';
import { nameOf } from '../../../../shared/gamedata/loader';
import type { Amount, WhatsNewUse } from '../../../../shared/gamedata/types';
import { GlyphIcon, type HoverRow, type HoverSection, type ItemRef } from '../../components';
import { toItemRef, toUnlockedRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { benchLevelImage, resolveTargetView, resolveWhere, unlockMap, type RefLabels } from './refs';
import { RESEARCH_BENCH } from './groups';

/** The item behind a hover card: its uses (all of them, not just the group's) and recycling. */
export interface HoverSource {
  id: string;
  uses?: WhatsNewUse[];
  /** Old items: uses the item lost. */
  lost?: WhatsNewUse[];
  recyclesInto?: Amount[];
}

type T = (key: string) => string;
type TM = (key: string, replacements: Record<string, string | number>) => string;

export interface HoverContext {
  data: WhatsNewPageData;
  t: T;
  tm: TM;
  labels: RefLabels;
  /** `blueprintItemId` to the item it unlocks. */
  blueprintUnlocks: Map<string, string | undefined>;
  /** Design item to the furniture it unlocks. */
  designUnlocks: Map<string, string | undefined>;
  /** Reward item to its first research offer. */
  offers: Map<string, { rp: number; level: number }>;
  /** Study item to the Research Points it gives. */
  rpGiven: Map<string, number>;
}

const RP_ITEM = 'research_points';
const MAX_ROWS = 6;
const MAX_RESEARCH_ROWS = 8;

function costItems(cost: unknown): Amount[] {
  return cost && typeof cost === 'object' && 'items' in cost ? ((cost as { items: Amount[] }).items ?? []) : [];
}

export function createHoverContext(data: WhatsNewPageData, t: T, tm: TM): HoverContext {
  const labels: RefLabels = {
    level: (bench, level) => tm('whatsNew.new-items.detail.level', { bench, level }),
    slots: (slots) => tm('whatsNew.new-items.detail.slots', { n: slots }),
  };
  const offers = new Map<string, { rp: number; level: number }>();
  const rpGiven = new Map<string, number>();
  for (const o of Object.values(data.research?.structure.research ?? {})) {
    const reward = o.rewards?.[0];
    if (!reward) continue;
    const items = costItems(o.cost);
    if (reward.itemId === RP_ITEM) {
      if (items[0]) rpGiven.set(items[0].itemId, reward.quantity);
      continue;
    }
    if (offers.has(reward.itemId)) continue;
    offers.set(reward.itemId, { rp: items.find((a) => a.itemId === RP_ITEM)?.quantity ?? o.researchPoints, level: o.benchLevel });
  }
  const designUnlocks = new Map(Object.values(data.outpost?.structure.designs ?? {}).map((d) => [d.id, d.unlocks?.[0]]));
  return { data, t, tm, labels, blueprintUnlocks: data.blueprints ? unlockMap(data) : new Map(), designUnlocks, offers, rpGiven };
}

export const formatRp = (rp: number): string => rp.toLocaleString('en-US');

/** "Research Station level 2", "Research Station build" for level 1. */
export function benchLevelLabel(ctx: HoverContext, bench: string, level: number): string {
  const name = ctx.data.benches ? nameOf(ctx.data.benches, bench, ctx.data.benches.structure.benches[bench]?.nameEn ?? undefined) : bench;
  return bench === RESEARCH_BENCH && level === 1 ? ctx.tm('whatsNew.new-items.hover.build', { bench: name }) : ctx.labels.level(name, level);
}

/** Outpost expansion (level N to N+1) whose room cost contains `amount` of the item, if any. */
export function outpostExpansionOf(data: WhatsNewPageData, use: WhatsNewUse, itemId: string): number | null {
  if (use.system !== 'outpostRoom' || typeof use.target !== 'string') return null;
  const room = data.outpost?.structure.rooms[use.target];
  for (const craft of room?.crafts ?? []) {
    if (!costItems(craft.cost).some((a) => a.itemId === itemId && a.quantity === use.amount)) continue;
    const need = craft.requires?.find((r) => r.kind === 'outpostLevel');
    if (need) return Number(need.id);
  }
  return null;
}

const isStash = (u: WhatsNewUse) => typeof u.target === 'object' && 'stashSlots' in u.target;
const times = (n: number) => `${n}×`;

function benchRef(target: WhatsNewUse['target']): { bench: string; level: number } | null {
  return typeof target === 'object' && 'bench' in target ? target : null;
}

/** The unlocked item behind a researched blueprint / design (item itself as fallback). */
export function researchedRef(ctx: HoverContext, target: string): ItemRef {
  const { catalog } = ctx.data;
  if (ctx.blueprintUnlocks.has(target)) return toUnlockedRef(catalog, target, ctx.blueprintUnlocks.get(target));
  const furniture = ctx.designUnlocks.get(target);
  return toItemRef(catalog, furniture ?? target);
}

function capped(rows: HoverRow[], max: number): Pick<HoverSection, 'rows' | 'more'> {
  return { rows: rows.slice(0, max), more: Math.max(0, rows.length - max) };
}

function dedupe(rows: HoverRow[]): HoverRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

/** The one-time unlocks of an item, as hover rows (also used by the Research Points callout). */
export function unlockRows(ctx: HoverContext, source: HoverSource): HoverRow[] {
  const { data, t, tm } = ctx;
  const rows: HoverRow[] = [];
  for (const use of source.uses ?? []) {
    if (isStash(use)) continue;
    if (use.system === 'outpostRoom') {
      const from = outpostExpansionOf(data, use, source.id);
      if (from === null) continue;
      rows.push({
        key: `outpost-${from}`,
        glyph: <GlyphIcon name="outpost" size={28} />,
        label: tm('whatsNew.new-items.unlocks.outpost', { from, to: from + 1 }),
        detail: t('whatsNew.outpost.pickOne'),
        amount: times(use.amount),
      });
    } else if (use.system === 'researchStation' || use.system === 'benchUpgrade') {
      const ref = benchRef(use.target);
      if (!ref) continue;
      rows.push({
        key: `bench-${ref.bench}-${ref.level}`,
        image: benchLevelImage(data, ref.bench, ref.level),
        label: benchLevelLabel(ctx, ref.bench, ref.level),
        amount: times(use.amount),
      });
    }
  }
  return dedupe(rows);
}

export interface HoverContent {
  subtitle?: string;
  sections: HoverSection[];
}

/**
 * One row per Amplified weapon instead of one per perk permutation
 * (`osprey_amplified_scoped_x` → `osprey_amplified`): the amount range and how many upgrades use it.
 */
function byAmplifiedWeapon(
  rows: HoverRow[],
  ref: (slug: string) => ItemRef,
  tm: HoverContext['tm'],
): HoverRow[] {
  const groups = new Map<string, { row: HoverRow; amounts: number[]; repair: boolean }>();
  for (const row of rows) {
    const slug = row.key.replace(/^repair-/, '');
    const cut = slug.indexOf('_amplified');
    const base = cut >= 0 ? slug.slice(0, cut + '_amplified'.length) : slug;
    const repair = row.key.startsWith('repair-');
    const key = `${repair ? 'repair-' : ''}${base}`;
    const g = groups.get(key) ?? { row: { ...row, key, item: ref(base), label: ref(base).name }, amounts: [], repair };
    const n = Number.parseInt(row.amount ?? '', 10);
    if (Number.isFinite(n)) g.amounts.push(n);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ row, amounts, repair }) => {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const amount = amounts.length ? (min === max ? `${min}×` : `${min}–${max}×`) : row.amount;
    const detail = repair ? row.detail : tm('whatsNew.new-items.hover.upgrades', { n: amounts.length || 1 });
    return { ...row, amount, detail };
  });
}

/** All hover sections of an item, built from every one of its uses. */
export function buildHover(ctx: HoverContext, source: HoverSource): HoverContent {
  const { data, t, tm } = ctx;
  const { catalog } = data;
  const uses = source.uses ?? [];
  const isAmplified = (slug: string) => slug.includes('amplified');
  const ref = (slug: string) => toItemRef(catalog, slug);
  const withoutStash = uses.filter((u) => !isStash(u));

  const craft: HoverRow[] = [];
  const amplified: HoverRow[] = [];
  const research: HoverRow[] = [];
  const furniture: HoverRow[] = [];
  const quests: HoverRow[] = [];
  const traders: HoverRow[] = [];
  const gives: HoverRow[] = [];

  for (const use of withoutStash) {
    const target = typeof use.target === 'string' ? use.target : null;
    switch (use.system) {
      case 'craft': {
        if (!target) break;
        const where = resolveWhere(data, use, ctx.labels, '');
        craft.push({ key: target, item: ref(target), label: ref(target).name, detail: where?.label, amount: times(use.amount) });
        break;
      }
      case 'fieldCraft':
        if (target) craft.push({ key: target, item: ref(target), label: ref(target).name, detail: t('whatsNew.new-items.hover.fieldCraft'), amount: times(use.amount) });
        break;
      case 'repair':
        if (!target) break;
        (isAmplified(target) ? amplified : craft).push({
          key: `repair-${target}`,
          item: ref(target),
          label: ref(target).name,
          detail: t('whatsNew.new-items.hover.repair'),
          amount: times(use.amount),
        });
        break;
      case 'amplify':
      case 'amplifyPerk':
        if (target) amplified.push({ key: target, item: ref(target), label: ref(target).name, amount: times(use.amount) });
        break;
      case 'research': {
        if (!target) break;
        if (target === RP_ITEM) {
          const rp = ctx.rpGiven.get(source.id);
          if (rp) gives.push({ key: 'rp', item: ref(RP_ITEM), label: ref(RP_ITEM).name, amount: `+${rp}` });
          break;
        }
        const offer = ctx.offers.get(target);
        const shown = researchedRef(ctx, target);
        const level = offer?.level ?? benchRef(use.via ?? '')?.level;
        research.push({
          key: target,
          item: shown,
          isBlueprint: true,
          label: shown.name,
          detail: level
            ? offer
              ? tm('whatsNew.new-items.hover.researchDetail', { level, rp: formatRp(offer.rp) })
              : tm('whatsNew.new-items.hover.researchLevel', { level })
            : undefined,
          amount: times(use.amount),
        });
        break;
      }
      case 'outpostFurniture':
        if (target) furniture.push({ key: target, item: ref(target), label: ref(target).name, amount: times(use.amount) });
        break;
      case 'quest':
      case 'project': {
        if (!target) break;
        const view = resolveTargetView(data, use, target, new Map(), ctx.labels);
        quests.push({
          key: `${use.system}-${target}`,
          glyph: <ListTodo size={24} aria-hidden="true" />,
          label: view.kind === 'generic' ? view.label : view.item.name,
          amount: times(use.amount),
        });
        break;
      }
      case 'trade': {
        const where = resolveWhere(data, use, ctx.labels, '');
        if (!where) break;
        traders.push({
          key: `${where.key}-${target}`,
          image: where.image,
          label: where.label,
          detail: target ? tm('whatsNew.new-items.hover.tradeFor', { item: ref(target).name }) : undefined,
          amount: times(use.amount),
        });
        break;
      }
      default:
        break;
    }
  }

  const recycles = (source.recyclesInto ?? []).map<HoverRow>((a) => ({
    key: a.itemId,
    item: ref(a.itemId),
    label: ref(a.itemId).name,
    amount: times(a.quantity),
  }));

  const lostSeen = new Set<string>();
  const lost: HoverRow[] = [];
  for (const use of source.lost ?? []) {
    if (isStash(use)) continue;
    const view = resolveTargetView(data, use, use.target, ctx.blueprintUnlocks, ctx.labels);
    if (lostSeen.has(view.key)) continue;
    lostSeen.add(view.key);
    lost.push(
      view.kind === 'tile'
        ? { key: view.key, item: view.item, label: view.item.name, isBlueprint: view.isBlueprint }
        : { key: view.key, glyph: <ListTodo size={24} aria-hidden="true" />, label: view.label },
    );
  }

  const furnitureRows = dedupe(furniture);
  const sections: HoverSection[] = [
    { key: 'unlocks', title: t('whatsNew.new-items.hover.unlocks'), rows: unlockRows(ctx, source) },
    { key: 'craft', title: t('whatsNew.new-items.hover.craft'), ...capped(dedupe(craft), MAX_ROWS) },
    { key: 'research', title: t('whatsNew.new-items.hover.research'), ...capped(dedupe(research), MAX_RESEARCH_ROWS) },
    { key: 'amplified', title: t('whatsNew.new-items.hover.amplified'), ...capped(byAmplifiedWeapon(amplified, ref, tm), MAX_ROWS) },
    { key: 'furniture', title: tm('whatsNew.new-items.hover.furniture', { n: furnitureRows.length }), ...capped(furnitureRows, MAX_ROWS) },
    { key: 'quests', title: t('whatsNew.new-items.hover.quests'), ...capped(dedupe(quests), MAX_ROWS) },
    { key: 'traders', title: t('whatsNew.new-items.hover.traders'), ...capped(dedupe(traders), MAX_ROWS) },
    { key: 'gives', title: t('whatsNew.new-items.hover.gives'), rows: gives },
    { key: 'recycles', title: t('whatsNew.new-items.recycles'), rows: recycles },
    { key: 'lost', title: t('whatsNew.old-items.noLonger'), ...capped(lost, MAX_ROWS) },
  ];
  const item = catalog.items[catalog.aliases[source.id] ?? source.id];
  return { subtitle: item?.categoryName || undefined, sections: sections.filter((s) => s.rows.length > 0) };
}
