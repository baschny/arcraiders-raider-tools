import { describe, expect, it } from 'vitest';
import type { GenContext } from '../context';
import { Report } from '../context';
import { buildWhatsNewVersion, type RawWhatsNew } from '../domains/whats-new';

const item = (type: string, extra: Record<string, unknown> = {}) => ({ type, internalName: `DA_${type}`, ...extra });

function makeCtx(): GenContext {
  const items = new Map<number, unknown>([
    [1, item('Material')],
    [2, item('Material')],
    [3, item('OnlineItem')], // unlock item without slug
    [10, item('Generator')],
    [11, item('NPC')],
    [12, item('InventoryStructure', { slots: { numberOfSlots: 112 } })],
    [13, item('InventoryStructure', { slots: { numberOfSlots: 136 } })],
  ]);
  const slugTable: Record<string, Record<number, string>> = { traders: { 11: 'celeste' }, quests: { 50: 'q_one' }, skills: { 60: 'skill_a' } };
  return {
    arc: { items } as never,
    slugs: { slugOf: (k: string, key: number) => slugTable[k]?.[Number(key)] ?? null } as never,
    report: new Report(),
    shippedItems: new Map([
      [1, 'iron'],
      [2, 'wire'],
    ]),
    benchLevel: (id: number) => (id === 10 ? { benchKey: '10', benchId: 'research_station', level: 2 } : null),
  } as unknown as GenContext;
}

const raw = (over: Partial<RawWhatsNew>): RawWhatsNew => ({
  gameVersion: '2.0',
  slug: 'frozen-trail',
  baseline: { label: '1.45' },
  summary: { newItems: 1, newSystems: 1, researchOffers: 1, researchPointsTotal: 1, newStashTiers: 1 },
  ...over,
});

describe('whats-new', () => {
  it('maps ids to slugs, bench levels, traders, stash tiers and quests', () => {
    const ctx = makeCtx();
    const v = buildWhatsNewVersion(
      ctx,
      raw({
        newItems: [
          {
            id: 1,
            group: 'material',
            verdict: 'keep',
            keepCount: 3,
            uses: [
              { system: 'research', target: 2, amount: 5, via: 10 },
              { system: 'outpostRoom', target: 2, amount: 1, via: 11 },
              { system: 'benchUpgrade', target: 13, amount: 1, via: 12 },
              { system: 'quest', target: 50, amount: 1 },
            ],
            recyclesInto: [{ id: 2, amount: 4 }],
          },
        ],
        changes: { stash: [{ from: 12, to: 13, before: null, after: [{ id: 1, amount: 9 }] }] },
      }),
    );
    expect(v.newItems?.[0]).toMatchObject({ id: 'iron', verdict: 'keep', keepCount: 3 });
    expect(v.newItems?.[0].uses).toEqual([
      { system: 'research', target: 'wire', amount: 5, via: { bench: 'research_station', level: 2 } },
      { system: 'outpostRoom', target: 'wire', amount: 1, via: 'celeste' },
      { system: 'benchUpgrade', target: { stashSlots: 136 }, amount: 1, via: { stashSlots: 112 } },
      { system: 'quest', target: 'q_one', amount: 1 },
    ]);
    expect(v.newItems?.[0].recyclesInto).toEqual([{ itemId: 'wire', quantity: 4 }]);
    expect(v.changes?.stash).toEqual([{ from: 112, to: 136, before: [], after: [{ itemId: 'iron', quantity: 9 }] }]);
  });

  it('drops unresolvable ids and reports them', () => {
    const ctx = makeCtx();
    const v = buildWhatsNewVersion(
      ctx,
      raw({
        newItems: [
          { id: 99, group: 'other', verdict: 'sell', uses: [] },
          {
            id: 1,
            group: 'material',
            verdict: 'optional',
            uses: [
              { system: 'craft', target: 3, amount: 1 }, // unlock target: use dropped
              { system: 'fieldCraft', target: 2, amount: 1, via: 3 }, // unlock via: via dropped, use kept
            ],
          },
        ],
        blueprints: { newlyResearchable: [1, 99], findOnly: [2] },
      }),
    );
    expect(v.newItems).toHaveLength(1);
    expect(v.newItems?.[0].uses).toEqual([{ system: 'fieldCraft', target: 'wire', amount: 1 }]);
    expect(v.blueprints).toEqual({ newlyResearchable: ['iron'], findOnly: ['wire'] });
    expect(ctx.report.count('whatsNew:droppedUses')).toBe(1);
    expect(ctx.report.count('whatsNew:droppedRefs')).toBeGreaterThan(0);
  });

  it('keeps scrap-value trader lines and field-crafting skills', () => {
    const ctx = makeCtx();
    const v = buildWhatsNewVersion(
      ctx,
      raw({
        changes: { traders: [{ npc: 11, added: [{ result: 1, scrapValue: 500, scrapItems: [2, { id: 99 }] }], removed: [], priceChanged: [] }] },
        fieldCrafting: { skillsAfter: [60, 61], recipes: [{ result: 1, cost: [{ id: 2, amount: 1 }], skills: [60], status: 'new' }] },
      }),
    );
    expect(v.changes?.traders?.[0]).toMatchObject({ npc: 'celeste', added: [{ result: 'iron', scrapValue: 500, scrapItems: ['wire'] }] });
    expect(v.fieldCrafting?.skillsAfter).toEqual(['skill_a']);
    expect(v.fieldCrafting?.recipes?.[0]).toMatchObject({ result: 'iron', skills: ['skill_a'], status: 'new' });
  });
});
