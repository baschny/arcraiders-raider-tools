import { describe, expect, it } from 'vitest';
import type { ArcData, CanonItem, CanonOffer, CanonRecord } from '../arcData';
import { createContext, type GenContext } from '../context';
import { openSlugStore } from '../slugs';
import { classCounts, offersOfClass, offersOfDomain } from '../offer-classes';
import recipes from '../domains/recipes';
import research from '../domains/research';
import blueprints from '../domains/blueprints';
import trades from '../domains/trades';

const loc = (en: string) => ({ key: null, en }) as never;

const OWNERS = { inRaidCrafting: 510, salvage: 511, workbenchGenerator: 900, blueprintLearning: 800, furnitureDesigns: 700, stencils: 600 };
const RP = 1000;

const slugOfName = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ +/g, '_');

// Slug fields are what the arc-data build writes: items get their name's slug, the chain base Generators their bench slug.
const item = (id: number, type: string, name: string | null, extra: Partial<CanonItem> = {}): CanonItem =>
  ({
    id,
    baseId: id,
    kind: 'item',
    type,
    name: name ? loc(name) : null,
    sources: [],
    upgrades: [],
    tags: [],
    ...(name && !['NPC'].includes(type) ? { slug: slugOfName(name) } : {}),
    ...extra,
  }) as unknown as CanonItem;

const offer = (id: number, type: string, owner: number, rewardIds: number[], extra: Partial<CanonOffer> = {}): CanonOffer =>
  ({
    id,
    class: null,
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
    item(10, 'Generator', 'Research Station', { slug: 'research_station', baseId: 10, upgrades: [{ next: 11 }] as never }),
    item(11, 'Generator', null, { baseId: 10 }),
    item(20, 'Generator', 'Gunsmith', { slug: 'gunsmith', baseId: 20 }),
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
  const ctx = createContext(arc, openSlugStore(arc));
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
    offer(1, 'Crafting', 10, [3], { class: 'research', cost: rpCost(3000, [1, 2]) }),
    offer(2, 'Crafting', 11, [2], { class: 'research' }),
    offer(3, 'Crafting', 20, [2], { class: 'recipes:bench' }),
    offer(4, 'FieldCrafting', 510, [2], { class: 'recipes:in_raid' }),
    offer(13, 'NPC', 30, [2], { class: 'trades' }),
    offer(14, 'NPC', 31, [2], { class: 'excluded:promo' }),
    offer(17, 'Chamber', 900, [1]), // unclassified: class null
    offer(18, 'Mystery', 5, [1], { class: 'made_up' as never }), // unknown class
  ];

  it('groups offers by their class, ascending offer id, and reports unclassified ones once', () => {
    const ctx = fixture(offers);
    expect(offersOfClass(ctx, 'research').map((o) => o.id)).toEqual([1, 2]);
    expect(offersOfClass(ctx, 'research')).toBe(offersOfClass(ctx, 'research'));
    expect(offersOfClass(ctx, 'outpost:room')).toEqual([]);
    expect(classCounts(ctx)).toEqual({ research: 2, 'recipes:bench': 1, 'recipes:in_raid': 1, trades: 1, 'excluded:promo': 1 });
    expect(ctx.report.sections.get('unclassifiedOffers')).toEqual([
      '17 Chamber owner=900 "Offer 17"',
      '18 Mystery owner=5 "Offer 18" class=made_up',
    ]);
  });

  it('collects the offers of a domain; known-but-not-shipped classes belong to none', () => {
    const ctx = fixture(offers);
    expect(offersOfDomain(ctx, 'recipes').map((o) => o.id)).toEqual([3, 4]);
    expect(offersOfDomain(ctx, 'trades').map((o) => o.id)).toEqual([13]);
    expect(offersOfDomain(ctx, 'projects')).toEqual([]);
  });
});

describe('offer domains', () => {
  it('builds recipes (bench + in_raid) keyed by offer id', () => {
    const ctx = fixture([
      offer(3, 'Crafting', 20, [2], { class: 'recipes:bench', cost: { type: 'itemAmounts', items: [{ id: 1, amount: 4 }] } }),
      offer(4, 'FieldCrafting', 510, [2], { class: 'recipes:in_raid' }),
      offer(5, 'Crafting', 20, [2], { class: 'recipes:bench' }),
    ]);
    const { recipes: r } = recipes.build(ctx) as { recipes: Record<string, Record<string, unknown>> };
    expect(Object.keys(r)).toEqual(['3', '4', '5']);
    expect(r['3']).toMatchObject({ id: '3', station: 'bench', benchId: 'gunsmith', benchLevel: 1, cost: { items: [{ itemId: 'metal_parts', quantity: 4 }] } });
    expect(r['4'].station).toBe('in_raid');
    expect(r['4'].benchId).toBeUndefined();
  });

  it('extracts research points and uses the reward name as title', () => {
    const ctx = fixture([offer(1, 'Crafting', 10, [3], { class: 'research', cost: rpCost(3000, [1, 2]) }), offer(2, 'Crafting', 11, [50], { class: 'research' })]);
    const { research: r } = research.build(ctx) as { research: Record<string, Record<string, unknown>> };
    expect(Object.keys(r)).toEqual(['1']); // unnamed reward is skipped
    expect(r['1']).toMatchObject({ benchId: 'research_station', benchLevel: 1, researchPoints: 3000 });
    expect(ctx.text.en('research', '1')).toBe('Rifle Blueprint');
    expect(ctx.report.count('offersWithoutReward')).toBe(1);
  });

  it('links blueprint learning to the unlocked recipe item', () => {
    const ctx = fixture([
      offer(6, 'Chamber', 800, [50], { class: 'blueprints', cost: { type: 'itemAmounts', items: [{ id: 3, amount: 1 }] }, requires: [{ id: 3, amount: 1 }] }),
      offer(3, 'Crafting', 20, [2], { class: 'recipes:bench', requires: [{ id: 50, amount: 1 }] }),
    ]);
    const { blueprints: b } = blueprints.build(ctx) as { blueprints: Record<string, Record<string, unknown>> };
    expect(b['6']).toMatchObject({ blueprintItemId: 'rifle_blueprint', unlocksItemId: 'rifle', rewards: [{ itemId: 'rifle', quantity: 1 }] });
    expect(b['6'].requires).toBeUndefined();
  });

  it('builds trades with trader id, limit and trader map', () => {
    const ctx = fixture([offer(13, 'NPC', 30, [2], { class: 'trades', cost: { type: 'itemAmounts', items: [{ id: 5, amount: 900 }] }, limit: { max: 3, refreshSeconds: 60 } })]);
    const res = trades.build(ctx) as { trades: Record<string, Record<string, unknown>>; traders: Record<string, Record<string, unknown>> };
    expect(res.trades['13']).toMatchObject({ traderId: '30', limit: { max: 3, refreshSeconds: 60 } });
    expect(res.traders).toEqual({ '30': { id: '30', nameEn: 'Lance' } });
  });
});
