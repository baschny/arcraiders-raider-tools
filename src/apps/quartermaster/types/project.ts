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

/** A goal that is not an item delivery (goalType 'value', 'complete_quests', photo goals, ...). */
export interface ProjectOtherGoal {
  key: string;
  goalType: string;
  amount: number;
  required: boolean;
  repeatable?: boolean;
  /** Localized goal name, when the text file has one. */
  name?: string;
  /** Item classification tags a 'value' goal counts (Embark tag strings). */
  tags?: string[];
}

export interface ProjectStep {
  name: string;
  originalNameEn?: string;
  /** 1-based running index over all steps of the project (matches persisted keys and API progress). */
  index: number;
  requirementItemIds: ProjectRequirementItem[];
  /** Non-item goals. TODO: the projects view does not render them yet. */
  otherGoals?: ProjectOtherGoal[];
}

export interface ProjectDefinition {
  id: string;
  name: string;
  originalNameEn?: string;
  startDate?: number;
  endDate?: number;
  phases: ProjectStep[];
}

// Toggle persistence (mirrors hideout structure)

export interface ProjectToggleState {
  /** Keys: "projectId:stepIndex" */
  listEnabled: Record<string, boolean>;
  /** Keys: "projectId:stepIndex:itemId" */
  itemEnabled: Record<string, boolean>;
}
