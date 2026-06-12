/**
 * Project List Generation
 * Mirrors hideoutLists.ts for project required items
 */

import type { ProjectDefinition, ProjectToggleState, CachedProjects } from '../types/project';
import type { CachedProjectGoal, CachedProjectCategoryGoal } from '../../../shared/types/arctracker';
import type { StoredList } from '../types/list';

interface ProjectListLocalizationOptions {
  formatListName: (projectName: string, stepIndex: number, stepName: string) => string;
  compareText: (left: string, right: string) => number;
}

export function listKey(projectId: string, stepIndex: number): string {
  return `${projectId}:${stepIndex}`;
}

export function itemKey(projectId: string, stepIndex: number, itemId: string): string {
  return `${projectId}:${stepIndex}:${itemId}`;
}

function isProjectExpired(def: ProjectDefinition): boolean {
  if (!def.endDate) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return def.endDate < nowSec;
}

/**
 * Generate project required-item lists from static definitions and cached progress.
 *
 * - One list per step (all goals in a step merged into one list)
 * - Naming: "<ProjectName>: Step <N> (<StepName>)"
 * - Lists are read-only: type = 'project'
 * - Requires valid cached project progress to produce any lists
 * - Uses Embark per-goal remaining quantities when available
 * - Filters out expired projects (endDate < now)
 */
export function generateProjectLists(
  definitions: ProjectDefinition[],
  cachedProjects: CachedProjects | null,
  toggleState: ProjectToggleState,
  options: ProjectListLocalizationOptions,
): StoredList[] {
  if (!cachedProjects) return [];

  const progressByProjectId = new Map<string, Map<number, {
    completed: boolean;
    goals: CachedProjectGoal[];
    categoryRequirements?: CachedProjectCategoryGoal[];
  }>>();
  for (const projectProgress of cachedProjects.projects) {
    const stepMap = new Map<number, {
      completed: boolean;
      goals: CachedProjectGoal[];
      categoryRequirements?: CachedProjectCategoryGoal[];
    }>();
    for (const step of projectProgress.steps) {
      stepMap.set(step.index, {
        completed: step.completed,
        goals: step.goals,
        categoryRequirements: step.categoryRequirements,
      });
    }
    progressByProjectId.set(projectProgress.projectId, stepMap);
  }

  const lists: StoredList[] = [];

  for (const def of definitions) {
    if (isProjectExpired(def)) continue;

    const stepProgress = progressByProjectId.get(def.id);

    // Skip projects that exist in definitions but have no cached progress
    if (!stepProgress) continue;

    for (const phase of def.phases) {
      const progressInfo = stepProgress?.get(phase.index);
      const allPriorStepsComplete = def.phases
        .filter((p) => p.index < phase.index)
        .every((p) => stepProgress?.get(p.index)?.completed ?? false);
      const isCompleted = allPriorStepsComplete && (progressInfo?.completed ?? false);
      const name = options.formatListName(def.name, phase.index, phase.name);

      const goalMap = new Map<string, CachedProjectGoal>();
      if (progressInfo) {
        for (const goal of progressInfo.goals) {
          goalMap.set(goal.itemId, goal);
        }
      }

      const items = phase.requirementItemIds.map((req) => {
        const goal = goalMap.get(req.itemId);
        const quantity = goal ? goal.remaining : req.quantity;

        return {
          itemId: req.itemId,
          quantity,
          isEnabled: toggleState.itemEnabled[itemKey(def.id, phase.index, req.itemId)] ?? !isCompleted,
          submitted: goal?.submitted,
          required: goal ? goal.required : req.quantity,
        };
      });
      const isListEnabled = items.some(item => item.isEnabled);

      const catReqs = progressInfo?.categoryRequirements
        ?.filter((c) => c.required > 0)
        .map((c) => ({
          category: c.category,
          required: c.required,
          submitted: c.submitted,
          remaining: c.remaining,
        }));

      lists.push({
        id: `project_${def.id}_${phase.index}`,
        name,
        type: 'project',
        isEnabled: isListEnabled,
        items,
        categoryRequirements: catReqs?.length ? catReqs : undefined,
      });
    }
  }

  // Sort:
  // 1. Incomplete projects first, then completed
  // 2. Within a project: step index ascending
  // 3. Within same step index: project name ascending
  lists.sort((a, b) => {
    const aIdParts = a.id.match(/^project_(.+)_(\d+)$/);
    const bIdParts = b.id.match(/^project_(.+)_(\d+)$/);
    const aProjectId = aIdParts?.[1] ?? '';
    const bProjectId = bIdParts?.[1] ?? '';
    const aStepIndex = parseInt(aIdParts?.[2] ?? '0', 10);
    const bStepIndex = parseInt(bIdParts?.[2] ?? '0', 10);

    const aCompleted = progressByProjectId.get(aProjectId)?.get(aStepIndex)?.completed ?? false;
    const bCompleted = progressByProjectId.get(bProjectId)?.get(bStepIndex)?.completed ?? false;

    const aDef = definitions.find((d) => d.id === aProjectId);
    const bDef = definitions.find((d) => d.id === bProjectId);

    const aProjectComplete = aDef
      ? aDef.phases.every((p) => progressByProjectId.get(aProjectId)?.get(p.index)?.completed ?? false)
      : false;
    const bProjectComplete = bDef
      ? bDef.phases.every((p) => progressByProjectId.get(bProjectId)?.get(p.index)?.completed ?? false)
      : false;

    if (aProjectComplete !== bProjectComplete) return aProjectComplete ? 1 : -1;
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

    const aProjectName = aDef?.name ?? a.name;
    const bProjectName = bDef?.name ?? b.name;

    if (aProjectName !== bProjectName) return options.compareText(aProjectName, bProjectName);

    return aStepIndex - bStepIndex;
  });

  return lists;
}
