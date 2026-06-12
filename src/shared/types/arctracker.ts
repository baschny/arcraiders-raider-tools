/**
 * ArcTracker API Types
 * Interfaces for arctracker.io API responses and cached data structures.
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface ArctrackerProfileResponse {
  data: {
    userId: string;
    username: string;
    playerLevel: number;
    memberSince: string;
    isSubscribed?: boolean;
  };
  meta: {
    requestId: string;
  };
}

export interface ArctrackerStashItem {
  itemId: string | null;
  name: string;
  quantity: number;
  slotIndex: number;
  durabilityPercent?: number;
  attachments?: ArctrackerLoadoutSlot[];
}

export interface ArctrackerStashCurrencies {
  credits: number;
  cred: number;
  raiderTokens: number;
  xp: number;
}

export interface ArctrackerStashSlots {
  used: number;
  max: number;
}

export interface ArctrackerStashPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface ArctrackerStashResponse {
  data: {
    items: ArctrackerStashItem[];
    currencies: ArctrackerStashCurrencies;
    slots: ArctrackerStashSlots;
    pagination: ArctrackerStashPagination;
    syncedAt: string;
  };
  meta: {
    requestId: string;
  };
}

export interface ArctrackerLoadoutSlot {
  itemId: string | null;
  name: string | null;
  quantity: number;
  slotIndex: number;
  durabilityPercent: number;
  attachments?: ArctrackerLoadoutSlot[];
}

export interface ArctrackerLoadoutSlotCounts {
  backpack: number;
  quickItems: number;
  safePocket: number;
  augmentedSlots: number;
}

export interface ArctrackerLoadoutResponse {
  data: {
    loadout: {
      augment: ArctrackerLoadoutSlot;
      shield: ArctrackerLoadoutSlot;
      weapon1: ArctrackerLoadoutSlot;
      weapon2: ArctrackerLoadoutSlot;
      backpack: ArctrackerLoadoutSlot[];
      quickItems: ArctrackerLoadoutSlot[];
      safePocket: ArctrackerLoadoutSlot[];
      augmentedSlots: ArctrackerLoadoutSlot[];
      slotCounts: ArctrackerLoadoutSlotCounts;
    };
    syncedAt: string;
  };
  meta: {
    requestId: string;
  };
}

// ============================================================================
// Hideout Types
// ============================================================================

/** Raw module shape from the API (uses `id`, not `moduleId`) */
export interface ArctrackerHideoutApiModule {
  id: string;
  name: string;
  currentLevel: number;
  maxLevel: number;
}

export interface ArctrackerHideoutResponse {
  data: {
    modules: ArctrackerHideoutApiModule[];
    syncedAt?: string;
    summary?: {
      totalModules: number;
      totalLevels: number;
      maxTotalLevels: number;
    };
  };
  meta: {
    requestId: string;
  };
}

/** Normalized module shape stored in cache */
export interface CachedHideoutModule {
  moduleId: string;
  currentLevel: number;
  maxLevel: number;
}

export interface CachedHideout {
  modules: CachedHideoutModule[];
  syncedAt: string;
  cachedAt: number;
  source?: 'arctracker' | 'embark';
}

// ============================================================================
// Blueprint Types
// ============================================================================

export interface ArctrackerBlueprint {
  id: string;
  name: string;
  category: string;
  rarity: string;
  learned: boolean;
  targetItemId: string;
}

export interface ArctrackerBlueprintsResponse {
  data: {
    blueprints: ArctrackerBlueprint[];
  };
  meta?: {
    requestId: string;
  };
}

export interface CachedBlueprint {
  id: string;
  name: string;
  category: string;
  rarity: string;
  learned: boolean;
  targetItemId: string;
}

export interface CachedBlueprints {
  unlockedItemIds: string[];
  blueprintsByTargetItemId: Record<string, CachedBlueprint>;
  syncedAt: string;
  cachedAt: number;
  source?: 'arctracker' | 'embark';
}

// ArcTracker Projects API types
export interface ArctrackerProjectPhase {
  name: string;
  completed: boolean;
}

export interface ArctrackerProject {
  id: string;
  name: string;
  phases: ArctrackerProjectPhase[];
  completedPhases: number;
  totalPhases: number;
  fullyCompleted: boolean;
}

export interface ArctrackerProjectsResponse {
  data: {
    projects: ArctrackerProject[];
    summary: {
      totalProjects: number;
      fullyCompletedProjects: number;
      incompleteProjects: number;
    };
  };
  meta: {
    requestId: string;
  };
}

// Cached project progress (from API sync)
export interface CachedProjectGoal {
  goalAssetId: number;
  itemId: string;
  required: number;
  submitted: number;
  remaining: number;
  completed: boolean;
}

export interface CachedProjectStepProgress {
  name: string;
  index: number;
  completed: boolean;
  goals: CachedProjectGoal[];
}

export interface CachedProjectProgress {
  projectId: string;
  projectName: string;
  completed: boolean;
  steps: CachedProjectStepProgress[];
  syncedAt: string;
  cachedAt: number;
}

export interface CachedProjects {
  projects: CachedProjectProgress[];
  syncedAt: string;
  cachedAt: number;
}

// ============================================================================
// Cached Data Types
// ============================================================================

export interface CachedProfile {
  userId: string;
  username: string;
  playerLevel: number;
  memberSince: string;
  isSubscribed?: boolean;
  cachedAt: number;
}

export interface CachedStash {
  items: ArctrackerStashItem[];
  currencies: ArctrackerStashCurrencies;
  slots: ArctrackerStashSlots;
  syncedAt: string;
  cachedAt: number;
  source?: 'arctracker' | 'embark';
}

export interface CachedLoadout {
  loadout: ArctrackerLoadoutResponse['data']['loadout'];
  syncedAt: string;
  cachedAt: number;
  source?: 'arctracker' | 'embark';
}

export interface CacheMeta {
  lastSyncedAt: number | null;
  version: number;
  userSub: string | null;
  source?: 'arctracker' | 'embark';
  embarkInventorySyncedAt?: string | null;
  embarkUnknownGameAssetIds?: number[];
}

export type CacheKey = 'profile' | 'stash' | 'loadout' | 'hideout' | 'blueprints' | 'projects' | 'meta';

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  isValidating: boolean;
  error: string | null;
}

// ============================================================================
// API Error Types
// ============================================================================

export interface ApiError {
  message: string;
  status?: number;
  isRetryable: boolean;
}
