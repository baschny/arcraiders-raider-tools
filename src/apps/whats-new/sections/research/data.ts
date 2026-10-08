import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { toItemRef, toUnlockedRef } from '../../hooks/useWhatsNewData';
import type { AmountRef, ItemRef } from '../../components';

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

export interface ResearchData {
  rp: ItemRef;
  study: StudyItem[];
  levels: StationLevel[];
  blueprintCount: number;
  designCount: number;
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
  let designCount = 0;
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
      designCount++;
      samples.design ??= ref(reward);
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
  craftable.sort((a, b) => a.level - b.level || a.rp - b.rp || a.item.name.localeCompare(b.item.name));

  samples.blueprint = craftable.find((c) => blueprintItems.has(c.item.id))?.item ?? craftable[0]?.item;
  const researched = new Set(craftable.map((c) => c.item.id));
  const findOnly = [...blueprintItems]
    .filter((id) => !researched.has(id))
    .map(unlocked)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rp: ref(RP_ITEM),
    study,
    levels,
    blueprintCount: craftable.length,
    designCount,
    amplifiedCount,
    amplifiedLevel,
    samples,
    craftable,
    findOnly,
  };
}
