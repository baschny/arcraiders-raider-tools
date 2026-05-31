/**
 * Project Toggle State Persistence
 * Mirrors hideoutStorage.ts for toggle state
 */

import type { ProjectToggleState, CachedProjects } from '../types/project';

export function listKey(projectId: string, stepIndex: number): string {
  return `${projectId}:${stepIndex}`;
}

export function itemKey(projectId: string, stepIndex: number, itemId: string): string {
  return `${projectId}:${stepIndex}:${itemId}`;
}

/**
 * Remove toggle state for steps that are now completed
 */
export function cleanupObsoleteProjectToggles(
  cachedProjects: CachedProjects | null,
  toggleState: ProjectToggleState,
): ProjectToggleState {
  if (!cachedProjects) return toggleState;

  const completedSteps = new Map<string, Set<number>>();
  for (const pp of cachedProjects.projects) {
    const set = new Set<number>();
    for (const step of pp.steps) {
      if (step.completed) set.add(step.index);
    }
    completedSteps.set(pp.projectId, set);
  }

  const cleanedListEnabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggleState.listEnabled)) {
    const [projectId, stepStr] = key.split(':');
    const stepIndex = parseInt(stepStr, 10);
    if (!completedSteps.get(projectId)?.has(stepIndex)) {
      cleanedListEnabled[key] = value;
    }
  }

  const cleanedItemEnabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggleState.itemEnabled)) {
    const [projectId, stepStr] = key.split(':');
    const stepIndex = parseInt(stepStr, 10);
    if (!completedSteps.get(projectId)?.has(stepIndex)) {
      cleanedItemEnabled[key] = value;
    }
  }

  return { listEnabled: cleanedListEnabled, itemEnabled: cleanedItemEnabled };
}
