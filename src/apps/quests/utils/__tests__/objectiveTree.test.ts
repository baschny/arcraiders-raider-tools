import { describe, expect, it } from 'vitest';
import type { ObjectiveView } from '../../types/quest';
import { evaluateObjectives, hasSharedTail, normalizeObjectiveTree, progressByKey, stepLabels } from '../objectiveTree';

function leaf(key: string, extra: Partial<ObjectiveView> = {}): ObjectiveView {
  return { key, kind: 'atomic', text: key, oneRound: false, optional: false, hidden: false, children: [], ...extra };
}

function group(key: string, kind: ObjectiveView['kind'], children: ObjectiveView[], extra: Partial<ObjectiveView> = {}): ObjectiveView {
  return { key, kind, oneRound: false, optional: false, hidden: false, children, ...extra };
}

const status = (tree: ObjectiveView, done: string[]) => {
  const states = evaluateObjectives(tree, new Set(done));
  return (key: string) => states.get(key)?.status;
};

describe('normalizeObjectiveTree', () => {
  it('drops a group text that repeats its first child group (Bait, Fetch, Blast)', () => {
    const tree = normalizeObjectiveTree(
      group('0', 'sequence', [group('0.0', 'anyOf', [leaf('0.0.0'), leaf('0.0.1')], { text: 'Destroy' }), leaf('0.1')], { text: 'Destroy' }),
    );
    expect(tree.text).toBeUndefined();
    expect(tree.children[0].text).toBe('Destroy');
  });

  it('keeps a nested one-round sequence as its own group', () => {
    const tree = normalizeObjectiveTree(group('0', 'sequence', [leaf('0.0'), group('0.1', 'sequence', [leaf('0.1.0'), leaf('0.1.1')], { oneRound: true })]));
    expect(tree.children.map((c) => c.key)).toEqual(['0.0', '0.1']);
  });
});

describe('evaluateObjectives', () => {
  it('locks later steps of a sequence; optional steps do not block', () => {
    const tree = group('0', 'sequence', [leaf('0.0', { optional: true }), leaf('0.1'), leaf('0.2', { hidden: true })]);
    let s = status(tree, []);
    expect([s('0.0'), s('0.1'), s('0.2')]).toEqual(['active', 'active', 'locked']);
    expect(evaluateObjectives(tree, new Set()).get('0.2')?.revealed).toBe(false);
    s = status(tree, ['0.1']);
    expect(s('0.2')).toBe('active');
  });

  it('closes the other routes once one is started and marks unneeded options', () => {
    const route = (k: string) => group(k, 'sequence', [leaf(`${k}.0`), leaf(`${k}.1`)]);
    const tree = group('0', 'anyOfExclusive', [route('0.0'), route('0.1')]);
    expect(status(tree, ['0.1.0'])('0.0')).toBe('closed');
    expect(hasSharedTail(tree)).toBe(false); // the tails differ in their texts

    const nOf = group('0', 'nOf', [leaf('0.0'), leaf('0.1'), leaf('0.2')], { requiredCount: 2 });
    const s = status(nOf, ['0.0', '0.2']);
    expect([s('0'), s('0.1')]).toEqual(['done', 'notNeeded']);
  });
});

describe('progressByKey', () => {
  it('maps the progress list onto the leaf keys, or nothing when the lengths differ', () => {
    const p = { completed: true, currentAmount: 1, requiredAmount: 1 };
    expect(progressByKey(['0.0', '0.1'], [p, p]).get('0.1')).toBe(p);
    expect(progressByKey(['0.0', '0.1'], [p]).size).toBe(0);
  });
});

describe('stepLabels', () => {
  it('numbers sequence steps like the quest details, groups pass their number on', () => {
    const tree = group('0', 'sequence', [
      leaf('0.0'),
      leaf('0.1', { optional: true }),
      group('0.2', 'allOf', [leaf('0.2.0'), group('0.2.1', 'sequence', [leaf('0.2.1.0'), leaf('0.2.1.1')])]),
    ]);
    const labels = stepLabels(tree);
    expect(labels.get('0')).toBeUndefined();
    expect(labels.get('0.0')).toBe('1');
    expect(labels.get('0.1')).toBeUndefined();
    expect(labels.get('0.2.0')).toBe('2');
    expect(labels.get('0.2.1.0')).toBe('2.1');
    expect(labels.get('0.2.1.1')).toBe('2.2');
  });

  it('leaves the places of a shared-tail choice unnumbered and counts the shared steps', () => {
    const branch = (k: string, place: string) =>
      group(k, 'sequence', [leaf(`${k}.0`, { text: place }), leaf(`${k}.1`, { text: 'install' }), leaf(`${k}.2`, { text: 'return' })]);
    const labels = stepLabels(group('0', 'anyOfExclusive', [branch('0.0', 'Dam'), branch('0.1', 'Spaceport')]));
    expect(labels.get('0.0.0')).toBeUndefined();
    expect(labels.get('0.1.1')).toBe('1');
    expect(labels.get('0.1.2')).toBe('2');
  });

  it('gives no numbers outside sequences', () => {
    expect(stepLabels(group('0', 'allOf', [leaf('0.0'), leaf('0.1')])).size).toBe(0);
  });
});
