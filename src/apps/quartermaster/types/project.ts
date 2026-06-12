/**
 * Quartermaster Project Types
 * See specification for project tracking feature
 *
 * Cached progress types are re-exported from shared arctracker types
 * to keep a single source of truth.
 */

import type { CachedProjects, CachedProjectStepProgress, CachedProjectCategoryGoal } from '../../../shared/types/arctracker';
export type { CachedProjects, CachedProjectStepProgress, CachedProjectCategoryGoal };

export interface ProjectRequirementItem {
  itemId: string;
  quantity: number;
}

export interface ProjectStep {
  name: string;
  originalNameEn?: string;
  index: number;
  requirementItemIds: ProjectRequirementItem[];
}

export interface ProjectDefinition {
  id: string;
  name: string;
  originalNameEn?: string;
  startDate?: number;
  endDate?: number;
  phases: ProjectStep[];
}

export interface LocalizedProjectStep {
  name: {
    value: string;
    originalEn: string;
  };
  index: number;
  requirementItemIds: ProjectRequirementItem[];
}

export interface LocalizedProjectDefinition
  extends Omit<ProjectDefinition, 'name' | 'phases'> {
  name: {
    value: string;
    originalEn: string;
  };
  startDate?: number;
  endDate?: number;
  phases: LocalizedProjectStep[];
}

// Toggle persistence (mirrors hideout structure)

export interface ProjectToggleState {
  /** Keys: "projectId:stepIndex" */
  listEnabled: Record<string, boolean>;
  /** Keys: "projectId:stepIndex:itemId" */
  itemEnabled: Record<string, boolean>;
}
