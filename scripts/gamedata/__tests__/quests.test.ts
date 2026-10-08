import { describe, expect, it } from 'vitest';
import { TextCollector } from '../text';
import { Report, type GenContext } from '../context';
import quests, { roundsPlayedAmount } from '../domains/quests';

const loc = (en: string) => ({ key: null, en });
const ROUNDS = -1869396984;
const XP = 1672558715;
const WORKBENCH = 999;

function atomic(en: string | null, action?: unknown, extra: Record<string, unknown> = {}) {
  return { kind: 'ATOMIC', name: en ? loc(en) : null, action: action ?? null, children: [], ...extra };
}

function quest(id: number, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'quest',
    type: 'NARRATIVE',
    name: loc(name),
    description: loc(`${name} d`),
    hidden: false,
    owner: 5,
    mapIds: [],
    requires: [],
    rewards: { accept: { items: [], random: null }, complete: { items: [{ id: XP, amount: 100 }, { id: 1, amount: 2 }], random: null }, optionals: { items: [], random: null } },
    objective: { kind: 'ALL_OF', name: null, children: [atomic('Do it')] },
    ...over,
  };
}

const req = (...ids: number[]) => ids.map((quest) => ({ quest, state: 'COMPLETED' }));

function fakeCtx(list: Record<string, unknown>[]): GenContext {
  const canon = new Map(list.map((q) => [String(q.id), q]));
  const items = new Map<number, unknown>([[5, { id: 5, name: loc('Trader') }], [WORKBENCH, { id: WORKBENCH, name: loc('Workbench') }]]);
  const report = new Report();
  const ctx = {
    arc: {
      constants: { owners: { workbenchGenerator: WORKBENCH }, currencies: { xp: XP } },
      file: (name: string) => (name === 'quests' ? canon : new Map([['77', { name: loc('Wasp') }]])),
      json: () => ({ '3': { requiresMaps: [1000] } }),
      items,
    },
    slugs: { slugOf: (_k: string, key: string) => (key === '1000' ? 'blue-gate' : null) },
    text: new TextCollector(),
    report,
    shippedItems: new Map([[1, 'bolt'], [XP, 'xp']]),
    slugFor: (_k: string, key: string | number, rec?: { name?: { en: string } }) => (rec?.name?.en ?? String(key)).toLowerCase().replace(/\W+/g, '_'),
    itemRef: (id: number) => (ctx.shippedItems as Map<number, string>).get(id) ?? null,
    rewards: (pkg: { items: { id: number; amount: number }[] }) => pkg.items.map((i) => ({ itemId: ctx.itemRef(i.id)!, quantity: i.amount })).filter((r) => r.itemId),
  } as unknown as GenContext;
  return ctx;
}

describe('quests domain', () => {
  const tracker = quest(10, 'Raids 3', { hidden: true, objective: { kind: 'ALL_OF', name: null, children: [atomic('Play', { type: 'Obtain', amount: 3, mapIds: [], params: { Item: String(ROUNDS) } })] } });
  const list = [
    quest(1, 'First'),
    quest(2, 'Second', { requires: req(1, 10), mapIds: [1000] }),
    quest(3, 'Mapped', { requires: req(2) }),
    quest(4, 'Trigger', { hidden: true }),
    quest(5, 'Side A', { requires: req(4) }),
    quest(6, 'Side B', { requires: req(5) }),
    quest(7, 'Research', { owner: WORKBENCH }),
    quest(8, 'Daily', { type: 'DAILY' }),
    quest(9, 'Tree', {
      objective: {
        kind: 'SEQUENCE',
        name: null,
        children: [
          atomic('Kill', { type: 'KillEnemy', amount: 2, mapIds: [], params: { Target: '77', Item: '1' } }, { oneRound: true }),
          { kind: 'ANY_OF', name: null, requiredCount: 1, children: [atomic('A', { type: 'Interact', amount: 1, mapIds: [], params: { Target: '123' } }, { optional: true, hidden: true }), atomic(null)] },
        ],
      },
    }),
    tracker,
  ];

  it('detects rounds trackers', () => {
    expect(roundsPlayedAmount(tracker as never)).toBe(3);
    expect(roundsPlayedAmount(list[0] as never)).toBeNull();
  });

  const ctx = fakeCtx(list);
  const out = quests.build(ctx).quests as Record<string, import('../../../src/shared/gamedata/types').Quest>;

  it('computes categories', () => {
    expect(out.first.category).toBe('main');
    expect(out.trigger.category).toBe('main');
    expect(out.side_a.category).toBe('side');
    expect(out.side_b.category).toBe('side');
    expect(out.research.category).toBe('research');
    expect(out.daily.category).toBe('daily');
    expect(out.trigger.hidden).toBe(true);
    expect(out.research.traderId).toBeUndefined();
    expect(out.first.traderId).toBe('trader');
  });

  it('builds requires with raids and map prerequisites, and next', () => {
    expect(out.second.requires).toEqual([{ questId: 'first' }, { raids: 3 }]);
    expect(out.mapped.requires).toEqual([{ questId: 'second' }, { mapId: 'blue-gate' }]);
    expect(out.second.mapIds).toEqual(['blue-gate']);
    expect(out.first.next).toEqual(['second']);
    expect(out.raids_3.next).toEqual([]);
  });

  it('builds the objective tree with stable keys and resolved actions', () => {
    const t = out.tree.objective;
    expect(t.key).toBe('0');
    expect(t.kind).toBe('sequence');
    expect(t.children!.map((c) => c.key)).toEqual(['0.0', '0.1']);
    expect(t.children![0]).toMatchObject({ kind: 'atomic', oneRound: true, action: { type: 'KillEnemy', amount: 2, itemId: 'bolt', targetId: 'wasp' } });
    const any = t.children![1];
    expect(any).toMatchObject({ kind: 'anyOf', requiredCount: 1 });
    expect(any.children![0]).toMatchObject({ key: '0.1.0', optional: true, hidden: true });
    expect(any.children![0].action!.targetId).toBeUndefined();
    expect(ctx.report.count('quests:worldObjectTargets (omitted)')).toBe(1);
  });

  it('separates xp from rewards', () => {
    expect(out.first.rewards).toEqual({ complete: [{ itemId: 'bolt', quantity: 2 }], xp: 100 });
  });
});
