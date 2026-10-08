/**
 * Quartermaster Hideout Types
 * See specification CR-002, CR-004, CR-007, CR-008
 */

// Static hideout definitions (from the `benches` game-data domain)

import type { Requirement } from '../../../shared/gamedata/types';

export interface HideoutRequirementItem {
  itemId: string;
  quantity: number;
}

export interface HideoutLevelDefinition {
  level: number;
  image: string | null;
  requirementItemIds: HideoutRequirementItem[];
  /** Gates from the benches domain (e.g. Outpost level, other bench level). Not rendered yet. */
  requires?: Requirement[];
}

export interface HideoutModuleDefinition {
  id: string;
  name: string;
  originalNameEn?: string;
  maxLevel: number;
  levels: HideoutLevelDefinition[];
}

// Cached hideout state (from API sync, stored in IndexedDB)

export interface CachedHideoutModule {
  moduleId: string;
  currentLevel: number;
  maxLevel: number;
}

export interface CachedHideout {
  modules: CachedHideoutModule[];
  syncedAt: string;
  cachedAt: number;
}

// Toggle persistence for generated lists (stored in quartermasterStore)

export interface HideoutToggleState {
  /** Keys: "moduleId:level" */
  listEnabled: Record<string, boolean>;
  /** Keys: "moduleId:level:itemId" */
  itemEnabled: Record<string, boolean>;
}
