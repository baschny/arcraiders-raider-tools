// Public v2 guide selection. No class/proximity matching and no legacy fallback.
import type { GuideConditions, GuideEntrance, MapCondition, MapData, PuzzleGuide } from './types';
export const PUZZLE_COLORS = ['#e0604f', '#4fb0e0', '#8fbf6a', '#d9cc5c', '#c27cb3', '#5bb594', '#d9a03e', '#8e97d4'];
export const PLAIN_PUZZLE_COLOR = '#b9c0c7';
export const symbolLabel = (key: string) => key.split('-').pop() ?? key;
export const symbolOf = (map: MapData, key: string | undefined) => key ? map.symbols?.find((s) => s.key === key) : undefined;
export const available = (element: { conditions?: GuideConditions }, cond: MapCondition): boolean =>
  !element.conditions?.not?.includes(cond.name) && (!element.conditions?.only || element.conditions.only.includes(cond.name));
export const guidesOf = (map: MapData): PuzzleGuide[] => map.puzzleSchemaVersion === 2 ? map.puzzleGuides ?? [] : [];
export interface EntranceRef { guide: PuzzleGuide; entrance: GuideEntrance }
export interface GuideSelection { guideId: string; entranceId: string; layoutId: string | null }
export function eligibleEntrances(map: MapData, cond: MapCondition): EntranceRef[] {
  return guidesOf(map).filter((g) => available(g, cond)).flatMap((guide) => guide.entrances
    .filter((e) => available(e, cond) && guide.stages.some((s) => s.id === e.stageId && available(s, cond)))
    .map((entrance) => ({ guide, entrance })));
}
export function resolveSelection(map: MapData, cond: MapCondition, enabled: boolean, selection: GuideSelection | null): GuideSelection | null {
  if (!enabled || !selection) return null;
  const ref = eligibleEntrances(map, cond).find((e) => e.guide.id === selection.guideId && e.entrance.id === selection.entranceId);
  if (!ref) return null;
  return selection.layoutId && !ref.guide.layouts.some((l) => l.id === selection.layoutId && available(l, cond))
    ? { ...selection, layoutId: null } : selection;
}
export function selectEntrance(selection: GuideSelection | null, ref: EntranceRef): GuideSelection | null {
  if (selection?.guideId === ref.guide.id && selection.entranceId === ref.entrance.id) return null;
  return { guideId: ref.guide.id, entranceId: ref.entrance.id, layoutId: selection?.guideId === ref.guide.id ? selection.layoutId : null };
}
/** Only explicit identity references suppress duplicates; mixed access keeps its key route when hidden. */
export function genericSpawnerAllowed(map: MapData, cond: MapCondition, enabled: boolean, i: number): boolean {
  return !eligibleEntrances(map, cond).some(({ guide, entrance: e }) =>
    (e.spawnerIndex === i || (guide.ownedSpawnerIndices.includes(i) && /LockedRoomExploitPreventionArea/.test(map.spawnerClasses[map.spawners[i]?.[2]] ?? '')))
    && (enabled || e.access === 'puzzle'));
}
