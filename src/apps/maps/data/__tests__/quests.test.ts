import { describe, expect, it } from 'vitest';
import type { ObjectiveView, Quest } from '../../../quests/types/quest';
import { pickQuests, questMapCounts, questPins, questStepsFor } from '../quests';
import type { MapData, MapIndex, QuestMarker } from '../types';
import { TINY_INDEX, TINY_MAP } from './fixtures/tinyMap';

const leaf = (key: string): ObjectiveView => ({ key, kind: 'atomic', text: key, oneRound: false, optional: false, hidden: false, children: [] });
const group = (key: string, kind: ObjectiveView['kind'], children: ObjectiveView[]): ObjectiveView => ({ key, kind, oneRound: false, optional: false, hidden: false, children });
const quest = (id: string, tree: ObjectiveView): Quest => ({ id, name: id, objectiveTree: tree, objectiveLeafKeys: [] } as unknown as Quest);

const marker = (k: QuestMarker['k'], extra: Partial<QuestMarker> = {}): QuestMarker => ({ k, uv: [0.5, 0.5], z: 0, ...extra });
const map: MapData = {
  ...TINY_MAP,
  quests: [marker('area', { polygons: [[[0.4, 0.4], [0.6, 0.4], [0.6, 0.6]]] }), marker('interact'), marker('interact', { only: ['Night Raid'] }), marker('photo')],
  levels: { ...TINY_MAP.levels, quests: [[0, null, 0], [0, null, 0], [0, null, 0], [1, null, 0]] },
  questSteps: { q: { '0.0': { m: [0] }, '0.1': { m: [1] }, '0.2': { m: [1, 2] }, '0.3': { m: [3], any: 1 } } },
};
const tree = group('0', 'sequence', [leaf('0.0'), leaf('0.1'), leaf('0.2'), leaf('0.3')]);
const normal = map.conditions[0];

describe('questPins', () => {
  const picked = pickQuests(map, ['q'], new Map([['q', quest('q', tree)]]), () => new Set(['0.0']));

  it('merges the steps at the same object into one pin with the range of their numbers', () => {
    const pins = questPins(map, picked, normal, () => true);
    expect(pins.map((p) => [p.marker, p.keys, p.label])).toEqual([
      [0, ['0.0'], '1'], // areas first
      [3, ['0.3'], '4'], // then the candidates of "any" steps
      [1, ['0.1', '0.2'], '2–3'],
      [2, ['0.2'], '3'],
    ]);
    expect(pins[2].any).toBe(false);
    expect(pins[1].any).toBe(true);
  });

  it('fades done steps, markers on another layer and markers absent under the condition', () => {
    const pins = questPins(map, picked, normal, (m) => (map.levels.quests[m][0] ?? 0) === 0);
    const dim = Object.fromEntries(pins.map((p) => [p.marker, p.dim]));
    expect(dim).toEqual({ 0: true, 1: false, 2: true, 3: true });
    expect(questPins(map, picked, map.conditions[1], () => true).find((p) => p.marker === 2)?.dim).toBe(false);
  });

  it('assigns colours in the order picked', () => {
    const two = pickQuests(map, ['q', 'other'], new Map(), () => new Set());
    expect(two[0].color).not.toBe(two[1].color);
    expect(two[1].steps).toEqual({});
  });
});

describe('questStepsFor', () => {
  it('lists only the routes on this map when a route choice has one here', () => {
    const routes = group('0', 'anyOfExclusive', [group('0.0', 'sequence', [leaf('0.0.0'), leaf('0.0.1')]), group('0.1', 'sequence', [leaf('0.1.0'), leaf('0.1.1')])]);
    const q = quest('r', group('root', 'sequence', [leaf('root.0'), routes]));
    expect(questStepsFor(q, (k) => k === '0.1.0').map((l) => l.key)).toEqual(['root.0', '0.1.0', '0.1.1']);
    expect(questStepsFor(q, () => false).map((l) => l.key)).toEqual(['root.0', '0.0.0', '0.0.1', '0.1.0', '0.1.1']);
  });
});

describe('questMapCounts', () => {
  it('adds up the located steps of the picked quests per map', () => {
    const index: MapIndex = { ...TINY_INDEX, quests: [{ slug: 'a', maps: { x: 2, y: 1 } }, { slug: 'b', maps: { x: 3 } }] };
    expect([...questMapCounts(index, ['a', 'b'])]).toEqual([['x', 5], ['y', 1]]);
  });
});

describe('map-wide areas', () => {
  it('turns steps whose only places cover most of the map into "anywhere on this map"', () => {
    const wide: MapData = {
      ...map,
      quests: [...map.quests, marker('area', { polygons: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })],
      levels: { ...map.levels, quests: [...map.levels.quests, [0, null, 0]] },
      questSteps: { q: { '0.0': { m: [4] }, '0.1': { m: [1, 4] } } },
    };
    const [p] = pickQuests(wide, ['q'], new Map([['q', quest('q', tree)]]), () => new Set());
    expect([...p.anywhere]).toEqual(['0.0']);
    expect(p.steps).toEqual({ '0.1': { m: [1] } });
    expect(questPins(wide, [p], normal, () => true).map((pin) => pin.marker)).toEqual([1]);
  });
});
