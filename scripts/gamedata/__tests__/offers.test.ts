import { describe, expect, it } from 'vitest';
import type { ArcData, CanonItem, CanonOffer, CanonRecord } from '../arcData';
import { createContext, type GenContext } from '../context';
import type { SlugEntry, SlugKind, SlugStore } from '../slugs';
import { classifyOffer, classCounts, offersOfClass } from '../offer-classes';
import recipes from '../domains/recipes';
import research from '../domains/research';
import blueprints from '../domains/blueprints';
import trades from '../domains/trades';

const loc = (en: string) => ({ key: null, en }) as never;

function memorySlugs(seed: Partial<Record<SlugKind, Record<string, string>>> = {}): SlugStore {
  const tables = new Map<string, Record<string, SlugEntry>>();
  const table = (k: string) => tables.get(k) ?? (tables.set(k, {}), tables.get(k)!);
  for (const [kind, entries] of Object.entries(seed)) for (const [key, slug] of Object.entries(entries)) table(kind)[key] = { slug };
  const taken = (kind: string, slug: string) => Object.values(table(kind)).some((e) => e.slug === slug);
  const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ +/g, '_');
  return {
    get: (k, key) => table(k)[String(key)] ?? null,
    slugOf: (k, key) => table(k)[String(key)]?.slug ?? null,
    lookup: () => null,
    getOrCreate(kind, key, { name, base, numericSep = '_' }) {
      const ex = table(kind)[String(key)];
      if (ex) return ex.slug;
      const root = base || (name ? slugify(name) : '');
      if (!root) return null;
      let slug = root;
      for (let n = 2; taken(kind, slug); n++) slug = `${root}${numericSep}${n}`;
      table(kind)[String(key)] = { slug };
      return slug;
    },
    aliases: () => ({}),
    table,
    save: () => [],
  };
}

const OWNERS = { inRaidCrafting: 510, salvage: 511, workbenchGenerator: 900, blueprintLearning: 800, furnitureDesigns: 700, stencils: 600 };
const RP = 1000;

const item = (id: number, type: string, name: string | null, extra: Partial<CanonItem> = {}): CanonItem =>
  ({ id, baseId: id, kind: 'item', type, name: name ? loc(name) : null, sources: [], upgrades: [], tags: [], ...extra }) as unknown as CanonItem;

const offer = (id: number, type: string, owner: number, rewardIds: number[], extra: Partial<CanonOffer> = {}): CanonOffer =>
  ({
    id,
    kind: 'offer',
    type,
    owner,
    title: `Offer ${id}`,
    cost: { type: 'itemAmounts', items: [] },
    requires: [],
    rewards: { items: rewardIds.map((r) => ({ id: r, amount: 1 })), random: null },
    limit: { max: 0, refreshSeconds: 0 },
    durationSeconds: 0,
    visible: true,
    sources: [],
    ...extra,
  }) as unknown as CanonOffer;

function fixture(offers: CanonOffer[]): GenContext {
  const items = [
    item(1, 'GameItem', 'Metal Parts'),
    item(2, 'GameItem', 'Rifle'),
    item(3, 'GameItem', 'Rifle Blueprint'),
    item(4, 'GameItem', 'Research Points'),
    item(5, 'GameItem', 'Raider Coins'),
    item(10, 'Generator', 'Research Station', { baseId: 10, upgrades: [{ next: 11 }] as never }),
    item(11, 'Generator', 'Research Station', { baseId: 10 }),
    item(20, 'Generator', 'Gunsmith', { baseId: 20 }),
    item(30, 'NPC', 'Lance'),
    item(31, 'CharacterItem', null),
    item(40, 'OutpostFurniture', 'Chair'),
    item(41, 'OutpostRoom', 'Room A'),
    item(50, 'OnlineItem', null), // unnamed unlock
    item(900, 'OnlineItem', null),
  ];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const offerMap = new Map(offers.map((o) => [o.id, o]));
  const arc = {
    dir: '/fake',
    commit: null,
    meta: { gameVersion: null, gameManifest: null, apiDumpCommit: null },
    constants: { currencies: { researchPoints: RP, coins: 5 }, owners: OWNERS, stash: {}, gameSettings: {} },
    items: itemMap,
    offers: offerMap,
    file: () => new Map<string, CanonRecord>(),
    json: () => null,
  } as unknown as ArcData;
  const ctx = createContext(arc, memorySlugs());
  for (const i of items) if (i.name && !['Generator', 'NPC'].includes(i.type!)) ctx.shippedItems.set(i.id, ctx.slugFor('items', i.id, i)!);
  // research points is the currency with asset id RP; map it to the fixture item 4
  ctx.shippedItems.set(RP, 'research_points');
  return ctx;
}

const rpCost = (rp: number, ...items: [number, number][]) => ({
  type: 'itemAmounts',
  items: [{ id: RP, amount: rp }, ...items.map(([id, amount]) => ({ id, amount }))],
});

describe('offer classification', () => {
  const offers = [
    offer(1, 'Crafting', 10, [3], { cost: rpCost(3000, [1, 2]) }), // research
    offer(2, 'Crafting', 11, [2]), // research level 2
    offer(3, 'Crafting', 20, [2], { cost: { type: 'itemAmounts', items: [{ id: 1, amount: 4 }] } }), // bench recipe
    offer(4, 'FieldCrafting', 510, [2]), // in raid
    offer(5, 'FieldCrafting', 511, [1]), // salvage
    offer(6, 'Chamber', 800, [50], { cost: { type: 'itemAmounts', items: [{ id: 3, amount: 1 }] }, requires: [{ id: 3, amount: 1 }] }), // blueprint
    offer(7, 'Chamber', 900, [20]), // bench build
    offer(8, 'Chamber', 900, [40]), // furniture
    offer(9, 'Chamber', 900, [41]), // room
    offer(10, 'Chamber', 700, [50]), // design
    offer(11, 'Chamber', 600, [50]), // stencil learn
    offer(12, 'Crafting', 600, [2]), // stencil craft
    offer(13, 'NPC', 30, [2], { cost: { type: 'itemAmounts', items: [{ id: 5, amount: 900 }] }, limit: { max: 3, refreshSeconds: 60 } }), // trade
    offer(14, 'NPC', 31, [2]), // excluded promo
    offer(15, 'RoundCrafting', 77, [1]), // scrappy
    offer(16, 'CommunityEvent', 800, [1]), // project event
    offer(17, 'Chamber', 900, [1]), // unclassified: no generator/furniture/room reward
    offer(18, 'Mystery', 5, [1]), // unclassified type
  ];

  it('applies rules 1-12 in order and reports unclassified offers', () => {
    const ctx = fixture(offers);
    const cls = (id: number) => classifyOffer(ctx, ctx.arc.offers.get(id)!)?.cls ?? null;
    expect([1, 2].map(cls)).toEqual(['research', 'research']);
    expect(cls(3)).toBe('recipes:bench');
    expect(cls(4)).toBe('recipes:in_raid');
    expect(cls(5)).toBe('items:salvage');
    expect(cls(6)).toBe('blueprints');
    expect(cls(7)).toBe('benches:build');
    expect(cls(8)).toBe('outpost:furniture');
    expect(cls(9)).toBe('outpost:room');
    expect(cls(10)).toBe('outpost:design');
    expect([cls(11), cls(12)]).toEqual(['stencils:learn', 'stencils:craft']);
    expect(cls(13)).toBe('trades');
    expect(cls(14)).toBe('excluded:promo');
    expect(cls(15)).toBe('benches:scrappy');
    expect(cls(16)).toBe('projects:event');
    expect(cls(17)).toBeNull();
    expect(cls(18)).toBeNull();
    expect(ctx.report.sections.get('unclassifiedOffers')).toEqual([
      '17 Chamber owner=900 "Offer 17"',
      '18 Mystery owner=5 "Offer 18"',
    ]);
  });

  it('memoizes per-class lists in ascending offer id and reports unclassified once', () => {
    const ctx = fixture(offers);
    expect(offersOfClass(ctx, 'research').map((o) => o.id)).toEqual([1, 2]);
    expect(offersOfClass(ctx, 'research')).toBe(offersOfClass(ctx, 'research'));
    expect(classCounts(ctx).trades).toBe(1);
    expect(ctx.report.count('unclassifiedOffers')).toBe(2);
  });
});

describe('offer domains', () => {
  it('builds recipes (bench + in_raid) with frozen-style slugs and numeric suffixes', () => {
    const ctx = fixture([
      offer(3, 'Crafting', 20, [2], { cost: { type: 'itemAmounts', items: [{ id: 1, amount: 4 }] } }),
      offer(4, 'FieldCrafting', 510, [2]),
      offer(5, 'Crafting', 20, [2]),
    ]);
    const { recipes: r } = recipes.build(ctx) as { recipes: Record<string, any> };
    expect(Object.keys(r)).toEqual(['recipes:rifle', 'recipes:rifle-2', 'recipes:rifle-3']);
    expect(r['recipes:rifle']).toMatchObject({ station: 'bench', benchId: 'gunsmith', benchLevel: 1, cost: { items: [{ itemId: 'metal_parts', quantity: 4 }] } });
    expect(r['recipes:rifle-2'].station).toBe('in_raid');
    expect(r['recipes:rifle-2'].benchId).toBeUndefined();
  });

  it('extracts research points and uses the reward name as title', () => {
    const ctx = fixture([offer(1, 'Crafting', 10, [3], { cost: rpCost(3000, [1, 2]) }), offer(2, 'Crafting', 11, [50])]);
    const { research: r } = research.build(ctx) as { research: Record<string, any> };
    expect(Object.keys(r)).toEqual(['research:rifle_blueprint']); // unnamed reward is skipped
    expect(r['research:rifle_blueprint']).toMatchObject({ benchId: 'research_station', benchLevel: 1, researchPoints: 3000 });
    expect(ctx.text.en('research', 'research:rifle_blueprint')).toBe('Rifle Blueprint');
    expect(ctx.report.count('offersWithoutReward')).toBe(1);
  });

  it('links blueprint learning to the unlocked recipe item', () => {
    const ctx = fixture([
      offer(6, 'Chamber', 800, [50], { cost: { type: 'itemAmounts', items: [{ id: 3, amount: 1 }] }, requires: [{ id: 3, amount: 1 }] }),
      offer(3, 'Crafting', 20, [2], { requires: [{ id: 50, amount: 1 }] }),
    ]);
    const { blueprints: b } = blueprints.build(ctx) as { blueprints: Record<string, any> };
    expect(b['blueprints:rifle_blueprint']).toMatchObject({ blueprintItemId: 'rifle_blueprint', unlocksItemId: 'rifle', rewards: [{ itemId: 'rifle', quantity: 1 }] });
    expect(b['blueprints:rifle_blueprint'].requires).toBeUndefined();
  });

  it('builds trades with trader slug, limit and trader map', () => {
    const ctx = fixture([offer(13, 'NPC', 30, [2], { cost: { type: 'itemAmounts', items: [{ id: 5, amount: 900 }] }, limit: { max: 3, refreshSeconds: 60 } })]);
    const res = trades.build(ctx) as { trades: Record<string, any>; traders: Record<string, any> };
    expect(res.trades['trades:rifle']).toMatchObject({ traderId: 'lance', limit: { max: 3, refreshSeconds: 60 } });
    expect(res.traders).toEqual({ lance: { id: 'lance', nameEn: 'Lance' } });
  });
});
