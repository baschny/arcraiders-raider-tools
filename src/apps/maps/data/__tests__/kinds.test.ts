import { describe, expect, it } from 'vitest';
import { classify, enemyColor, KIND, leavesOf, tableEnemies, tableEnemyProbs } from '../kinds';
import type { MapData } from '../types';
import { TINY_INDEX, TINY_MAP } from './fixtures/tinyMap';

const keys = (kinds: { key: string }[]) => kinds.map((k) => k.key);

describe('classify', () => {
  const cls = classify(TINY_MAP);

  it('gives each socket a kind by container tag; ground loot without container', () => {
    expect(keys(cls.socketKind)).toEqual(['Industrial', 'Industrial', 'Tech', 'Lemon', 'WaterTank', 'BirdNest', 'Mushroom', 'Ground', 'Industrial']);
  });

  it('splits container kinds into container types, other kinds are one leaf', () => {
    expect(cls.socketLeaf).toEqual([
      't:Industrial.Lockers', 't:Industrial.Toolbox', 't:Tech.Computer', 'Lemon', 'WaterTank', 'BirdNest', 'Mushroom', 'Ground', 't:Industrial.Lockers',
    ]);
  });

  it('puts the water tank with the containers and unknown categories into Other', () => {
    expect(KIND.get('WaterTank')!.cat).toBe('Containers');
    const other = classify({ ...TINY_MAP, sockets: [[0, 0, 0, 6, 0, -1, -1, -1]] });
    expect(other.socketKind[0].key).toBe('OtherFixed');
    expect(other.socketLeaf[0]).toBe('t:Weird.Thing');
  });

  it('lists the container types per kind, sorted by label', () => {
    expect(cls.types.get('Industrial')).toEqual(['Industrial.Lockers', 'Industrial.Toolbox']);
    expect(cls.types.get('Tech')).toEqual(['Tech.Computer']);
    expect(cls.types.has('Lemon')).toBe(false);
  });

  it('gives spawners their kinds with shares, primary first', () => {
    expect(cls.spawnerKinds[0].map(([k, s]) => [k.key, s])).toEqual([['AmmoBox', 0.75], ['CacheStandard', 0.25]]);
    expect(cls.spawnerKinds[1].map(([k, s]) => [k.key, s])).toEqual([['LockedDoor', 1]]);
    expect(cls.spawnerKinds[2]).toEqual([]);
  });

  it('splits shares evenly when the build has none and merges classes of one kind', () => {
    const map: MapData = { ...TINY_MAP, spawnerClasses: ['BP_RaiderCache_WA_C | BP_RaiderCache_WA_B | BP_Raider_Backpack_C'], spawnerShares: [], spawners: [[0, 0, 0]] };
    const [[first, second]] = classify(map).spawnerKinds;
    expect(first[0].key).toBe('CacheStandard');
    expect(first[1]).toBeCloseTo(2 / 3);
    expect(second[0].key).toBe('Backpack');
    expect(second[1]).toBeCloseTo(1 / 3);
  });

  it('reads the key items of locked doors', () => {
    expect(cls.spawnerKeys).toEqual([null, ['Key_A', 'Key_B'], null]);
  });

  it('is cached per map object', () => {
    expect(classify(TINY_MAP)).toBe(cls);
  });
});

describe('leavesOf', () => {
  const cls = classify(TINY_MAP);

  it('gives the container types of a container kind', () => {
    expect(leavesOf(cls, KIND.get('Industrial')!)).toEqual(['t:Industrial.Lockers', 't:Industrial.Toolbox']);
  });

  it('gives the kind itself otherwise (also for container kinds not on the map)', () => {
    expect(leavesOf(cls, KIND.get('Lemon')!)).toEqual(['Lemon']);
    expect(leavesOf(cls, KIND.get('Electrical')!)).toEqual(['Electrical']);
  });
});

describe('enemyColor', () => {
  it('has a fixed color for known enemies', () => {
    expect(enemyColor('Wasp')).toBe('#5aaec4');
    expect(enemyColor('Queen')).toBe('#e0604f');
  });

  it('gives unknown names a stable color', () => {
    const c = enemyColor('Some New Drone');
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(enemyColor('Some New Drone')).toBe(c);
    expect(enemyColor('')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('tableEnemies', () => {
  it('collects the enemies of all lists and difficulties', () => {
    expect(tableEnemies(TINY_INDEX, 'A')).toEqual(new Set([0, 1]));
    expect(tableEnemies(TINY_INDEX, 'C')).toEqual(new Set([1, 2]));
    expect(tableEnemies(TINY_INDEX, null)).toEqual(new Set());
    expect(tableEnemies(TINY_INDEX, 'missing')).toEqual(new Set());
  });
});

describe('tableEnemyProbs', () => {
  const probs = (t: string | null) => Object.fromEntries(tableEnemyProbs(TINY_INDEX, t));

  it('weights the groups of a list', () => {
    expect(probs('A')).toEqual({ 0: 1, 1: 0.25 });
  });

  it('averages over tiers', () => {
    expect(probs('B')).toEqual({ 0: 0.5, 2: 0.5 });
  });

  it('falls back to difficulties and counts unweighted groups equally', () => {
    expect(probs('C')).toEqual({ 1: 0.5, 2: 0.5 });
  });

  it('gives zero-weight groups no chance when others are weighted', () => {
    expect(probs('E')).toEqual({ 0: 1, 1: 0 });
  });

  it('counts an enemy once per group', () => {
    expect(probs('D')).toEqual({ 0: 1 });
  });

  it('is empty for unknown tables', () => {
    expect(tableEnemyProbs(TINY_INDEX, null).size).toBe(0);
    expect(tableEnemyProbs(TINY_INDEX, 'missing').size).toBe(0);
  });

  it('is cached per index and table', () => {
    expect(tableEnemyProbs(TINY_INDEX, 'A')).toBe(tableEnemyProbs(TINY_INDEX, 'A'));
  });
});
