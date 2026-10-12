import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapEngine, type Target, type TipState } from '../MapEngine';
import type { Explorer } from '../../model';
import { DEFAULT_PREFS, parseState } from '../../state';
import type { PuzzleGuide } from '../../data/types';
import { TINY_MAP } from '../../data/__tests__/fixtures/tinyMap';
import { guidePins, type GuideSelection } from '../../data/puzzles';
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
  it('action pin taps isolate, restore, and switch Church layouts while keeping the tooltip', () => {
    const church: PuzzleGuide = {
      ...guide, id: 'church', layouts: [{ id: 'layout-1', label: 'Layout 1' }, { id: 'layout-2', label: 'Layout 2' }],
      stages: [{ ...guide.stages[0], activation: 'ordered', actionIds: ['one', 'two'] }],
      actions: [
        { id: 'one', stageId: 'stage', type: 'press', label: 'Button 1', order: 1, locations: [{ id: 'one-location', uv: [0.2, 0.2], z: 0, candidate: false, layoutId: 'layout-1' }] },
        { id: 'two', stageId: 'stage', type: 'press', label: 'Button 2', order: 2, locations: [{ id: 'two-location', uv: [0.3, 0.3], z: 0, candidate: false, layoutId: 'layout-2' }] },
      ],
    };
    const tip = vi.fn<(state: TipState | null) => void>(), choose = vi.fn<(selection: GuideSelection | null) => void>();
    const wrap = document.createElement('div'), canvas = document.createElement('canvas');
    Object.defineProperties(wrap, { clientWidth: { value: 1000 }, clientHeight: { value: 1000 } });
    engine = new MapEngine(wrap, canvas, tip, choose);
    const map = { ...TINY_MAP, puzzleSchemaVersion: 2, puzzleGuides: [church] };
    const ex = { map, state: parseState(new URLSearchParams(), 'tiny', 'tiny'), ci: 0, cond: map.conditions[0], prefs: { ...DEFAULT_PREFS, puzzleDoors: true }, spawnerKind: () => null, socketVisible: () => false, onLayer: () => true } as unknown as Explorer;
    let current: GuideSelection | null = { guideId: 'church', entranceId: 'door', layoutId: null };
    const sync = () => { current = choose.mock.lastCall?.[0] ?? current; engine.update(ex, { canvas: null, order: [] }, {}, current); };
    engine.update(ex, { canvas: null, order: [] }, {}, current);
    const harness = engine as unknown as Harness;
    const tapAt = (uv: [number, number]) => { const [x, y] = harness.toScreen(...uv); harness.tap({ x, y }); sync(); };
    const tooltipLocation = () => {
      const shown = tip.mock.lastCall?.[0];
      return shown?.target.t === 'action' ? guidePins(map, ex.cond, true, current)[shown.target.i]?.location.id : undefined;
    };
    tapAt([0.2, 0.2]); expect(current?.layoutId).toBe('layout-1');
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ touch: true, target: { t: 'action', i: 0 } }));
    expect(tooltipLocation()).toBe('one-location');
    tapAt([0.2, 0.2]); expect(current?.layoutId).toBeNull();
    expect(tooltipLocation()).toBe('one-location');
    vi.advanceTimersByTime(400);
    tapAt([0.3, 0.3]); expect(current?.layoutId).toBe('layout-2');
    expect(tooltipLocation()).toBe('two-location');
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ touch: true, target: { t: 'action', i: 0 } }));
    tapAt([0.3, 0.3]); expect(current?.layoutId).toBeNull();
    expect(tooltipLocation()).toBe('two-location');
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ touch: true, target: { t: 'action', i: 1 } }));
  });
  it('plain socket/action pins have delayed hover and touch tooltips', () => {
    const { tip, harness } = setup(), [x, y] = harness.toScreen(0.4, 0.4);
    expect(harness.hitTest(x, y)).toEqual({ t: 'action', i: 0 });
    harness.hoverAt(x, y); vi.advanceTimersByTime(130);
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ target: { t: 'action', i: 0 } }));
    harness.tap({ x, y });
    expect(tip).toHaveBeenLastCalledWith(expect.objectContaining({ touch: true, target: { t: 'action', i: 0 } }));
  });
  it('mouse hover and touch highlight every alternative in the same source group', () => {
    const { ex, harness } = setup();
    const pooled: PuzzleGuide = { ...guide, actions: [{ ...guide.actions[0], poolId: 'fuel-pool', locations: [
      { id: 'location', uv: [0.4, 0.4], z: 0, candidate: true },
      { id: 'alternative', uv: [0.6, 0.6], z: 0, candidate: true },
    ] }], presentation: { schemaVersion: 1, pattern: 'workflow', palette: 'groups', roomCount: 1,
      steps: [{ id: 'stage', number: 1, role: 'interact', stageIds: ['stage'], actionIds: ['socket'], entranceIds: ['door'], roomIds: ['room'] }],
      groups: [{ id: 'fuel-pool', kind: 'source', number: 1, actionIds: ['socket'], locationIds: ['location', 'alternative'], poiIds: [], poolId: 'fuel-pool', selection: null }] } };
    engine.update({ ...ex, map: { ...ex.map, puzzleGuides: [pooled] } }, { canvas: null, order: [] }, {}, selection);
    const draw = engine as unknown as { puzzlePin: (...args: unknown[]) => void; iconMarker: () => void; drawPuzzles: (ctx: CanvasRenderingContext2D, w: number, h: number) => void };
    const markers = vi.spyOn(draw, 'puzzlePin').mockImplementation(() => {});
    vi.spyOn(draw, 'iconMarker').mockImplementation(() => {});
    const ctx = { save() {}, restore() {}, setLineDash() {} } as unknown as CanvasRenderingContext2D;
    const [x, y] = harness.toScreen(0.4, 0.4);
    harness.hoverAt(x, y);
    draw.drawPuzzles(ctx, 1000, 1000);
    expect(markers.mock.calls.map((args) => args[7])).toEqual([true, true]);
    markers.mockClear();
    harness.tap({ x, y });
    draw.drawPuzzles(ctx, 1000, 1000);
    expect(markers.mock.calls.map((args) => args[7])).toEqual([true, true]);
  });
  it('linked map highlights clear when the guide closes or the condition changes', () => {
    const { ex } = setup();
    engine.highlightGuide({ locationIds: ['location'], entranceIds: ['door'], poiIds: [] });
    const getHighlight = () => (engine as unknown as { guideHighlight: unknown }).guideHighlight;
    expect(getHighlight()).not.toBeNull();
    engine.update(ex, { canvas: null, order: [] }, {}, null);
    expect(getHighlight()).toBeNull();
    engine.update(ex, { canvas: null, order: [] }, {}, selection);
    engine.highlightGuide({ locationIds: ['location'], entranceIds: [], poiIds: [] });
    engine.update({ ...ex, ci: 1 }, { canvas: null, order: [] }, {}, selection);
    expect(getHighlight()).toBeNull();
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
    for (const next of [null, { ...selection, guideId: 'another-guide' }]) {
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
