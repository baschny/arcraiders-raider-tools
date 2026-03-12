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
  };
  meta: {
    requestId: string;
  };
}

export interface ArctrackerStashItem {
  itemId: string;
  name: string;
  quantity: number;
  slotIndex: number;
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
}

// ============================================================================
// Cached Data Types
// ============================================================================

export interface CachedProfile {
  userId: string;
  username: string;
  playerLevel: number;
  memberSince: string;
  cachedAt: number;
}

export interface CachedStash {
  items: ArctrackerStashItem[];
  currencies: ArctrackerStashCurrencies;
  slots: ArctrackerStashSlots;
  syncedAt: string;
  cachedAt: number;
}

export interface CachedLoadout {
  loadout: ArctrackerLoadoutResponse['data']['loadout'];
  syncedAt: string;
  cachedAt: number;
}

export interface CacheMeta {
  lastSyncedAt: number | null;
  version: number;
}

export type CacheKey = 'profile' | 'stash' | 'loadout' | 'hideout' | 'meta';

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
