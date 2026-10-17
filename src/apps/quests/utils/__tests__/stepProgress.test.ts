import { describe, expect, it } from 'vitest';
import type { ObjectiveView } from '../../types/quest';
import { evaluateObjectives, isObjectiveSatisfied } from '../objectiveTree';
import { progressFromDone, toggleStep } from '../stepProgress';

function leaf(key: string, extra: Partial<ObjectiveView> = {}): ObjectiveView {
  return { key, kind: 'atomic', text: key, oneRound: false, optional: false, hidden: false, children: [], ...extra };
}

function group(key: string, kind: ObjectiveView['kind'], children: ObjectiveView[], extra: Partial<ObjectiveView> = {}): ObjectiveView {
  return { key, kind, oneRound: false, optional: false, hidden: false, children, ...extra };
}

/** Toggles the keys one after the other, from no step done. */
const play = (tree: ObjectiveView, ...keys: string[]) => keys.reduce((done, key) => toggleStep(tree, done, key), new Set<string>());
const sorted = (done: Set<string>) => [...done].sort();

describe('toggleStep', () => {
  it('marks and unmarks a step of a sequence; later steps can be marked on their own', () => {
    const tree = group('0', 'sequence', [leaf('0.0'), leaf('0.1'), leaf('0.2')]);
    expect(sorted(play(tree, '0.0', '0.1'))).toEqual(['0.0', '0.1']);
    expect(sorted(play(tree, '0.0', '0.1', '0.0'))).toEqual(['0.1']);
    expect(sorted(play(tree, '0.2'))).toEqual(['0.2']);
    expect(isObjectiveSatisfied(tree, play(tree, '0.0', '0.1', '0.2'))).toBe(true);
  });

  it('completes an all-of group in any order', () => {
    const tree = group('0', 'allOf', [leaf('0.0'), leaf('0.1')]);
    expect(isObjectiveSatisfied(tree, play(tree, '0.1'))).toBe(false);
    expect(isObjectiveSatisfied(tree, play(tree, '0.1', '0.0'))).toBe(true);
  });

  it('lets one option complete an any-of group and keeps the other options markable', () => {
    const tree = group('0', 'anyOf', [leaf('0.0'), leaf('0.1')]);
    const one = play(tree, '0.1');
    expect(isObjectiveSatisfied(tree, one)).toBe(true);
    expect(evaluateObjectives(tree, one).get('0.0')?.status).toBe('notNeeded');
    expect(sorted(toggleStep(tree, one, '0.0'))).toEqual(['0.0', '0.1']);
    expect(isObjectiveSatisfied(tree, play(tree, '0.1', '0.1'))).toBe(false);
  });

  it('needs the required number of an n-of group', () => {
    const tree = group('0', 'nOf', [leaf('0.0'), leaf('0.1'), leaf('0.2')], { requiredCount: 2 });
    expect(isObjectiveSatisfied(tree, play(tree, '0.2'))).toBe(false);
    expect(isObjectiveSatisfied(tree, play(tree, '0.2', '0.0'))).toBe(true);
  });

  it('does not need optional steps, but they can be marked and unmarked', () => {
    const tree = group('0', 'sequence', [leaf('0.0'), leaf('0.1', { optional: true })]);
    expect(isObjectiveSatisfied(tree, play(tree, '0.0'))).toBe(true);
    expect(sorted(play(tree, '0.1'))).toEqual(['0.1']);
    expect(sorted(play(tree, '0.1', '0.1'))).toEqual([]);
  });

  it('switches the route of an exclusive choice', () => {
    const tree = group('0', 'anyOfExclusive', [
      group('0.0', 'sequence', [leaf('0.0.0'), leaf('0.0.1')]),
      group('0.1', 'sequence', [leaf('0.1.0'), leaf('0.1.1')]),
    ]);
    expect(sorted(play(tree, '0.0.0', '0.0.1', '0.1.0'))).toEqual(['0.1.0']);
    expect(evaluateObjectives(tree, play(tree, '0.0.0')).get('0.1')?.status).toBe('closed');
  });

  it('switches the place of a choice whose routes share the later steps', () => {
    const route = (key: string) => group(key, 'sequence', [leaf(`${key}.0`, { text: `place ${key}` }), leaf(`${key}.1`, { text: 'install' })]);
    const tree = group('0', 'anyOf', [route('0.0'), route('0.1')]);
    expect(sorted(play(tree, '0.0.0', '0.0.1', '0.1.0'))).toEqual(['0.1.0']);
  });

  it('ignores an unknown key', () => {
    expect(sorted(play(leaf('0'), 'x'))).toEqual([]);
  });
});

describe('progressFromDone', () => {
  it('lists the leaves in order', () => {
    expect(progressFromDone(['0.0', '0.1'], new Set(['0.1'])).map((p) => p.completed)).toEqual([false, true]);
  });
});
