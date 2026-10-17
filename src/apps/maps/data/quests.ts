// Quests mode: the located steps of the picked story quests on the open map. A step's markers come from the map's
// `questSteps` (embark-api lib/derived/quest-steps.js); its number, text and done state from the Quest Tracker's
// quest (the same objective tree and step keys, numbered like the quest details).
import type { ObjectiveView, Quest } from '../../quests/types/quest';
import { evaluateObjectives, hasSharedTail, objectiveLeaves, stepLabels, type StepStatus } from '../../quests/utils/objectiveTree';
import type { MapCondition, MapData, MapIndex, QuestStepMarkers } from './types';

/** One colour per picked quest, in the order picked (distinct on dark and snowy maps). */
export const QUEST_COLORS = ['#f5b83d', '#4fc3f7', '#ef6f9c', '#7ed67f', '#b693f5', '#ff8a4c', '#4ad6c4', '#e3e36a'];
export const questColor = (i: number) => QUEST_COLORS[i % QUEST_COLORS.length];

export interface PickedQuest {
  slug: string;
  /** Null while the quest catalog loads (or when the slug is unknown to it). */
  quest: Quest | null;
  color: string;
  /** Step number per node key ('2', '2.1'); unnumbered steps are missing. */
  labels: Map<string, string>;
  done: ReadonlySet<string>;
  /** Step status per node key (done, active, locked, closed: another route was taken, notNeeded). */
  states: Map<string, { status: StepStatus }>;
  /** Located steps on the open map: step key -> markers. */
  steps: Record<string, QuestStepMarkers>;
}

/**
 * The steps of one quest at one of their markers on the open map (several steps at the same object share one pin:
 * To The Skies' installs at the Gondola Prototype).
 */
export interface QuestPin {
  /** Index into the picked quests. */
  q: number;
  /** Step keys, in tree order. */
  keys: string[];
  /** Step number ('2'), or the range of the steps ('2.1–2.4'); null when unnumbered. */
  label: string | null;
  /** Index into MapData.quests. */
  marker: number;
  area: boolean;
  /** One of many candidates (drawn small, unnumbered). */
  any: boolean;
  /** All its steps done or not needed any more, or not on the open layer / under the open condition: drawn faded. */
  dim: boolean;
}

/** Is a quest marker present under the condition (its only / not lists of condition names)? */
export function markerUnderCondition(map: MapData, i: number, cond: MapCondition): boolean {
  const mk = map.quests[i];
  if (mk.only) return mk.only.includes(cond.name);
  if (mk.not) return !mk.not.includes(cond.name);
  return true;
}

export function pickQuests(map: MapData, slugs: string[], byId: ReadonlyMap<string, Quest>, doneOf: (q: Quest) => ReadonlySet<string>): PickedQuest[] {
  return slugs.map((slug, i) => {
    const quest = byId.get(slug) ?? null;
    const tree = quest?.objectiveTree ?? null;
    const done = quest ? doneOf(quest) : new Set<string>();
    return {
      slug,
      quest,
      color: questColor(i),
      labels: tree ? stepLabels(tree) : new Map(),
      done,
      states: tree ? evaluateObjectives(tree, done) : new Map(),
      steps: map.questSteps?.[slug] ?? {},
    };
  });
}

/**
 * Pins of the picked quests, in drawing order: areas, then "any" candidates, then the step pins (so numbers stay on
 * top). `onLayer`: is a quest marker on the open map layer.
 */
export function questPins(map: MapData, picked: PickedQuest[], cond: MapCondition, onLayer: (marker: number) => boolean): QuestPin[] {
  const pins: QuestPin[] = [];
  picked.forEach((p, q) => {
    const leaves = p.quest?.objectiveTree ? objectiveLeaves(p.quest.objectiveTree).map((l) => l.key) : Object.keys(p.steps);
    const byMarker = new Map<number, { keys: string[]; finished: boolean; any: boolean }>();
    for (const key of leaves) {
      const entry = p.steps[key];
      if (!entry) continue;
      const status = p.states.get(key)?.status;
      const finished = p.done.has(key) || status === 'closed' || status === 'notNeeded';
      for (const marker of entry.m) {
        const at = byMarker.get(marker) ?? { keys: [], finished: true, any: true };
        at.keys.push(key);
        at.finished &&= finished;
        at.any &&= !!entry.any;
        byMarker.set(marker, at);
      }
    }
    for (const [marker, at] of byMarker) {
      const labels = at.keys.map((k) => p.labels.get(k)).filter((l): l is string => !!l);
      pins.push({
        q, keys: at.keys, marker, any: at.any,
        area: map.quests[marker]?.k === 'area',
        label: labels.length > 1 ? `${labels[0]}–${labels[labels.length - 1]}` : labels[0] ?? null,
        dim: at.finished || !onLayer(marker) || !markerUnderCondition(map, marker, cond),
      });
    }
  });
  const rank = (pin: QuestPin) => (pin.area ? 0 : pin.any ? 1 : 2);
  return pins.map((pin, i) => [pin, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([pin]) => pin);
}

/**
 * The steps of a quest the side bar lists for the open map: all leaves in tree order, except the routes of a route
 * choice (one route per round: exclusive routes, places followed by the same steps) that are not on this map while
 * another route is.
 */
export function questStepsFor(quest: Quest, here: (key: string) => boolean): ObjectiveView[] {
  const walk = (node: ObjectiveView): ObjectiveView[] => {
    if (node.kind === 'atomic') return [node];
    let children = node.children;
    if (node.kind === 'anyOfExclusive' || hasSharedTail(node)) {
      const local = children.filter((c) => objectiveLeaves(c).some((l) => here(l.key)));
      if (local.length) children = local;
    }
    return children.flatMap(walk);
  };
  return quest.objectiveTree ? walk(quest.objectiveTree) : [];
}

/** Located steps of the picked quests per map slug (the map bar). */
export function questMapCounts(index: MapIndex, slugs: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const slug of slugs) {
    for (const [map, n] of Object.entries(index.quests.find((q) => q.slug === slug)?.maps ?? {})) out.set(map, (out.get(map) ?? 0) + n);
  }
  return out;
}

/** The leaves of a quest in tree order (all steps, located or not). */
export const questLeaves = (quest: Quest): ObjectiveView[] => (quest.objectiveTree ? objectiveLeaves(quest.objectiveTree) : []);
