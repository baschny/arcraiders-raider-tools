import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { ObjectiveView } from '../types/quest';

/**
 * Display normalization of an objective tree:
 * - a sequence inside a sequence (all-of inside an all-of) without own text / optional / extra
 *   one-round marker is spliced into its parent (its hidden flag moves to the spliced children);
 * - a group with a single child and no text collapses to that child (flags combined);
 * - a group text equal to the text of its first child group is dropped (Bait, Fetch, Blast).
 * Leaf keys are kept, so linked progress still matches.
 */
export function normalizeObjectiveTree(node: ObjectiveView, parentOneRound = false): ObjectiveView {
  if (node.kind === 'atomic') return node;
  const oneRoundInherited = parentOneRound || node.oneRound;
  const children: ObjectiveView[] = [];
  for (const raw of node.children) {
    const child = normalizeObjectiveTree(raw, oneRoundInherited);
    const sameKind = child.kind === node.kind && (node.kind === 'sequence' || node.kind === 'allOf');
    if (sameKind && !child.text && !child.optional && (!child.oneRound || oneRoundInherited)) {
      children.push(...child.children.map((c) => ({ ...c, hidden: c.hidden || child.hidden })));
    } else {
      children.push(child);
    }
  }
  let text = node.text;
  if (text && children[0] && children[0].kind !== 'atomic' && children[0].text === text) text = undefined;
  if (children.length === 1 && !text && node.kind !== 'nOf') {
    const only = children[0];
    return {
      ...only,
      optional: only.optional || node.optional,
      hidden: only.hidden || node.hidden,
      oneRound: only.oneRound || (node.oneRound && !parentOneRound),
    };
  }
  const out: ObjectiveView = { ...node, children };
  if (text) out.text = text;
  else delete out.text;
  return out;
}

export function objectiveLeaves(node: ObjectiveView): ObjectiveView[] {
  return node.kind === 'atomic' ? [node] : node.children.flatMap(objectiveLeaves);
}

/** Linked progress by leaf key: the progress list follows `leafKeys` (all leaves in key order). */
export function progressByKey(
  leafKeys: string[],
  progress: LinkedQuestObjectiveProgress[] | undefined,
): Map<string, LinkedQuestObjectiveProgress> {
  const out = new Map<string, LinkedQuestObjectiveProgress>();
  if (!progress || progress.length !== leafKeys.length) return out;
  leafKeys.forEach((key, i) => out.set(key, progress[i]));
  return out;
}

// ---------------------------------------------------------------------------------------------
// status

/**
 * done: satisfied; active: can be worked on now; locked: an earlier step of a sequence comes
 * first; closed: another route of an exclusive choice was started; notNeeded: the choice is
 * already satisfied by another option.
 */
export type StepStatus = 'done' | 'active' | 'locked' | 'closed' | 'notNeeded';

export interface StepState {
  status: StepStatus;
  /** Shown in the game's quest log: not hidden, or hidden but already reached. */
  revealed: boolean;
}

export function isObjectiveSatisfied(node: ObjectiveView, done: ReadonlySet<string>): boolean {
  switch (node.kind) {
    case 'atomic':
      return done.has(node.key);
    case 'sequence':
    case 'allOf':
      return node.children.filter((c) => !c.optional).every((c) => isObjectiveSatisfied(c, done));
    case 'anyOf':
    case 'anyOfExclusive':
      return node.children.some((c) => isObjectiveSatisfied(c, done));
    case 'nOf':
      return node.children.filter((c) => isObjectiveSatisfied(c, done)).length >= (node.requiredCount ?? 1);
  }
}

function isStarted(node: ObjectiveView, done: ReadonlySet<string>): boolean {
  if (node.kind === 'atomic') return done.has(node.key);
  return node.children.some((c) => isStarted(c, done));
}

/** The started branch of a choice, or null. */
export function startedBranch(node: ObjectiveView, done: ReadonlySet<string>): ObjectiveView | null {
  return node.children.find((c) => isStarted(c, done)) ?? null;
}

/** Status and reveal state of every node by key, from the set of done leaf keys. */
export function evaluateObjectives(root: ObjectiveView, done: ReadonlySet<string>): Map<string, StepState> {
  const out = new Map<string, StepState>();
  const walk = (node: ObjectiveView, available: boolean, parentRevealed: boolean, blocked?: StepStatus) => {
    const satisfied = isObjectiveSatisfied(node, done);
    const status: StepStatus = satisfied ? 'done' : (blocked ?? (available ? 'active' : 'locked'));
    const revealed = parentRevealed && (!node.hidden || satisfied || available || isStarted(node, done));
    out.set(node.key, { status, revealed });
    const childAvailable = available && !satisfied;
    if (node.kind === 'sequence') {
      let ok = available;
      for (const child of node.children) {
        walk(child, ok && !satisfied, revealed);
        if (!child.optional) ok = ok && isObjectiveSatisfied(child, done);
      }
    } else if (node.kind === 'anyOfExclusive') {
      const chosen = startedBranch(node, done);
      for (const child of node.children) {
        const closed = !!chosen && chosen !== child;
        walk(child, childAvailable && !closed, revealed, closed ? 'closed' : undefined);
      }
    } else {
      for (const child of node.children) {
        const needless = satisfied && node.kind !== 'allOf' && !isObjectiveSatisfied(child, done);
        walk(child, childAvailable, revealed, needless ? 'notNeeded' : undefined);
      }
    }
  };
  walk(root, true, true);
  return out;
}

/**
 * True for a choice whose branches are sequences that only differ in their first step
 * (To The Skies: one of four Gondola Prototype locations, then the same installs). It is shown
 * as "pick one place" followed by the shared steps of the chosen branch.
 */
export function hasSharedTail(node: ObjectiveView): boolean {
  if (node.kind !== 'anyOfExclusive' && node.kind !== 'anyOf') return false;
  const branches = node.children;
  if (branches.length < 2 || branches.some((b) => b.kind !== 'sequence' || b.children.length < 2)) return false;
  const sig = (n: ObjectiveView): string =>
    n.kind === 'atomic' ? `${n.text}|${n.optional}` : `${n.kind}(${n.children.map(sig).join(',')})`;
  const tailSig = (b: ObjectiveView) => b.children.slice(1).map(sig).join(';');
  const first = tailSig(branches[0]);
  return branches.every((b) => tailSig(b) === first);
}
