/**
 * Quartermaster Hideout Types
 * See specification CR-002, CR-004, CR-007, CR-008
 */

// Static hideout definitions (from public/data/quartermaster/hideout.json)

export interface HideoutRequirementItem {
  itemId: string;
  quantity: number;
}

export interface HideoutLevelDefinition {
  level: number;
  image: string | null;
  requirementItemIds: HideoutRequirementItem[];
}

export interface HideoutModuleDefinition {
  id: string;
  name: string;
  originalNameEn?: string;
  maxLevel: number;
  levels: HideoutLevelDefinition[];
}

export interface LocalizedHideoutModuleDefinition
  extends Omit<HideoutModuleDefinition, 'name'> {
  name: {
    value: string;
    originalEn: string;
  };
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
