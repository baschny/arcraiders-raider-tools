import { describe, expect, it } from 'vitest';
import type { ObjectiveView, StepItemRole } from '../../types/quest';
import { bringList, doneLeafKeys, openStepMapIds, otherRewardItems, questArcTrackerUrl, stepSummary, xpTier } from '../questSummary';

function leaf(key: string, extra: Partial<ObjectiveView> = {}): ObjectiveView {
  return { key, kind: 'atomic', text: key, oneRound: false, optional: false, hidden: false, children: [], ...extra };
}

function group(key: string, kind: ObjectiveView['kind'], children: ObjectiveView[], extra: Partial<ObjectiveView> = {}): ObjectiveView {
  return { key, kind, oneRound: false, optional: false, hidden: false, children, ...extra };
}

const item = (id: string, quantity: number, role: StepItemRole) => ({ id, quantity, role, name: id, imageFilename: '' });
const bring = (tree: ObjectiveView) =>
  Object.fromEntries(bringList({ objectiveTree: tree }).map((b) => [`${b.role}:${b.id}`, b.quantity]));

describe('bringList', () => {
  it('sums items along a sequence and skips obtain and optional steps', () => {
    const tree = group('0', 'sequence', [
      leaf('0.0', { items: [item('wires', 5, 'consumed'), item('battery', 2, 'consumed')] }),
      leaf('0.1', { items: [item('wires', 3, 'consumed'), item('fabric', 1, 'obtain')] }),
      leaf('0.2', { optional: true, items: [item('rope', 1, 'deliver')] }),
    ]);
    expect(bring(tree)).toEqual({ 'consumed:wires': 8, 'consumed:battery': 2 });
  });

  it('takes the largest amount of the alternatives of a choice', () => {
    const tree = group('0', 'anyOfExclusive', [
      leaf('0.0', { items: [item('wires', 4, 'kept')] }),
      leaf('0.1', { items: [item('wires', 2, 'kept'), item('battery', 1, 'kept')] }),
    ]);
    expect(bring(tree)).toEqual({ 'kept:wires': 4, 'kept:battery': 1 });
  });

  it('counts an item to bring (the camera) once', () => {
    const tree = group('0', 'allOf', [
      leaf('0.0', { items: [item('camera', 1, 'bring')] }),
      leaf('0.1', { items: [item('camera', 1, 'bring')] }),
    ]);
    expect(bring(tree)).toEqual({ 'bring:camera': 1 });
  });

  it('is empty without objectives', () => {
    expect(bringList({ objectiveTree: null })).toEqual([]);
  });
});

describe('stepSummary', () => {
  it('counts one route of a choice and names the next step', () => {
    const tree = group('0', 'sequence', [
      leaf('0.0', { text: 'Go there' }),
      group('0.1', 'anyOfExclusive', [group('0.1.0', 'sequence', [leaf('0.1.0.0'), leaf('0.1.0.1')]), leaf('0.1.1')]),
      leaf('0.2', { optional: true }),
      leaf('0.3', { text: 'Extract', oneRound: true }),
    ]);
    const empty = stepSummary({ objectiveTree: tree }, new Set());
    expect(empty).toEqual({ required: 4, done: 0, optional: 1, oneRound: true, hasChoice: true, next: 'Go there' });
    const started = stepSummary({ objectiveTree: tree }, new Set(['0.0']));
    expect(started.done).toBe(1);
    expect(started.next).toBe('0.1.0.0');
  });

  it('counts the required number of an n-of group', () => {
    const tree = group('0', 'nOf', [leaf('0.0'), leaf('0.1'), leaf('0.2')], { requiredCount: 2 });
    const s = stepSummary({ objectiveTree: tree }, new Set(['0.0', '0.1', '0.2']));
    expect([s.required, s.done, s.hasChoice, s.next]).toEqual([2, 2, true, undefined]);
  });

  it('has no choice in plain sequences and all-of groups', () => {
    const tree = group('0', 'sequence', [leaf('0.0'), group('0.1', 'allOf', [leaf('0.1.0'), leaf('0.1.1')])]);
    expect(stepSummary({ objectiveTree: tree }, new Set()).hasChoice).toBe(false);
  });

  it('is empty without objectives', () => {
    expect(stepSummary({ objectiveTree: null }, new Set()).required).toBe(0);
  });
});

describe('doneLeafKeys', () => {
  const quest = { objectiveLeafKeys: ['0.0', '0.1'], objectiveTree: group('0', 'anyOf', [leaf('0.0'), leaf('0.1')]) };
  const progressOf = (done: boolean[]) => done.map((completed) => ({ completed, currentAmount: null, requiredAmount: null }));

  it('marks every leaf of a completed quest done', () => {
    expect([...doneLeafKeys(quest, undefined, true)]).toEqual(['0.0', '0.1']);
  });

  it('reads the linked progress in leaf order', () => {
    const progress = [
      { completed: false, currentAmount: 0, requiredAmount: 1 },
      { completed: true, currentAmount: 1, requiredAmount: 1 },
    ];
    expect([...doneLeafKeys(quest, progress, false)]).toEqual(['0.1']);
  });

  it('keeps the played route of a completed quest, else marks every leaf done', () => {
    expect([...doneLeafKeys(quest, progressOf([false, true]), true)]).toEqual(['0.1']);
    expect([...doneLeafKeys(quest, progressOf([false, false]), true)]).toEqual(['0.0', '0.1']);
  });
});

describe('helpers', () => {
  it('maps the quest XP values to tiers', () => {
    expect([1000, 2500, 5000, 8000, 10000].map(xpTier)).toEqual([1, 2, 3, 4, 5]);
  });

  it('leaves the blueprints out of the reward items', () => {
    const rewards = otherRewardItems({
      rewardItems: [item('bp_anvil', 1, 'bring'), item('coins', 500, 'bring')],
      blueprintRewards: [{ id: 'bp_anvil', name: 'Anvil', imageFilename: '' }],
    });
    expect(rewards.map((r) => r.id)).toEqual(['coins']);
  });

  it('links arctracker by the quest slug', () => {
    expect(questArcTrackerUrl({ id: 'after_rain_comes' })).toBe('https://arctracker.io/quests/after-rain-comes');
  });
});

describe('openStepMapIds', () => {
  // Wires Crossed: one step per map, any order.
  const wires = {
    map: ['buried-city', 'the-spaceport', 'blue-gate'],
    objectiveTree: group('0', 'allOf', [
      leaf('0.0', { mapIds: ['blue-gate'] }),
      leaf('0.1', { mapIds: ['the-spaceport'] }),
      leaf('0.2', { mapIds: ['buried-city'] }),
    ]),
  };

  it('drops the maps of done steps', () => {
    expect(openStepMapIds(wires, new Set())?.sort()).toEqual(['blue-gate', 'buried-city', 'the-spaceport']);
    expect(openStepMapIds(wires, new Set(['0.0']))?.sort()).toEqual(['buried-city', 'the-spaceport']);
  });

  it('ignores locked later steps and lets map-less steps take the quest map', () => {
    const chain = {
      map: ['dam-battleground', 'stella-montis'],
      objectiveTree: group('0', 'sequence', [leaf('0.0', { mapIds: ['dam-battleground'] }), leaf('0.1', { mapIds: ['stella-montis'] })]),
    };
    expect(openStepMapIds(chain, new Set())).toEqual(['dam-battleground']);
    expect(openStepMapIds(chain, new Set(['0.0']))).toEqual(['stella-montis']);
    const single = { map: ['blue-gate'], objectiveTree: group('0', 'sequence', [leaf('0.0'), leaf('0.1')]) };
    expect(openStepMapIds(single, new Set(['0.0']))).toEqual(['blue-gate']);
  });

  it('returns null for quests on any map', () => {
    expect(openStepMapIds({ map: [], objectiveTree: leaf('0') }, new Set())).toBeNull();
  });
});
