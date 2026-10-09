import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { toItemRef, toUnlockedRef } from '../../hooks/useWhatsNewData';
import type { ItemRef } from '../../components';
import { RARITIES } from '../../../../shared/gamedata/types';

export interface AmountRef {
  item: ItemRef;
  quantity?: number;
}

export const RESEARCH_BENCH = 'research_station';
export const RP_ITEM = 'research_points';

export interface StudyItem {
  item: ItemRef;
  rp: number;
}

export interface StationLevel {
  level: number;
  icon?: string;
  cost: AmountRef[];
  /** Outpost rooms required (from the outpostLevel requirement). */
  rooms?: number;
}

export interface ResearchedBlueprint {
  offerId: string;
  item: ItemRef;
  /** The item the blueprint unlocks (icon and name for display). */
  unlocks: ItemRef;
  rp: number;
  level: number;
  isNew: boolean;
  /** Materials including Research Points. */
  inputs: AmountRef[];
}

export interface ResearchedDesign {
  offerId: string;
  /** The furniture piece the design unlocks (`outpost.designs[].unlocks[0]`), or the design item. */
  item: ItemRef;
  rp: number;
  level: number;
  inputs: AmountRef[];
}

export interface ResearchData {
  rp: ItemRef;
  study: StudyItem[];
  levels: StationLevel[];
  blueprintCount: number;
  designCount: number;
  designs: ResearchedDesign[];
  /** Designs that cannot be researched, shown as the furniture they unlock. */
  findOnlyDesigns: ItemRef[];
  amplifiedCount: number;
  /** Lowest station level that offers amplified research. */
  amplifiedLevel: number;
  /** One representative reward icon per track. */
  samples: { blueprint?: ItemRef; design?: ItemRef; amplified?: ItemRef };
  craftable: ResearchedBlueprint[];
  /** Blueprints that cannot be researched, shown as the item they unlock. */
  findOnly: ItemRef[];
}

const isDesign = (category?: string) => !!category && (category.startsWith('Recipe.') || category.startsWith('Furniture'));

/** Everything the Research section shows, derived from the research, blueprints, benches and items domains. */
export function buildResearchData(data: WhatsNewPageData): ResearchData {
  const { catalog } = data;
  const offers = Object.values(data.research.structure.research);
  const ref = (slug: string) => toItemRef(catalog, slug);
  const cat = (slug: string) => catalog.items[catalog.aliases[slug] ?? slug]?.category;

  // Acquire Research Points: offers that reward the RP item, ordered by value.
  const study: StudyItem[] = offers
    .filter((o) => o.rewards?.[0]?.itemId === RP_ITEM)
    .map((o) => {
      const first = o.cost && 'items' in o.cost ? o.cost.items[0] : undefined;
      return first ? { item: ref(first.itemId), rp: o.rewards![0].quantity } : null;
    })
    .filter((s): s is StudyItem => s !== null)
    .sort((a, b) => a.rp - b.rp);

  // Station build and upgrade costs.
  const bench = data.benches.structure.benches[RESEARCH_BENCH];
  const levels: StationLevel[] = (bench?.levels ?? []).map((l) => {
    const rooms = l.requires?.find((r) => r.kind === 'outpostLevel');
    return {
      level: l.level,
      icon: l.icon ?? undefined,
      cost: (l.buildCost ?? []).map((a) => ({ item: ref(a.itemId), quantity: a.quantity })),
      rooms: rooms ? Number(rooms.id) : undefined,
    };
  });

  // Classify the research offers by what they reward.
  const blueprintItems = new Set(Object.values(data.blueprints.structure.blueprints).map((b) => b.blueprintItemId));
  const unlockedBy = new Map(Object.values(data.blueprints.structure.blueprints).map((b) => [b.blueprintItemId, b.unlocksItemId]));
  const unlocked = (slug: string) => toUnlockedRef(catalog, slug, unlockedBy.get(slug));
  const craftable: ResearchedBlueprint[] = [];
  const designs: ResearchedDesign[] = [];
  const designUnlocks = new Map(Object.values(data.outpost.structure.designs).map((d) => [d.id, d.unlocks?.[0]]));
  const furniture = (slug: string) => ref(designUnlocks.get(slug) ?? slug);
  let amplifiedCount = 0;
  let amplifiedLevel = 4;
  const samples: ResearchData['samples'] = {};
  for (const o of offers) {
    const reward = o.rewards?.[0]?.itemId;
    if (!reward || reward === RP_ITEM) continue;
    const category = cat(reward);
    if (category === 'Research') {
      amplifiedCount++;
      samples.amplified ??= ref(reward);
      amplifiedLevel = Math.min(amplifiedLevel, o.benchLevel);
    } else if (isDesign(category) && !blueprintItems.has(reward)) {
      const items = o.cost && 'items' in o.cost ? o.cost.items : [];
      designs.push({
        offerId: o.id,
        item: furniture(reward),
        rp: items.find((a) => a.itemId === RP_ITEM)?.quantity ?? o.researchPoints,
        level: o.benchLevel,
        inputs: items.map((a) => ({ item: ref(a.itemId), quantity: a.quantity })),
      });
      samples.design ??= furniture(reward);
    } else {
      const items = o.cost && 'items' in o.cost ? o.cost.items : [];
      const rpAmount = items.find((a) => a.itemId === RP_ITEM)?.quantity ?? o.researchPoints;
      craftable.push({
        offerId: o.id,
        item: ref(reward),
        unlocks: unlocked(reward),
        rp: rpAmount,
        level: o.benchLevel,
        isNew: (catalog.items[catalog.aliases[reward] ?? reward]?.addedIn ?? '') === '2.0',
        inputs: items.map((a) => ({ item: ref(a.itemId), quantity: a.quantity })),
      });
    }
  }
  designs.sort((a, b) => a.level - b.level || a.rp - b.rp || a.item.name.localeCompare(b.item.name));
  craftable.sort((a, b) => a.level - b.level || a.rp - b.rp || a.item.name.localeCompare(b.item.name));

  samples.blueprint = craftable.find((c) => blueprintItems.has(c.item.id))?.item ?? craftable[0]?.item;
  const researched = new Set(craftable.map((c) => c.item.id));
  const findOnly = [...blueprintItems]
    .filter((id) => !researched.has(id))
    .map(unlocked)
    .sort((a, b) => a.name.localeCompare(b.name));

  const researchedDesigns = new Set(offers.map((o) => o.rewards?.[0]?.itemId));
  const findOnlyDesigns = Object.values(data.outpost.structure.designs)
    .filter((d) => !researchedDesigns.has(d.id))
    .map((d) => furniture(d.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rp: ref(RP_ITEM),
    study,
    levels,
    blueprintCount: craftable.length,
    designCount: designs.length,
    designs,
    findOnlyDesigns,
    amplifiedCount,
    amplifiedLevel,
    samples,
    craftable,
    findOnly,
  };
}

/** One researchable entry (blueprint or design) as the browse lists show it. */
export interface ResearchOffer {
  offerId: string;
  item: ItemRef;
  rp: number;
  level: number;
  inputs: AmountRef[];
}

export interface PriceGroup<T extends ResearchOffer> {
  rp: number;
  offers: T[];
}

export interface LevelGroup<T extends ResearchOffer> {
  level: number;
  prices: PriceGroup<T>[];
}

/** Groups offers by station level, then by RP price, both ascending; empty groups do not exist. */
export function groupByLevelAndPrice<T extends ResearchOffer>(offers: readonly T[]): LevelGroup<T>[] {
  const levels = new Map<number, Map<number, T[]>>();
  for (const o of offers) {
    const prices = levels.get(o.level) ?? new Map<number, T[]>();
    prices.set(o.rp, [...(prices.get(o.rp) ?? []), o]);
    levels.set(o.level, prices);
  }
  return [...levels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, prices]) => ({
      level,
      prices: [...prices.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rp, list]) => ({ rp, offers: [...list].sort((a, b) => a.item.name.localeCompare(b.item.name)) })),
    }));
}

/** Rarity Common to Legendary, then alphabetical by (localized) name; items without a rarity come last. */
export function sortByRarityThenName(items: readonly ItemRef[]): ItemRef[] {
  const rank = (i: ItemRef) => {
    const idx = RARITIES.indexOf(i.rarity as (typeof RARITIES)[number]);
    return idx < 0 ? RARITIES.length : idx;
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
