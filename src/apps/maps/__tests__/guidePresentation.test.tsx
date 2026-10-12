import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GuideAction, MapData, PuzzleGuide } from '../data/types';
import type { Explorer } from '../model';
import { DEFAULT_PREFS } from '../state';
import { TINY_MAP, TINY_INDEX } from '../data/__tests__/fixtures/tinyMap';
import { available, guidePins, guideTrails, guideOwnsSpawner, resolveSelection } from '../data/puzzles';
import { GuidePanel } from '../GuidePanel';
import en from '../../../shared/i18n/locales/en.json';
vi.mock('../text', async (original) => {
  const actual = await original<typeof import('../text')>();
  const t = (key: string) => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, en) as string ?? key;
  return { ...actual, useMapText: () => actual.makeText(t, (key: string, args: Record<string, string | number>) => t(key).replace(/\{([^}]+)\}/g, (_, name: string) => String(args[name])), String, 'en') };
});
const location = (i: number, extra = {}) => ({ id: `location-${i}`, uv: [0.1 + i / 100, 0.4] as [number, number], z: 0, candidate: false, ...extra });
const empty: PuzzleGuide = {
  id: 'fixture', title: 'Fixture guide', status: 'complete', missing: [],
  rooms: [{ id: 'room', stageId: 'first' }],
  entrances: [{ id: 'door', roomId: 'room', stageId: 'first', uv: [0.8, 0.8], z: 0, access: 'puzzle' }],
  stages: [{ id: 'first', title: 'First room', prerequisites: [], activation: 'unordered', required: 4, actionIds: [], outputs: ['room'] }],
  actions: [], layouts: [], pools: [], hints: [], indicators: [], evidence: [], ownedSpawnerIndices: [1],
};
const mapOf = (guide: PuzzleGuide): MapData => ({ ...TINY_MAP, puzzleSchemaVersion: 2, puzzleGuides: [guide] });
const select = (guide: PuzzleGuide, entranceId = guide.entrances[0].id, layoutId: string | null = null) => ({ guideId: guide.id, entranceId, layoutId });
const exOf = (guide: PuzzleGuide): Explorer => ({ map: mapOf(guide), cond: TINY_MAP.conditions[0], index: TINY_INDEX, prefs: { ...DEFAULT_PREFS, puzzleDoors: true } }) as Explorer;
const render = (guide: PuzzleGuide, entranceId?: string, layoutId: string | null = null) => renderToStaticMarkup(<GuidePanel ex={exOf(guide)} selection={select(guide, entranceId, layoutId)} onSelection={() => {}} />);
const press = (id: string, locations: GuideAction['locations'], extra = {}): GuideAction => ({ id, stageId: 'first', type: 'press', label: 'Verified button', locations, ...extra });
const church: PuzzleGuide = {
  ...empty, id: 'church', title: 'Santa Sofia Church',
  layouts: [1, 2, 3, 4].map((n) => ({ id: `layout-${n}`, label: `Layout ${n}` })),
  stages: [{ ...empty.stages[0], activation: 'ordered', actionIds: ['a1', 'a2', 'a3', 'a4'] }],
  actions: [78, 81, 76, 74].map((symbol, i) => press(`a${i + 1}`, [1, 2, 3, 4].map((n) => location(i * 4 + n, { layoutId: `layout-${n}` })), { order: i + 1, symbol: `mural-${symbol}` })),
  hints: [{ id: 'graffiti', stageId: 'first', symbols: ['mural-78', 'mural-81', 'mural-76', 'mural-74'] }],
  indicators: [{ id: 'lights', stageId: 'first', count: 4 }],
};
const refuge: PuzzleGuide = {
  ...empty, id: 'refuge', title: "Raider's Refuge", status: 'incomplete', missing: ['Exported and observed candidate totals differ'],
  stages: [{ ...empty.stages[0], actionIds: ['p0', 'p1', 'p2', 'p3'] }],
  actions: [5, 7, 7, 5].map((count, n) => press(`p${n}`, Array.from({ length: count }, (_, i) => location(n * 7 + i, { candidate: true })), { poolId: `pool-${n}` })),
  pools: [0, 1, 2, 3].map((n) => ({ id: `pool-${n}`, sourceId: `source-${n}`, actionId: `p${n}`, selection: null })),
};
const gate: PuzzleGuide = {
  ...empty, id: 'locked-gate', title: 'Locked Gate', conditions: { only: ['Locked Gate'] }, status: 'incomplete', missing: ['Reader locations unresolved'],
  stages: [{ ...empty.stages[0], actionIds: [0, 1, 2, 3].flatMap((n) => [`print-${n}`, `carry-${n}`, `insert-${n}`]) }],
  actions: ['Ancient Fort Security Code', "Pilgrim's Peak Security Code", 'Reinforced Reception Security Code', "Raider's Refuge Security Code"].flatMap((itemName, n) => [
    { id: `print-${n}`, stageId: 'first', type: 'print' as const, label: 'Verified code branch', itemSlug: `code-${n}`, itemName, outputItem: `code-${n}`, locations: [] },
    { id: `carry-${n}`, stageId: 'first', type: 'carry' as const, label: 'Transport', itemSlug: `code-${n}`, itemName, inputItem: `code-${n}`, locations: [] },
    { id: `insert-${n}`, stageId: 'first', type: 'insert-code' as const, label: 'Matching console', itemSlug: `code-${n}`, itemName, inputItem: `code-${n}`, locations: [location(n)] },
  ]),
};
const riven: PuzzleGuide = {
  ...empty, id: 'riven-rooms', title: 'Two room stages', status: 'incomplete', missing: ['First-stage wiring unresolved'],
  rooms: [...empty.rooms, { id: 'support', stageId: 'second' }],
  entrances: [...empty.entrances, { ...empty.entrances[0], id: 'support-door', roomId: 'support', stageId: 'second' }],
  stages: [{ ...empty.stages[0], actionIds: ['button'] }, { id: 'second', title: 'Support Building', activation: 'unordered', required: 1, prerequisites: ['first'], actionIds: ['collect', 'insert'], outputs: ['support'] }],
  actions: [press('button', [location(30)]),
    { id: 'collect', stageId: 'second', type: 'collect-fuel-cell', label: 'Fuel-cell candidates', outputItem: 'fuel-cell', locations: Array.from({ length: 21 }, (_, i) => location(i, { candidate: true })) },
    { id: 'insert', stageId: 'second', type: 'insert-fuel-cell', label: 'Fuel-cell socket', inputItem: 'fuel-cell', locations: [location(31)] },
  ],
};
describe('four representative guide workflows', () => {
  it('Church shows all colours, shared sigil sequence and actual ordered activation cues', () => {
    const pins = guidePins(mapOf(church), TINY_MAP.conditions[0], true, select(church));
    expect(pins).toHaveLength(16);
    expect(new Set(pins.map((p) => p.color)).size).toBe(4);
    expect(guideTrails(pins)).toHaveLength(4);
    expect(guideTrails(pins)[0].map((p) => p.action.symbol)).toEqual(['mural-78', 'mural-81', 'mural-76', 'mural-74']);
    const narrowed = guidePins(mapOf(church), TINY_MAP.conditions[0], true, select(church, 'door', 'layout-3'));
    expect(narrowed).toHaveLength(4);
    const html = render(church);
    expect(html).toContain('All layouts'); expect(html).toContain('Layout 4'); expect(html).toContain('not a walking route');
    const root = document.createElement('div'); root.innerHTML = html;
    const legend = root.querySelector('.mx-puzzle__symbols')!;
    expect([...legend.querySelectorAll(':scope > span')].map((e) => e.getAttribute('aria-label'))).toEqual(['Activation 1', 'Activation 2', 'Activation 3', 'Activation 4']);
    expect(legend.textContent).not.toMatch(/78|81|76|74/);
    expect(legend.textContent).toContain('1'); expect(legend.textContent).toContain('4');
    expect(html).toContain('4 progress lights');
  });
  it('groups the exported sixteen-action Church shape into four independently labelled sequences', () => {
    const exported: PuzzleGuide = { ...church, actions: church.layouts.flatMap((layout) => church.actions.map((a) => ({
      ...a, id: `${layout.id}:${a.id}`, label: `${layout.label} button ${a.order}`, poolId: `${layout.id}:${a.id}:pool`,
      locations: a.locations.filter((l) => l.layoutId === layout.id),
    }))) };
    exported.stages = [{ ...church.stages[0], actionIds: exported.actions.map((a) => a.id) }];
    exported.pools = exported.actions.map((a) => ({ id: a.poolId!, sourceId: 'opaque-source', actionId: a.id, selection: null }));
    const root = document.createElement('div'); root.innerHTML = render(exported);
    const groups = [...root.querySelectorAll('.mx-guide__action-group')];
    expect(groups).toHaveLength(4);
    groups.forEach((group, i) => {
      expect(group.querySelector('strong')?.textContent).toBe(`Layout ${i + 1}`);
      expect([...group.querySelectorAll('li > b')].map((e) => e.textContent)).toEqual(['1. ', '2. ', '3. ', '4. ']);
      expect(group.querySelectorAll('li')).toHaveLength(4);
    });
    root.innerHTML = render(exported, 'door', 'layout-3');
    expect(root.querySelectorAll('.mx-guide__action-group')).toHaveLength(1);
    expect(root.querySelectorAll('.mx-guide__action-group li')).toHaveLength(4);
    expect(root.textContent).toContain('Layout 3 button 1');
    expect(root.textContent).not.toContain('Layout 1 button'); expect(root.textContent).not.toContain('Layout 4 button');
    expect(root.textContent).not.toContain('Button group 16'); expect(root.textContent).not.toContain('active selection count is unresolved');
    exported.actions.filter((a) => a.locations[0]?.layoutId === 'layout-3').forEach((a) => a.locations[0].conditions = { not: ['Normal'] });
    root.innerHTML = render(exported, 'door', 'layout-3');
    expect(root.querySelectorAll('.mx-guide__action-group li')).toHaveLength(0);
  });
  it('renders a titled standalone guide shell with an accessible close control and no discovery status', () => {
    const html = render(refuge);
    expect(html).toContain('<h2>Raider&#x27;s Refuge</h2>');
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain('Guide incomplete');
    expect(html).not.toContain('candidate totals differ');
    expect(html).not.toContain('<details>');
  });
  it('does not infer indicator lights from stage activation requirements', () => {
    expect(render({ ...church, indicators: [] })).not.toContain('progress lights');
  });
  it('Refuge retains 24 grouped candidates without numbers, trails or invented selection counts', () => {
    const pins = guidePins(mapOf(refuge), TINY_MAP.conditions[0], true, select(refuge));
    expect(pins).toHaveLength(24);
    expect([0, 1, 2, 3].map((n) => pins.filter((p) => p.action.poolId === `pool-${n}`).length)).toEqual([5, 7, 7, 5]);
    expect(pins.every((p) => p.order == null && p.location.candidate)).toBe(true);
    expect(guideTrails(pins)).toEqual([]);
    const html = render(refuge);
    expect(html).not.toContain('Guide incomplete'); expect(html).not.toContain('candidate totals differ'); expect(html).not.toContain('active selection count is unresolved');
    expect(html).not.toContain('%'); expect(html).not.toContain('source-0'); expect(html).toContain('Button group 1');
  });
  it('Locked Gate explains four separate code branches without inventing printer locations', () => {
    expect(guidePins(mapOf(gate), TINY_MAP.conditions[0], true, select(gate))).toEqual([]);
    const condition = { ...TINY_MAP.conditions[0], name: 'Locked Gate' };
    const ex = { ...exOf(gate), cond: condition };
    const html = renderToStaticMarkup(<GuidePanel ex={ex} selection={select(gate)} onSelection={() => {}} />);
    expect(guidePins(mapOf(gate), condition, true, select(gate))).toHaveLength(4);
    expect(html).toContain('Print the security code'); expect(html).toContain('Carry the item'); expect(html).toContain('matching security code');
    for (const action of gate.actions.filter((a) => a.type === 'print')) expect(html).toContain(action.itemName!.replace(/'/g, '&#x27;'));
    expect(html).not.toContain('Reader locations unresolved');
  });
  it('Riven keeps both stages and all fuel-cell candidates visible from either entrance', () => {
    for (const entrance of riven.entrances) {
      const pins = guidePins(mapOf(riven), TINY_MAP.conditions[0], true, select(riven, entrance.id));
      expect(pins).toHaveLength(23); expect(pins.filter((p) => p.location.candidate)).toHaveLength(21);
      const html = render(riven, entrance.id);
      expect(html).toContain('Access after: First room'); expect(html).toContain('before or after opening the room');
      expect(html).toContain('First room'); expect(html).toContain('Support Building');
      expect(html).toContain('aria-current="step"');
    }
  });
  it('combines action, stage, layout and candidate gates; discards unavailable selection', () => {
    const gated = { ...church, layouts: church.layouts.map((l) => ({ ...l, conditions: { only: ['Night Raid'] } })) };
    expect(guidePins(mapOf(gated), TINY_MAP.conditions[0], true, select(gated))).toEqual([]);
    expect(resolveSelection(mapOf(gated), TINY_MAP.conditions[0], true, select(gated, 'door', 'layout-2'))?.layoutId).toBeNull();
    for (const gateAt of ['action', 'stage', 'location'] as const) {
      const g = structuredClone(church);
      if (gateAt === 'action') g.actions.forEach((a) => a.conditions = { only: ['Night Raid'] });
      if (gateAt === 'stage') g.stages.forEach((s) => s.conditions = { only: ['Night Raid'] });
      if (gateAt === 'location') g.actions.forEach((a) => a.locations.forEach((l) => l.conditions = { only: ['Night Raid'] }));
      expect(guidePins(mapOf(g), TINY_MAP.conditions[0], true, select(g))).toEqual([]);
    }
    expect(available({ conditions: { not: ['Normal'] } }, TINY_MAP.conditions[0])).toBe(false);
  });
  it('never draws a fixed trail for runtime order or duplicated ambiguous placements', () => {
    const g = { ...church, stages: [{ ...church.stages[0], activation: 'runtime-ordered' as const }] };
    expect(guideTrails(guidePins(mapOf(g), TINY_MAP.conditions[0], true, select(g)))).toEqual([]);
    const pins = guidePins(mapOf(church), TINY_MAP.conditions[0], true, select(church, 'door', 'layout-1'));
    expect(guideTrails([...pins, pins[0]])).toEqual([]);
  });
  it('filter off clears every pin/trail/owned-marker suppression and old maps never render guides', () => {
    for (const g of [church, refuge, gate, riven]) {
      expect(guidePins(mapOf(g), TINY_MAP.conditions[0], false, select(g))).toEqual([]);
      expect(guideOwnsSpawner(mapOf(g), TINY_MAP.conditions[0], false, select(g), 1)).toBe(false);
    }
    expect(guideOwnsSpawner(mapOf(church), TINY_MAP.conditions[0], true, select(church), 1)).toBe(true);
    expect(guideOwnsSpawner(mapOf(church), TINY_MAP.conditions[0], true, select(church), 2)).toBe(false);
    expect(guidePins(TINY_MAP, TINY_MAP.conditions[0], true, select(church))).toEqual([]);
    expect(renderToStaticMarkup(<GuidePanel ex={{ ...exOf(church), prefs: DEFAULT_PREFS }} selection={select(church)} onSelection={() => {}} />)).toBe('');
  });
});
