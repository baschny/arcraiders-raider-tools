import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapEngine, type Target, type TipState } from '../MapEngine';
import type { Explorer } from '../../model';
import { DEFAULT_PREFS, parseState } from '../../state';
import type { PuzzleGuide } from '../../data/types';
import { TINY_MAP } from '../../data/__tests__/fixtures/tinyMap';
import type { GuideSelection } from '../../data/puzzles';
const guide: PuzzleGuide = {
  id: 'test', title: 'Guide', status: 'complete', missing: [],
  entrances: [{ id: 'door', roomId: 'room', stageId: 'stage', uv: [0.8, 0.8], z: 0, access: 'puzzle' }],
  rooms: [{ id: 'room', stageId: 'stage' }],
  stages: [{ id: 'stage', title: 'Stage', prerequisites: [], activation: 'unordered', required: 1, actionIds: ['socket'], outputs: ['room'] }],
  actions: [{ id: 'socket', stageId: 'stage', type: 'insert-fuel-cell', label: 'Socket', inputItem: 'fuel-cell', locations: [{ id: 'location', uv: [0.4, 0.4], z: 0, candidate: false }] }],
  layouts: [], pools: [], hints: [], indicators: [], evidence: [], ownedSpawnerIndices: [],
};
const selection: GuideSelection = { guideId: 'test', entranceId: 'door', layoutId: null };
interface Harness { toScreen(u: number, v: number): [number, number]; hoverAt(x: number, y: number): void; tap(pos: { x: number; y: number }): void; hitTest(x: number, y: number): Target | null }
let engine: MapEngine;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { engine?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const tip = vi.fn<(state: TipState | null) => void>(), choose = vi.fn();
  const wrap = document.createElement('div'), canvas = document.createElement('canvas');
  Object.defineProperties(wrap, { clientWidth: { value: 1000 }, clientHeight: { value: 1000 } });
  engine = new MapEngine(wrap, canvas, tip, choose);
  const map = { ...TINY_MAP, puzzleSchemaVersion: 2, puzzleGuides: [guide] };
  const ex = { map, state: parseState(new URLSearchParams(), 'tiny', 'tiny'), ci: 0, cond: map.conditions[0], prefs: { ...DEFAULT_PREFS, puzzleDoors: true }, spawnerKind: () => null, socketVisible: () => false, onLayer: () => true } as unknown as Explorer;
  engine.update(ex, { canvas: null, order: [] }, {}, selection);
  return { tip, choose, ex, harness: engine as unknown as Harness };
}
describe('guide canvas interactions', () => {
  it('plain socket/action pins have delayed hover and touch tooltips', () => {
    const { tip, harness } = setup(), [x, y] = harness.toScreen(0.4, 0.4);
    expect(harness.hitTest(x, y)).toEqual({ t: 'action', i: 0 });
    harness.hoverAt(x, y); vi.advanceTimersByTime(130);
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ target: { t: 'action', i: 0 } }));
    harness.tap({ x, y });
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ touch: true, target: { t: 'action', i: 0 } }));
  });
  it('filter off clears touch and hover tooltips and re-enable shows entrances only', () => {
    const { tip, harness, ex } = setup(), [x, y] = harness.toScreen(0.4, 0.4);
    harness.tap({ x, y });
    engine.update({ ...ex, prefs: DEFAULT_PREFS }, { canvas: null, order: [] }, {}, null);
    expect(tip).toHaveBeenLastCalledWith(null); expect(engine.pinned()).toBeNull();
    expect(harness.hitTest(x, y)).not.toEqual({ t: 'action', i: 0 });
    engine.update(ex, { canvas: null, order: [] }, {}, null);
    expect(harness.hitTest(x, y)).not.toEqual({ t: 'action', i: 0 });
    const [dx, dy] = harness.toScreen(0.8, 0.8);
    expect(harness.hitTest(dx, dy)).toEqual({ t: 'entrance', i: 0 });
  });
  it('changing selected guide, condition, layout or map dismisses an existing action tooltip', () => {
    const { tip, harness, ex } = setup(), [x, y] = harness.toScreen(0.4, 0.4);
    for (const next of [null, { ...selection, layoutId: 'other' }]) {
      engine.update(ex, { canvas: null, order: [] }, {}, selection);
      harness.hoverAt(x, y); vi.advanceTimersByTime(130);
      engine.update(ex, { canvas: null, order: [] }, {}, next);
      expect(tip).toHaveBeenLastCalledWith(null);
    }
    for (const next of [{ ...ex, ci: 1, cond: ex.map.conditions[1] }, { ...ex, map: { ...ex.map, map: 'different' } }]) {
      engine.update(ex, { canvas: null, order: [] }, {}, selection);
      harness.tap({ x, y });
      engine.update(next, { canvas: null, order: [] }, {}, null);
      expect(tip).toHaveBeenLastCalledWith(null);
    }
  });
});
