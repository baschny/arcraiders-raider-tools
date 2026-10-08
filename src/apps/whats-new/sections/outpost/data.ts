import { nameOf } from '../../../../shared/gamedata/loader';
import type { Amount, Requirement } from '../../../../shared/gamedata/types';
import type { AmountRef, ItemRef } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';

export interface RoomOption {
  item: ItemRef;
  /** Room thumbnail; none yet (hook for the room image ticket). */
  image?: string;
  /** Special option (Studious). */
  special?: boolean;
}

export interface UnlockRef {
  /** Bench tier icon tile. */
  item: ItemRef;
  benchId: string;
  level: number;
}

export interface ExpansionTier {
  /** Expansion number 1..3; goes from level `tier` to `tier + 1`. */
  tier: number;
  from: number;
  to: number;
  cost: AmountRef[];
  rooms: RoomOption[];
  unlocks: UnlockRef[];
}

export interface FurnitureExample {
  category: string;
  item: ItemRef;
}

export interface CelesteTrade {
  reward: AmountRef;
  cost: AmountRef;
}

/** Room thumbnails by room slug. Filled when the room images exist (see ticket W2). */
export const ROOM_IMAGES: Record<string, string> = {};

/** Furniture categories of the game grouped into six display groups, in display order. */
export const FURNITURE_GROUPS: { id: string; categories: string[] }[] = [
  { id: 'beds', categories: ['Bed'] },
  { id: 'seating', categories: ['Chair', 'Sofa', 'Stool'] },
  { id: 'storage', categories: ['Wardrobe', 'Shelves', 'Cabinet', 'Stash'] },
  { id: 'tables', categories: ['Table'] },
  { id: 'lighting', categories: ['Lamp'] },
  { id: 'decoration', categories: ['Junk', 'Vegetation', 'MusicalInstrument', 'DisplayCase.Weapon'] },
];

const outpostLevelOf = (requires?: Requirement[]): number | undefined => {
  const r = requires?.find((x) => x.kind === 'outpostLevel');
  return r ? Number(r.id) : undefined;
};

const toRefs = (catalog: WhatsNewPageData['catalog'], list: Amount[]): AmountRef[] =>
  list.map((a) => ({ item: toItemRef(catalog, a.itemId), quantity: a.quantity }));

/** Bench tiers whose requirements name an outpost level, by level. */
function unlocksByLevel(data: WhatsNewPageData): Map<number, UnlockRef[]> {
  const out = new Map<number, UnlockRef[]>();
  for (const bench of Object.values(data.benches.structure.benches)) {
    for (const lvl of bench.levels) {
      const need = outpostLevelOf(lvl.requires);
      if (need === undefined || need < 2) continue;
      const name = nameOf(data.benches, bench.id, bench.nameEn);
      const list = out.get(need) ?? [];
      list.push({
        benchId: bench.id,
        level: lvl.level,
        item: { id: `${bench.id}-${lvl.level}`, name: `${name} ${lvl.level}`, icon: lvl.icon ?? undefined },
      });
      out.set(need, list);
    }
  }
  return out;
}

/** Expansion ladder: rooms grouped by the outpost level their offer requires (= expansion number). */
export function buildExpansionTiers(data: WhatsNewPageData): ExpansionTier[] {
  const { catalog } = data;
  const { rooms, levels } = data.outpost.structure;
  const unlocks = unlocksByLevel(data);
  const maxLevel = Math.max(1, ...levels.map((l) => l.level));
  const byTier = new Map<number, { cost: Amount[]; rooms: RoomOption[] }>();
  // Each room has one build offer per outpost level it can be installed at (from level N to N+1).
  for (const room of Object.values(rooms)) {
    for (const craft of room.crafts ?? []) {
      if (!('items' in craft.cost)) continue;
      const tier = outpostLevelOf(craft.requires);
      if (tier === undefined || tier >= maxLevel) continue;
      const entry = byTier.get(tier) ?? { cost: craft.cost.items, rooms: [] };
      entry.rooms.push({
        item: toItemRef(catalog, room.id),
        image: ROOM_IMAGES[room.id],
        special: (room.crafts?.length ?? 0) === 1,
      });
      byTier.set(tier, entry);
    }
  }
  return [...byTier.keys()]
    .sort((a, b) => a - b)
    .map((tier) => {
      const entry = byTier.get(tier)!;
      // regular choices first, the special option last
      const sorted = [...entry.rooms].sort((a, b) => Number(!!a.special) - Number(!!b.special));
      return { tier, from: tier, to: tier + 1, cost: toRefs(catalog, entry.cost), rooms: sorted, unlocks: unlocks.get(tier + 1) ?? [] };
    });
}

/** One furniture example per display group: the first piece in the domain's order. */
export function pickFurnitureExamples(data: WhatsNewPageData): FurnitureExample[] {
  const list = Object.values(data.outpost.structure.furniture);
  const out: FurnitureExample[] = [];
  for (const group of FURNITURE_GROUPS) {
    const first = list.find((f) => group.categories.includes(f.category));
    if (first) out.push({ category: group.id, item: toItemRef(data.catalog, first.id) });
  }
  return out;
}

export function furnitureCount(data: WhatsNewPageData): number {
  return Object.keys(data.outpost.structure.furniture).length;
}

/** Design example (item, plus the furniture it unlocks) for the design flow. */
export function designExample(data: WhatsNewPageData): { design: ItemRef; furniture: ItemRef } | null {
  const design = Object.values(data.outpost.structure.designs).find((d) => d.unlocks?.length);
  if (!design) return null;
  return { design: toItemRef(data.catalog, design.id), furniture: toItemRef(data.catalog, design.unlocks![0]) };
}

/** Examples for the "learn here" row: a few designs and blueprints. */
export function learnExamples(data: WhatsNewPageData, perKind = 3): { designs: ItemRef[]; blueprints: ItemRef[] } {
  const designs = Object.values(data.outpost.structure.designs)
    .slice(0, perKind)
    .map((d) => toItemRef(data.catalog, d.id));
  const blueprints = Object.values(data.blueprints.structure.blueprints)
    .slice(0, perKind)
    .map((b) => toItemRef(data.catalog, b.blueprintItemId));
  return { designs, blueprints };
}

/** Celeste's seed trades for the given reward items (Planks, Sheet Metal, Steel Cable). */
export function celesteTrades(data: WhatsNewPageData, rewardIds = ['planks', 'sheet_metal', 'steel_cable']): CelesteTrade[] {
  const trades = Object.values(data.trades.structure.trades).filter((t) => t.traderId === 'celeste');
  const out: CelesteTrade[] = [];
  for (const id of rewardIds) {
    const trade = trades.find((t) => t.rewards?.[0]?.itemId === id && 'items' in t.cost);
    if (!trade || !('items' in trade.cost) || !trade.cost.items[0]) continue;
    const reward = trade.rewards![0];
    const cost = trade.cost.items[0];
    out.push({
      reward: { item: toItemRef(data.catalog, reward.itemId), quantity: reward.quantity },
      cost: { item: toItemRef(data.catalog, cost.itemId), quantity: cost.quantity },
    });
  }
  return out;
}
