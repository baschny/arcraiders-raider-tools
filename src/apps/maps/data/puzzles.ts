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

export interface GuidePin {
  action: import('./types').GuideAction; location: import('./types').GuideLocation;
  stage: import('./types').GuideStage; color: string; order: number | null; stepNumber: number | null; groupId: string | null;
}
export const layoutColor = (guide: PuzzleGuide, layoutId?: string): string => layoutId
  ? PUZZLE_COLORS[Math.max(0, guide.layouts.findIndex((l) => l.id === layoutId)) % PUZZLE_COLORS.length] : PLAIN_PUZZLE_COLOR;
/** A shared toggle used by the legend and map pins: a second selection restores every layout. */
export function toggleLayout(selection: GuideSelection, layoutId: string): GuideSelection {
  return { ...selection, layoutId: selection.layoutId === layoutId ? null : layoutId };
}
export function selectedGuide(map: MapData, cond: MapCondition, enabled: boolean, selection: GuideSelection | null): PuzzleGuide | null {
  const current = resolveSelection(map, cond, enabled, selection);
  return current ? guidesOf(map).find((g) => g.id === current.guideId) ?? null : null;
}
export function guidePins(map: MapData, cond: MapCondition, enabled: boolean, selection: GuideSelection | null): GuidePin[] {
  const current = resolveSelection(map, cond, enabled, selection), guide = selectedGuide(map, cond, enabled, current);
  if (!guide || !current) return [];
  return guide.actions.flatMap((action) => {
    const stage = guide.stages.find((s) => s.id === action.stageId && s.actionIds.includes(action.id));
    if (!stage || !available(stage, cond) || !available(action, cond)) return [];
    return action.locations.filter((location) => available(location, cond) &&
      (!location.layoutId || guide.layouts.some((l) => l.id === location.layoutId && available(l, cond))) &&
      (!current.layoutId || !location.layoutId || location.layoutId === current.layoutId))
       .map((location) => {
        const step = visibleSteps(guide, cond, current.layoutId).find((s) => s.actionIds.includes(action.id) && s.role !== 'find-buttons');
        const group = visibleGroups(guide, cond, current.layoutId).find((g) => g.locationIds.includes(location.id));
        const color = location.layoutId ? layoutColor(guide, location.layoutId)
          : group ? groupColor(group.number) : PLAIN_PUZZLE_COLOR;
        return { action, stage, location, color, order: stage.activation === 'ordered' ? action.order ?? null : null,
          stepNumber: step?.number ?? null, groupId: group?.id ?? null };
      });
  });
}
/** Order cues only when a stage/layout has one verified location per numbered interaction. */
export function guideTrails(pins: GuidePin[]): GuidePin[][] {
  const groups = new Map<string, GuidePin[]>();
  for (const pin of pins) {
    if (pin.order == null) continue;
    const key = JSON.stringify([pin.stage.id, pin.location.layoutId ?? null]);
    groups.set(key, [...groups.get(key) ?? [], pin]);
  }
  return [...groups.values()].filter((group) => group.length > 1 && new Set(group.map((p) => p.order)).size === group.length)
    .map((group) => [...group].sort((a, b) => a.order! - b.order!));
}
/** Exclude only the selected guide's explicit mechanism identities; other key doors survive. */
export function guideOwnsSpawner(map: MapData, cond: MapCondition, enabled: boolean, selection: GuideSelection | null, i: number): boolean {
  return selectedGuide(map, cond, enabled, selection)?.ownedSpawnerIndices.includes(i) ?? false;
}

export interface GuideActionGroup { layout: PuzzleGuide['layouts'][number] | null; actions: import('./types').GuideAction[] }
/** Instructions follow the same layout/location gates as map pins; unlocated transport remains logical. */
export function stageActionGroups(guide: PuzzleGuide, stage: import('./types').GuideStage, cond: MapCondition, layoutId: string | null): GuideActionGroup[] {
  if (!available(guide, cond) || !available(stage, cond)) return [];
  const layouts = guide.layouts.filter((l) => available(l, cond) && (!layoutId || l.id === layoutId));
  const actions = guide.actions.filter((a) => a.stageId === stage.id && stage.actionIds.includes(a.id) && available(a, cond));
  const groups: GuideActionGroup[] = [];
  const common = actions.filter((a) => !a.locations.length || a.locations.some((l) => !l.layoutId && available(l, cond)));
  if (common.length) groups.push({ layout: null, actions: common });
  for (const layout of layouts) {
    const inLayout = actions.filter((a) => a.locations.some((l) => l.layoutId === layout.id && available(l, cond)));
    if (inLayout.length) groups.push({ layout, actions: inLayout });
  }
  return groups.map((group) => ({ ...group, actions: stage.activation === 'ordered'
    ? [...group.actions].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)) : group.actions }));
}

export const groupColor = (number?: number): string => number == null ? PLAIN_PUZZLE_COLOR : PUZZLE_COLORS[(number - 1) % PUZZLE_COLORS.length];
export type GuideStep = import('./types').PuzzlePresentation['steps'][number];
export type GuideGroup = import('./types').PuzzlePresentation['groups'][number];
/** Resolve every semantic reference through the same gates as its real map member. */
export function visibleSteps(guide: PuzzleGuide, cond: MapCondition, layoutId: string | null): GuideStep[] {
  if (!available(guide, cond)) return [];
  const stages = guide.stages.filter((s) => available(s, cond));
  const locations = visibleLocations(guide, cond, layoutId);
  const actions = guide.actions.filter((a) => available(a, cond) && stages.some((s) => s.id === a.stageId && s.actionIds.includes(a.id)) && (!a.locations.length || locations.some((l) => a.locations.some((v) => v.id === l.id))));
  return (guide.presentation?.steps ?? []).flatMap((step) => {
    const stageIds = step.stageIds.filter((id) => stages.some((s) => s.id === id));
    if (!stageIds.length) return [];
    return [{ ...step, stageIds, actionIds: step.actionIds.filter((id) => actions.some((a) => a.id === id)),
      entranceIds: step.entranceIds.filter((id) => guide.entrances.some((e) => e.id === id && stageIds.includes(e.stageId) && available(e, cond))),
      roomIds: step.roomIds.filter((id) => guide.rooms.some((r) => r.id === id && stageIds.includes(r.stageId))) }];
  });
}
export function visibleLocations(guide: PuzzleGuide, cond: MapCondition, layoutId: string | null) {
  if (!available(guide, cond)) return [];
  return guide.actions.filter((a) => available(a, cond) && guide.stages.some((s) => s.id === a.stageId && s.actionIds.includes(a.id) && available(s, cond)))
    .flatMap((a) => a.locations).filter((l) => available(l, cond) && (!layoutId || !l.layoutId || l.layoutId === layoutId) && (!l.layoutId || guide.layouts.some((v) => v.id === l.layoutId && available(v, cond))));
}
export function visibleGroups(guide: PuzzleGuide, cond: MapCondition, layoutId: string | null): GuideGroup[] {
  const locations = visibleLocations(guide, cond, layoutId);
  return (guide.presentation?.groups ?? []).filter((g) => available(g, cond)).flatMap((g) => {
    const locationIds = g.locationIds.filter((id) => locations.some((l) => l.id === id));
    return locationIds.length ? [{ ...g, locationIds, poiIds: [...new Set(locations.filter((l) => locationIds.includes(l.id)).flatMap((l) => l.poiIds ?? []))] }] : [];
  });
}
export interface GuideTargets { locationIds: string[]; entranceIds: string[]; poiIds: string[] }
export function stepTargets(guide: PuzzleGuide, cond: MapCondition, selection: GuideSelection, step: GuideStep): GuideTargets {
  const locations = visibleLocations(guide, cond, selection.layoutId).filter((l) => guide.actions.some((a) => step.actionIds.includes(a.id) && a.locations.some((v) => v.id === l.id)));
  return { locationIds: locations.map((l) => l.id), entranceIds: step.entranceIds, poiIds: [...new Set(locations.flatMap((l) => l.poiIds ?? []))] };
}
export function targetCoordinates(guide: PuzzleGuide, cond: MapCondition, selection: GuideSelection, targets: GuideTargets) {
  return [...visibleLocations(guide, cond, selection.layoutId).filter((l) => targets.locationIds.includes(l.id)).map((l) => l.uv),
    ...guide.entrances.filter((e) => targets.entranceIds.includes(e.id) && available(e, cond) && guide.stages.some((s) => s.id === e.stageId && available(s, cond))).map((e) => e.uv)];
}
