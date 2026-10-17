import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { ObjectiveView } from '../types/quest';
import { hasSharedTail, objectiveLeaves } from './objectiveTree';

/** Manual progress of single quest steps: the done leaf keys per quest (manual mode). */

/** Groups of which only one branch can be played: exclusive routes, and choices of places followed by the same steps. */
function isSingleRoute(node: ObjectiveView): boolean {
  return node.kind === 'anyOfExclusive' || hasSharedTail(node);
}

/** Nodes from the root down to the node with `key` (empty when the tree has no such node). */
function pathTo(node: ObjectiveView, key: string): ObjectiveView[] {
  if (node.key === key) return [node];
  for (const child of node.children) {
    const path = pathTo(child, key);
    if (path.length) return [node, ...path];
  }
  return [];
}

/**
 * Marks the step `key` done or, when it is done, not done. Marking a step of one route of a
 * single-route choice drops the done steps of its other routes (only one route can be played).
 * Every other step stays as it is: an optional step, an alternative of a choice or a later step
 * of a sequence can be marked on its own.
 */
export function toggleStep(tree: ObjectiveView, done: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(done);
  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  const path = pathTo(tree, key);
  if (!path.length) return next;
  next.add(key);
  path.forEach((node, i) => {
    if (!isSingleRoute(node)) return;
    const branch = path[i + 1];
    for (const other of node.children) {
      if (other === branch) continue;
      for (const leaf of objectiveLeaves(other)) next.delete(leaf.key);
    }
  });
  return next;
}

/** Done leaf keys as progress entries in leaf order (the shape of the linked progress). */
export function progressFromDone(leafKeys: string[], done: ReadonlySet<string>): LinkedQuestObjectiveProgress[] {
  return leafKeys.map((key) => ({ completed: done.has(key), currentAmount: null, requiredAmount: null }));
}
