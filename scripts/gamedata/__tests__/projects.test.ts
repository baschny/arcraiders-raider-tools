import { describe, expect, it } from 'vitest';
import type { GenContext } from '../context';
import { Report } from '../context';
import { TextCollector } from '../text';
import projects, { goalTypeOf } from '../domains/projects';
import type { Project, ProjectGoal } from '../../../src/shared/gamedata/types';

const loc = (en: string) => ({ key: null, en, de: `${en}-de` });
const pkg = (...ids: number[]) => ({ items: ids.map((id) => ({ id, amount: 1 })), random: null });

function fakeCtx(records: Record<string, unknown>[], offers: unknown[] = []): GenContext {
  const items = new Map([
    [1, 'planks'],
    [2, 'metal'],
  ]);
  const report = new Report();
  const ctx = {
    arc: {
      file: () => new Map(records.map((r) => [String(r.id), r])),
      offers: new Map((offers as { id: number }[]).map((o) => [o.id, o])),
    },
    text: new TextCollector(),
    report,
    slugFor: (_k: string, key: string | number, rec?: { name?: { en: string } }) =>
      `${rec?.name?.en ?? ''}_${key}`.toLowerCase().replace(/\W+/g, '_').replace(/^_|_$/g, ''),
    itemRef: (id: number) => items.get(id) ?? null,
    rewards: (p: { items: { id: number; amount: number }[] } | null) =>
      (p?.items ?? []).filter((i) => items.has(i.id)).map((i) => ({ itemId: items.get(i.id)!, quantity: i.amount })),
    cost: (c: { items: { id: number; amount: number }[] }) => ({ items: c.items.map((i) => ({ itemId: items.get(i.id)!, quantity: i.amount })) }),
  };
  return ctx as unknown as GenContext;
}

const goal = (type: string, extra = {}) => ({ id: 99, type, amount: 3, canRepeat: false, required: true, title: null, targetIds: [], targetTags: [], rewardPackage: pkg(), ...extra });

describe('projects domain', () => {
  it('maps goal types', () => {
    expect(goalTypeOf('CONTRIBUTE_AMOUNT_OF_ITEMS')).toBe('items');
    expect(goalTypeOf('CONTRIBUTE_VALUE_OF_ITEMS')).toBe('value');
    expect(goalTypeOf('COMPLETE_QUESTS')).toBe('complete_quests');
  });

  it('unflattens phases/steps/goals with index-path keys and text', () => {
    const rec = {
      id: 10, kind: 'project', type: 'GENERAL', name: loc('Outpost'), description: loc('Desc'), start: 's', end: 'e', rewards: pkg(),
      phases: [{ title: null, description: null, steps: [
        { title: loc('S0'), description: null, rewardPackage: pkg(1), goals: [goal('COMPLETE_QUESTS', { targetIds: [777] })] },
        { title: loc('S1'), description: loc('D1'), rewardPackage: pkg(), goals: [
          goal('CONTRIBUTE_AMOUNT_OF_ITEMS', { targetIds: [1, 555], title: loc('Wood'), canRepeat: true }),
          goal('CONTRIBUTE_VALUE_OF_ITEMS', { targetTags: ['Recyclable'] }),
        ] },
      ] }],
    };
    const ctx = fakeCtx([rec]);
    const { projects: out } = projects.build(ctx) as { projects: Record<string, Project> };
    const p = out.outpost_10;
    expect(p).toMatchObject({ id: 'outpost_10', nameEn: 'Outpost', type: 'general', start: 's', end: 'e' });
    expect(p.phases[0].key).toBe('0');
    const [s0, s1] = p.phases[0].steps;
    expect(s0.key).toBe('0.0');
    expect(s0.goals[0]).toEqual({ key: '0.0.0', goalType: 'complete_quests', amount: 3, required: true });
    expect(s0.rewards).toEqual([{ itemId: 'planks', quantity: 1 }]);
    expect(s1.goals[0]).toMatchObject({ key: '0.1.0', goalType: 'items', itemIds: ['planks'], repeatable: true });
    expect(s1.goals[1]).toMatchObject({ goalType: 'value', tags: ['Recyclable'] });
    expect(JSON.stringify(out)).not.toMatch(/777|555/);
    expect(ctx.text.build('projects', 'en').outpost_10).toEqual({
      name: 'Outpost', description: 'Desc',
      steps: { '0': { '0': { name: 'S0' }, '1': { name: 'S1', description: 'D1' } } },
      goals: { '0': { '1': { '0': { name: 'Wood' } } } },
    });
  });

  it('numbers expeditions by start order and appends the number to names', () => {
    const exp = (id: number, start: string, name = 'Expedition') => ({ id, kind: 'project', type: 'EXPEDITION', name: loc(name), start, phases: [] });
    const win = (id: number, start: string) => ({ id, kind: 'expeditionWindow', type: null, start });
    const ctx = fakeCtx([exp(2, '2026-03-01'), exp(1, '2025-10-01'), win(8, '2026-03-01'), win(9, '2025-10-01')]);
    const { projects: out } = projects.build(ctx) as { projects: Record<string, Project> };
    const all = Object.values(out);
    expect(all.map((p) => [p.id, p.expedition, p.nameEn]).sort()).toEqual([['expedition_1', 1, 'Expedition 1'], ['expedition_2', 2, 'Expedition 2']].sort() as never);
  });

  it('keeps an overlay-provided numbered name unchanged', () => {
    const rec = { id: 1, kind: 'project', type: 'EXPEDITION', name: loc('Expedition 4'), start: 'a', phases: [] };
    const { projects: out } = projects.build(fakeCtx([rec])) as { projects: Record<string, Project> };
    expect(out.expedition_4_1).toMatchObject({ expedition: 1, nameEn: 'Expedition 4' });
  });

  it('builds event projects from CommunityEvent offers and tolerates none', () => {
    expect(projects.build(fakeCtx([]))).toEqual({ projects: {} });
    const offer = (id: number, order: number, item: number) => ({ id, type: 'CommunityEvent', owner: 5, title: `Give ${id}`, order, cost: { type: 'itemAmounts', items: [{ id: item, amount: 5 }] }, rewards: pkg(2) });
    const ctx = fakeCtx([], [offer(1, 2, 1), offer(2, 1, 2)]);
    const { projects: out } = projects.build(ctx) as { projects: Record<string, Project> };
    const ev = out.community_event_event_5;
    expect(ev.type).toBe('event');
    const goals = ev.phases[0].steps[0].goals;
    expect(goals.map((g: ProjectGoal) => g.itemIds)).toEqual([['metal'], ['planks']]);
    expect(goals[0]).toMatchObject({ key: '0.0.0', goalType: 'items', amount: 5, repeatable: true });
    expect(ctx.text.en('projects', 'community_event_event_5', 'goals.0.0.0.name')).toBe('Give 2');
  });
});
