import { describe, expect, it } from 'vitest';
import type { MapData, PuzzleGuide } from '../data/types';
import { TINY_MAP } from '../data/__tests__/fixtures/tinyMap';
import { eligibleEntrances, genericSpawnerAllowed, guidesOf, resolveSelection, selectEntrance } from '../data/puzzles';
export const guide: PuzzleGuide = {
  id: 'chain', title: 'Two rooms', status: 'incomplete', missing: ['Button wiring unresolved'],
  rooms: [{ id: 'first', stageId: 'buttons' }, { id: 'second', stageId: 'cell' }],
  entrances: [
    { id: 'first-a', roomId: 'first', stageId: 'buttons', uv: [0.5, 0.5], z: 0, access: 'puzzle', spawnerIndex: 1 },
    { id: 'first-b', roomId: 'first', stageId: 'buttons', uv: [0.6, 0.5], z: 0, access: 'puzzle' },
    { id: 'second-a', roomId: 'second', stageId: 'cell', uv: [0.7, 0.5], z: 0, access: 'mixed', spawnerIndex: 2 },
  ],
  stages: [
    { id: 'buttons', title: 'Buttons', prerequisites: [], activation: 'unordered', required: 4, actionIds: [], outputs: ['first'] },
    { id: 'cell', title: 'Socket', prerequisites: ['buttons'], activation: 'unordered', required: 1, actionIds: [], outputs: ['second'] },
  ],
  actions: [], layouts: [{ id: 'night', label: 'Night', conditions: { only: ['Night Raid'] } }],
  pools: [], hints: [], indicators: [], evidence: [], ownedSpawnerIndices: [1, 2],
};
const map: MapData = { ...TINY_MAP, puzzleSchemaVersion: 2, puzzleGuides: [guide] };
const normal = map.conditions[0], night = map.conditions[1];
describe('v2 entrances and selection', () => {
  it('never falls back to legacy fragments or a missing contract version', () => {
    expect(guidesOf({ ...map, puzzleSchemaVersion: undefined })).toEqual([]);
    expect(guidesOf({ ...map, puzzleSchemaVersion: 1 })).toEqual([]);
  });
  it('retains every entrance, including entrances without a generic spawner', () => {
    expect(eligibleEntrances(map, normal).map((r) => r.entrance.id)).toEqual(['first-a', 'first-b', 'second-a']);
  });
  it('toggles only the same entrance and focuses other stages within a guide', () => {
    const refs = eligibleEntrances(map, normal), first = selectEntrance(null, refs[0]);
    expect(selectEntrance(first, refs[0])).toBeNull();
    expect(selectEntrance(first, refs[2])).toEqual({ guideId: 'chain', entranceId: 'second-a', layoutId: null });
    expect(selectEntrance(first, { guide: { ...guide, id: 'other' }, entrance: refs[0].entrance })?.guideId).toBe('other');
  });
  it('clears selection with filter off and re-enable does not restore it', () => {
    const first = selectEntrance(null, eligibleEntrances(map, normal)[0]);
    const cleared = resolveSelection(map, normal, false, first);
    expect(cleared).toBeNull();
    expect(resolveSelection(map, normal, true, cleared)).toBeNull();
  });
  it('reevaluates guide, stage, entrance and layout gates', () => {
    const first = { ...selectEntrance(null, eligibleEntrances(map, night)[0])!, layoutId: 'night' };
    expect(resolveSelection(map, normal, true, first)?.layoutId).toBeNull();
    expect(resolveSelection(map, night, true, first)).toBe(first);
    for (const gated of [
      { ...guide, conditions: { only: ['Night Raid'] } },
      { ...guide, entrances: guide.entrances.map((e) => ({ ...e, conditions: { only: ['Night Raid'] } })) },
      { ...guide, stages: guide.stages.map((s) => ({ ...s, conditions: { only: ['Night Raid'] } })) },
    ]) expect(resolveSelection({ ...map, puzzleGuides: [gated] }, normal, true, first)).toBeNull();
    expect(resolveSelection(TINY_MAP, normal, true, first)).toBeNull();
  });
  it('suppresses only explicitly referenced puzzle entrances and preserves actual keys/mixed routes', () => {
    expect(genericSpawnerAllowed(map, normal, false, 1)).toBe(false);
    expect(genericSpawnerAllowed(map, normal, false, 0)).toBe(true);
    expect(genericSpawnerAllowed(map, normal, false, 2)).toBe(true);
    expect(genericSpawnerAllowed(map, normal, true, 2)).toBe(false);
    expect(genericSpawnerAllowed(TINY_MAP, normal, true, 1)).toBe(true);
    // No class, empty-key array, or nearby coordinate establishes membership.
    expect(genericSpawnerAllowed({ ...map, puzzleGuides: [{ ...guide, entrances: guide.entrances.map(({ spawnerIndex: _, ...e }) => e) }] }, normal, true, 1)).toBe(true);
  });
});
