import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { ObjectiveView, Quest, QuestItemEntry, StepItemRole } from '../types/quest';
import { evaluateObjectives, isObjectiveSatisfied, objectiveLeaves, progressByKey } from './objectiveTree';
import { formatWikiLink } from './helpers';
import { getQuestWikiName } from './localization';

/** Summaries of a quest for its node, hover card and details. */

export interface BringEntry extends QuestItemEntry {
  role: StepItemRole;
}

const isGroupAll = (node: ObjectiveView) => node.kind === 'sequence' || node.kind === 'allOf';

/**
 * Items to take into the round for all required steps, merged by item and role: summed along
 * sequences and all-of groups, the largest amount among the alternatives of a choice (only one
 * route is played), and an item to bring (the camera) once. Items a step makes you find
 * (`obtain`) and optional steps are left out.
 */
export function bringList(quest: Pick<Quest, 'objectiveTree'>): BringEntry[] {
  const walk = (node: ObjectiveView): Map<string, BringEntry> => {
    const out = new Map<string, BringEntry>();
    if (node.optional) return out;
    if (node.kind === 'atomic') {
      for (const item of node.items ?? []) {
        if (item.role === 'obtain') continue;
        const key = `${item.role}:${item.id}`;
        const prev = out.get(key);
        if (prev) prev.quantity += item.quantity;
        else out.set(key, { ...item });
      }
      return out;
    }
    const choice = !isGroupAll(node);
    for (const child of node.children) {
      for (const [key, item] of walk(child)) {
        const prev = out.get(key);
        if (!prev) out.set(key, { ...item });
        else if (choice || item.role === 'bring') prev.quantity = Math.max(prev.quantity, item.quantity);
        else prev.quantity += item.quantity;
      }
    }
    return out;
  };
  return quest.objectiveTree ? [...walk(quest.objectiveTree).values()] : [];
}

/**
 * Done leaf keys from the progress. For a completed quest, the progress when it completes the
 * steps (the route that was played), else all leaves.
 */
export function doneLeafKeys(
  quest: Pick<Quest, 'objectiveLeafKeys' | 'objectiveTree'>,
  progress: LinkedQuestObjectiveProgress[] | undefined,
  completed: boolean,
): Set<string> {
  const byKey = progressByKey(quest.objectiveLeafKeys, progress);
  const done = new Set(quest.objectiveLeafKeys.filter((key) => byKey.get(key)?.completed));
  if (!completed || (quest.objectiveTree && done.size && isObjectiveSatisfied(quest.objectiveTree, done))) return done;
  return new Set(quest.objectiveLeafKeys);
}

export interface StepSummary {
  /** Required steps along one route (a choice counts its largest option(s), not all of them). */
  required: number;
  /** Done required steps, at most `required`. */
  done: number;
  optional: number;
  /** Some part (or all) has to be done in a single round. */
  oneRound: boolean;
  /** The steps contain a choice (one of, n of, exclusive routes). */
  hasChoice: boolean;
  /** Text of the next step: the first required step that can be done now. */
  next?: string;
}

export function stepSummary(quest: Pick<Quest, 'objectiveTree'>, done: ReadonlySet<string>): StepSummary {
  const tree = quest.objectiveTree;
  if (!tree) return { required: 0, done: 0, optional: 0, oneRound: false, hasChoice: false };
  const leaves = objectiveLeaves(tree);
  const states = evaluateObjectives(tree, done);
  const hasChoice = (n: ObjectiveView): boolean => n.kind !== 'atomic' && (!isGroupAll(n) || n.children.some(hasChoice));
  const oneRound = (n: ObjectiveView): boolean => n.oneRound || n.children.some(oneRound);
  const count = (n: ObjectiveView): number => {
    if (n.optional) return 0;
    if (n.kind === 'atomic') return 1;
    const sizes = n.children.map(count);
    if (isGroupAll(n)) return sizes.reduce((a, b) => a + b, 0);
    const take = n.kind === 'nOf' ? (n.requiredCount ?? 1) : 1;
    return sizes
      .sort((a, b) => b - a)
      .slice(0, take)
      .reduce((a, b) => a + b, 0);
  };
  const required = count(tree);
  const next = leaves.find((l) => !l.optional && states.get(l.key)?.status === 'active');
  return {
    required,
    done: Math.min(required, leaves.filter((l) => !l.optional && done.has(l.key)).length),
    optional: leaves.filter((l) => l.optional).length,
    oneRound: oneRound(tree),
    hasChoice: hasChoice(tree),
    next: next?.text,
  };
}

/** XP tier 1..5 of the quest XP values (1k, 2.5k, 5k, 8k, 10k). */
export function xpTier(xp: number): 1 | 2 | 3 | 4 | 5 {
  return xp >= 10000 ? 5 : xp >= 8000 ? 4 : xp >= 5000 ? 3 : xp >= 2500 ? 2 : 1;
}

/** Reward items without the blueprints (those are shown separately). */
export function otherRewardItems(quest: Pick<Quest, 'rewardItems' | 'blueprintRewards'>): QuestItemEntry[] {
  const blueprints = new Set(quest.blueprintRewards.map((b) => b.id));
  return quest.rewardItems.filter((r) => !blueprints.has(r.id));
}

export function questWikiUrl(quest: Pick<Quest, 'name' | 'originalNameEn'>): string {
  return 'https://arcraiders.wiki/wiki/' + formatWikiLink(getQuestWikiName(quest));
}

export function questArcTrackerUrl(quest: Pick<Quest, 'id'>): string {
  return `https://arctracker.io/quests/${quest.id.replaceAll('_', '-')}`;
}
