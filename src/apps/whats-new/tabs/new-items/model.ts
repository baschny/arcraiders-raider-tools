import type { WhatsNewKeepPath } from '../../../../shared/gamedata/types';
import type { GlyphName, ItemRef } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';
import {
  DECORATION_ITEMS,
  FALLEN_EMPEROR_ITEMS,
  GEAR_CATEGORIES,
  PENDOLA_KEYS,
  QUEST_ITEMS_WITHOUT_OBJECTIVE,
} from './curated';
import { GUNSMITH_BENCH, RESEARCH_BENCH, purposeOfUse, type PurposeContext } from './groups';
import { benchLevelLabel, researchedRef, type HoverContext, type HoverSource, unlockRows } from './hover';
import { benchLevelImage } from './refs';
import { rarityRank } from './uses';

export const RP_ITEM = 'research_points';

/** Ids of the groups below the unlock cards, in display order. */
export const NEW_GROUP_ORDER = [
  'researchPoints',
  'researchBlueprints',
  'amplified',
  'newGear',
  'fallenEmperor',
  'crafting',
  'furnitureDecoration',
  'stencils',
  'keys',
  'trades',
  'noUse',
] as const;

export type NewGroupId = (typeof NEW_GROUP_ORDER)[number];

/** One tile of a group. */
export interface TileEntry {
  id: string;
  amount?: number | string;
  isBlueprint?: boolean;
}

export interface NewGroup {
  id: NewGroupId;
  entries: TileEntry[];
}

/** One unlock card: what a one-time unlock costs. */
export interface UnlockCard {
  id: string;
  title: string;
  /** Bench image, or a glyph when there is none, or the quest icon. */
  image?: string;
  glyph?: GlyphName;
  quest?: boolean;
  /** Outpost levels: the rooms to pick one from. */
  rooms?: ItemRef[];
  items: { id: string; amount?: number }[];
}

export interface RpScale {
  min?: { rp: number; name: string };
  median?: { rp: number };
  max?: { rp: number; name: string };
  /** The study item worth the most Research Points. */
  topStudy?: { item: ItemRef; rp: number };
}

export interface NewItemsModel {
  cards: UnlockCard[];
  groups: NewGroup[];
  /** Hover sources of every shown item (and the derived gear). */
  sources: Map<string, HoverSource>;
  rpScale: RpScale;
  /** Study items with their other (one-time) uses, for the Research Points callout. */
  studyCallout: { id: string; rows: ReturnType<typeof unlockRows> }[];
}

const VERSION = 'frozen-trail';

/** Items a player can carry: no currency, no research tokens, no counters (items without a category). */
export function isInventoryItem(data: WhatsNewPageData, slug: string): boolean {
  const item = data.catalog.items[data.catalog.aliases[slug] ?? slug];
  const category = item?.category;
  if (!category || category === 'None') return false;
  return category !== 'Currency' && category !== 'Research' && !category.startsWith('Online');
}

export function isBlueprintItem(data: WhatsNewPageData, slug: string, unlocks?: Map<string, string | undefined>): boolean {
  const item = data.catalog.items[data.catalog.aliases[slug] ?? slug];
  return item?.category === 'Recipe' || !!unlocks?.has(slug);
}

const byRarityThenName = (data: WhatsNewPageData) => (a: string, b: string) => {
  const ia = toItemRef(data.catalog, a);
  const ib = toItemRef(data.catalog, b);
  return rarityRank(ib.rarity) - rarityRank(ia.rarity) || ia.name.localeCompare(ib.name);
};

/** Cost tiles of a keep-path step. */
function stepItems(path: WhatsNewKeepPath | undefined, index: number): UnlockCard['items'] {
  return (path?.steps[index]?.cost ?? []).map((a) => ({ id: a.itemId, amount: a.quantity }));
}

function stepLevel(label: string, fallback: number): number {
  if (/build/i.test(label)) return 1;
  const n = label.match(/(\d+)\s*$/);
  return n ? Number(n[1]) : fallback;
}

/** Rooms offered at an Outpost expansion from `level` (without the base room). */
function roomsAt(data: WhatsNewPageData, level: number): ItemRef[] {
  return Object.values(data.outpost?.structure.rooms ?? {})
    .filter((room) => room.crafts?.some((c) => c.requires?.some((r) => r.kind === 'outpostLevel' && Number(r.id) === level)))
    .map((room) => toItemRef(data.catalog, room.id));
}

function unlockCards(data: WhatsNewPageData, ctx: HoverContext): UnlockCard[] {
  const { tm } = ctx;
  const paths = data.whatsNew?.versions[VERSION]?.keepPaths ?? [];
  const path = (id: string) => paths.find((p) => p.id === id);
  const cards: UnlockCard[] = [];

  const outposts = path('outpostExpansions');
  outposts?.steps.forEach((_, i) => {
    const from = i + 1;
    cards.push({
      id: `outpost-${from}`,
      title: tm('whatsNew.new-items.unlocks.outpost', { from, to: from + 1 }),
      glyph: 'outpost',
      rooms: roomsAt(data, from),
      items: stepItems(outposts, i),
    });
  });

  const station = path('researchStation');
  station?.steps.forEach((step, i) => {
    const level = stepLevel(step.label, i + 1);
    cards.push({
      id: `station-${level}`,
      title: benchLevelLabel(ctx, RESEARCH_BENCH, level),
      image: benchLevelImage(data, RESEARCH_BENCH, level),
      glyph: 'research-station',
      items: stepItems(station, i),
    });
  });

  const gunsmith = path('gunsmith4');
  gunsmith?.steps.forEach((step, i) => {
    const level = stepLevel(step.label, 4);
    cards.push({
      id: `gunsmith-${level}`,
      title: benchLevelLabel(ctx, GUNSMITH_BENCH, level),
      image: benchLevelImage(data, GUNSMITH_BENCH, level),
      glyph: 'gunsmith',
      items: stepItems(gunsmith, i),
    });
  });

  return cards;
}

/** Plans cost 500–5,000 RP: the cheapest, the median and the most expensive plan of the research domain. */
function buildRpScale(data: WhatsNewPageData, ctx: HoverContext): RpScale {
  const plans: { rp: number; level: number; reward: string }[] = [];
  for (const o of Object.values(data.research?.structure.research ?? {})) {
    const reward = o.rewards?.[0]?.itemId;
    if (!reward || reward === RP_ITEM) continue;
    const items = o.cost && 'items' in o.cost ? o.cost.items : [];
    plans.push({ rp: items.find((a) => a.itemId === RP_ITEM)?.quantity ?? o.researchPoints, level: o.benchLevel, reward });
  }
  const nameOfPlan = (reward: string) => researchedRef(ctx, reward).name;
  const sorted = plans.filter((p) => p.rp > 0).sort((a, b) => a.rp - b.rp || a.level - b.level || nameOfPlan(a.reward).localeCompare(nameOfPlan(b.reward)));
  const scale: RpScale = {};
  if (sorted.length > 0) {
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    scale.min = { rp: min.rp, name: nameOfPlan(min.reward) };
    scale.median = { rp: sorted[Math.floor(sorted.length / 2)].rp };
    scale.max = { rp: max.rp, name: nameOfPlan(max.reward) };
  }
  let top: { id: string; rp: number } | undefined;
  for (const [id, rp] of ctx.rpGiven) if (!top || rp > top.rp) top = { id, rp };
  if (top) scale.topStudy = { item: toItemRef(data.catalog, top.id), rp: top.rp };
  return scale;
}

/** New 2.0 gear derived from the catalog: base-tier weapons, gadgets and grenades, each followed by its blueprint. */
function newGearEntries(data: WhatsNewPageData, exclude: ReadonlySet<string>): TileEntry[] {
  const { catalog } = data;
  const blueprintOf = new Map<string, string>();
  for (const b of Object.values(data.blueprints?.structure.blueprints ?? {})) {
    if (b.unlocksItemId) blueprintOf.set(b.unlocksItemId, b.blueprintItemId);
  }
  const rank = (cat: string | undefined) => (cat?.startsWith('Firearm.') ? 0 : cat === GEAR_CATEGORIES.gadget ? 1 : 2);
  const gear = Object.values(catalog.items)
    .filter((i) => {
      if (i.addedIn !== '2.0' || exclude.has(i.id) || i.amplifiedFrom) return false;
      if (i.category?.startsWith('Firearm.')) return (i.tier ?? 1) === 1;
      return i.category === GEAR_CATEGORIES.gadget || i.category === GEAR_CATEGORIES.grenade;
    })
    .sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
  const entries: TileEntry[] = [];
  for (const item of gear) {
    entries.push({ id: item.id });
    const bp = blueprintOf.get(item.id);
    if (bp && catalog.items[catalog.aliases[bp] ?? bp]) entries.push({ id: bp, isBlueprint: true });
  }
  return entries;
}

const purposeCtx: PurposeContext = { isAmplified: (slug) => slug.includes('amplified') };

/** Builds the New items page: unlock cards first, then the tile groups of the spec, in order. */
export function buildNewItemsModel(data: WhatsNewPageData, ctx: HoverContext): NewItemsModel {
  const { catalog } = data;
  const version = data.whatsNew?.versions[VERSION];
  const shown: HoverSource[] = (version?.newItems ?? [])
    .filter((i) => isInventoryItem(data, i.id))
    .map((i) => ({ id: i.id, uses: i.uses, recyclesInto: i.recyclesInto }));
  const groupOf = new Map((version?.newItems ?? []).map((i) => [i.id, i.group]));
  const sources = new Map<string, HoverSource>(shown.map((s) => [s.id, s]));
  const compare = byRarityThenName(data);
  const exists = (id: string) => !!catalog.items[catalog.aliases[id] ?? id];

  const usesOf = (s: HoverSource) => s.uses ?? [];
  const purposes = (s: HoverSource) => new Set(usesOf(s).map((u) => purposeOfUse(u, purposeCtx)));
  const ids = (list: HoverSource[]) => list.map((s) => s.id);
  const placed = new Set<string>();
  const groups: NewGroup[] = [];
  const add = (id: NewGroupId, entries: TileEntry[]) => {
    if (entries.length === 0) return;
    groups.push({ id, entries });
    entries.forEach((e) => placed.add(e.id));
  };

  const cards = unlockCards(data, ctx);
  cards.forEach((c) => c.items.forEach((i) => placed.add(i.id)));
  // Quest items are not part of this overview: items only needed for quests, and quest items without objective.
  const questOnly = (s: HoverSource) => usesOf(s).length > 0 && usesOf(s).every((u) => u.system === 'quest' || u.system === 'project');
  shown.filter((s) => questOnly(s) || QUEST_ITEMS_WITHOUT_OBJECTIVE.includes(s.id)).forEach((s) => placed.add(s.id));

  // Research Points: the study items, cheapest first.
  const study = shown.filter((s) => groupOf.get(s.id) === 'study').sort((a, b) => (ctx.rpGiven.get(a.id) ?? 0) - (ctx.rpGiven.get(b.id) ?? 0));
  add('researchPoints', study.map((s) => ({ id: s.id, amount: `+${ctx.tm('whatsNew.research.rpAmount', { n: ctx.rpGiven.get(s.id) ?? 0 })}` })));

  // Researching blueprints: materials of research offers (not the Research Points conversion).
  const researching = shown.filter((s) => usesOf(s).some((u) => u.system === 'research' && u.target !== RP_ITEM)).sort((a, b) => compare(a.id, b.id));
  add('researchBlueprints', ids(researching).map((id) => ({ id })));

  // Amplified: modules, then perk parts, then the rest.
  const ampRank = (id: string) => (groupOf.get(id) === 'module' ? 0 : groupOf.get(id) === 'perkPart' ? 1 : 2);
  const amplified = shown.filter((s) => purposes(s).has('amplified')).sort((a, b) => ampRank(a.id) - ampRank(b.id) || compare(a.id, b.id));
  add('amplified', ids(amplified).map((id) => ({ id })));

  // Fallen Emperor first claims its items so the gear derivation leaves them out.
  const emperor = FALLEN_EMPEROR_ITEMS.filter(exists);
  add('newGear', newGearEntries(data, new Set(emperor)));
  add('fallenEmperor', emperor.map((id) => ({ id })));

  add('crafting', ids(shown.filter((s) => purposes(s).has('crafting')).sort((a, b) => compare(a.id, b.id))).map((id) => ({ id })));

  const furniture = shown.filter((s) => purposes(s).has('furniture')).sort((a, b) => compare(a.id, b.id));
  add('furnitureDecoration', [...ids(furniture), ...DECORATION_ITEMS.filter(exists)].filter((id, i, all) => all.indexOf(id) === i).map((id) => ({ id })));

  add('stencils', ids(shown.filter((s) => purposes(s).has('stencils')).sort((a, b) => compare(a.id, b.id))).map((id) => ({ id })));
  add('keys', PENDOLA_KEYS.filter(exists).map((id) => ({ id })));
  add('trades', ids(shown.filter((s) => purposes(s).has('trades')).sort((a, b) => compare(a.id, b.id))).map((id) => ({ id })));

  // Whatever no group claimed (should be nothing).
  const left = shown.filter((s) => !placed.has(s.id)).sort((a, b) => compare(a.id, b.id));
  add('noUse', ids(left).map((id) => ({ id })));

  // Derived gear, curated items and old items in unlock costs still need a hover source.
  const existing = new Map((version?.existingItems ?? []).map((i) => [i.id, i]));
  const addSource = (id: string) => {
    if (sources.has(id)) return;
    const old = existing.get(id);
    sources.set(id, { id, uses: old?.gained, lost: old?.lost });
  };
  groups.forEach((g) => g.entries.forEach((e) => addSource(e.id)));
  cards.forEach((c) => c.items.forEach((i) => addSource(i.id)));

  return {
    cards,
    groups,
    sources,
    rpScale: buildRpScale(data, ctx),
    studyCallout: study.map((s) => ({ id: s.id, rows: unlockRows(ctx, s) })).filter((s) => s.rows.length > 0),
  };
}

