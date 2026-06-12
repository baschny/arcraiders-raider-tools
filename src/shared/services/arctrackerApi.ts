/**
 * ArcTracker API Service
 * Handles communication with arctracker.io via Raider Tools proxies.
 * Data sync requires a signed-in Raider Tools user with a server-side linked
 * ArcTracker token.
 * Includes retry logic, timeout handling, and IndexedDB caching.
 */

import type {
  ArctrackerProfileResponse,
  ArctrackerProjectPhase,
  ArctrackerProjectsResponse,
  ArctrackerStashResponse,
  ArctrackerLoadoutResponse,
  ArctrackerHideoutResponse,
  ArctrackerBlueprintsResponse,
  CachedProfile,
  CachedStash,
  CachedLoadout,
  CachedHideout,
  CachedBlueprints,
  CachedProjectGoal,
  CachedProjectCategoryGoal,
  ApiError,
  ArctrackerStashItem,
} from '../types/arctracker';
import {
  cacheSet,
  getCachedProfile,
  getCachedStash,
  getCachedLoadout,
  getCachedHideout,
  getCachedBlueprints,
  getCachedProjects,
  updateCacheMeta,
  setCacheOwner,
  setCacheSource,
} from './cacheService';
import { getCurrentSession, getIdToken } from '../auth/cognitoClient';
import { notifyArctrackerLinkInvalid } from '../auth/arctrackerLinkEvents';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type AppLocale } from '../i18n/config';
import type { CachedProjects } from '../../apps/quartermaster/types/project';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'https://api.raider-tools.app';
const USER_RELAY_BASE = `${API_ORIGIN}/me/arctracker`;
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;
const STASH_PER_PAGE = 500;

function getApiLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === 'de' || stored === 'pt-BR' || stored === 'en' ? stored : DEFAULT_LOCALE;
}

/**
 * Create an API error object.
 */
function createApiError(message: string, status?: number, isRetryable = false): ApiError {
  return { message, status, isRetryable };
}

async function getApiErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? `API request failed: ${response.status} ${response.statusText}`;
  } catch {
    return `API request failed: ${response.status} ${response.statusText}`;
  }
}

/**
 * Fetch with timeout support.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Make an authenticated API request with retry logic.
 */
async function apiRequest<T>(
  endpoint: string,
  token?: string,
  retryCount = 0
): Promise<T> {
  const auth = await getRequestAuth(token);

  const url = `${auth.baseUrl}${endpoint}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const isRetryable = response.status >= 500 || response.status === 429;
      if (response.status === 401 || response.status === 403) {
        notifyArctrackerLinkInvalid();
      }

      if (isRetryable && retryCount < MAX_RETRIES) {
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiRequest<T>(endpoint, token, retryCount + 1);
      }

      throw createApiError(
        await getApiErrorMessage(response),
        response.status,
        isRetryable
      );
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (retryCount < MAX_RETRIES) {
        return apiRequest<T>(endpoint, token, retryCount + 1);
      }
      throw createApiError('Request timed out', undefined, true);
    }

    // Re-throw ApiError as-is
    if (typeof error === 'object' && error !== null && 'isRetryable' in error) {
      throw error;
    }

    throw createApiError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      undefined,
      true
    );
  }
}

async function getRequestAuth(token?: string): Promise<{ baseUrl: string; token: string }> {
  if (token) {
    throw createApiError('Direct ArcTracker token usage is not supported', 401, false);
  }

  const idToken = await getIdToken();
  if (idToken) {
    const session = await getCurrentSession();
    await setCacheOwner(session?.sub ?? null);
    await setCacheSource('arctracker');
    return { baseUrl: USER_RELAY_BASE, token: idToken };
  }

  throw createApiError('No authentication token available', 401, false);
}

/**
 * Sync and cache the user profile.
 */
export async function syncProfile(): Promise<CachedProfile> {
  const response = await apiRequest<ArctrackerProfileResponse>(`/v2/user/profile`);

  const cachedProfile: CachedProfile = {
    userId: response.data.userId,
    username: response.data.username,
    playerLevel: response.data.playerLevel,
    memberSince: response.data.memberSince,
    isSubscribed: response.data.isSubscribed,
    cachedAt: Date.now(),
  };

  await cacheSet('profile', cachedProfile);
  return cachedProfile;
}

/**
 * Fetch a single page of stash data.
 */
async function fetchStashPage(page: number): Promise<ArctrackerStashResponse> {
  const locale = getApiLocale();
  return apiRequest<ArctrackerStashResponse>(
    `/v2/user/stash?locale=${locale}&page=${page}&per_page=${STASH_PER_PAGE}&sort=slot`
  );
}

/**
 * Sync and cache all stash pages.
 * Aggregates items from all pages into a single array.
 */
export async function syncStashAllPages(): Promise<CachedStash> {
  // Fetch first page to get pagination info
  const firstPage = await fetchStashPage(1);
  const totalPages = firstPage.data.pagination.totalPages;

  // Collect all items
  let allItems: ArctrackerStashItem[] = [...firstPage.data.items];

  // Fetch remaining pages if any
  for (let page = 2; page <= totalPages; page++) {
    const pageData = await fetchStashPage(page);
    allItems = allItems.concat(pageData.data.items);
  }

  // Use metadata from the last page (or first if only one page)
  const lastPageData = totalPages > 1 ? await fetchStashPage(totalPages) : firstPage;

  const cachedStash: CachedStash = {
    items: allItems,
    currencies: lastPageData.data.currencies,
    slots: lastPageData.data.slots,
    syncedAt: lastPageData.data.syncedAt,
    cachedAt: Date.now(),
  };

  await cacheSet('stash', cachedStash);
  await updateCacheMeta({ lastSyncedAt: Date.now() });

  return cachedStash;
}

/**
 * Sync and cache the loadout.
 */
export async function syncLoadout(): Promise<CachedLoadout> {
  const locale = getApiLocale();
  const response = await apiRequest<ArctrackerLoadoutResponse>(
    `/v2/user/loadout?locale=${locale}`
  );

  const cachedLoadout: CachedLoadout = {
    loadout: response.data.loadout,
    syncedAt: response.data.syncedAt,
    cachedAt: Date.now(),
  };

  await cacheSet('loadout', cachedLoadout);
  return cachedLoadout;
}

/**
 * Sync and cache hideout progression.
 * Transforms API shape (id → moduleId), excludes stash module.
 */
export async function syncHideout(): Promise<CachedHideout> {
  const response = await apiRequest<ArctrackerHideoutResponse>(
    `/v2/user/hideout`
  );

  // Transform API modules: map id → moduleId, exclude stash
  const modules = response.data.modules
    .filter(m => m.id !== 'stash')
    .map(m => ({
      moduleId: m.id,
      currentLevel: m.currentLevel,
      maxLevel: m.maxLevel,
    }));

  const cachedHideout: CachedHideout = {
    modules,
    syncedAt: response.data.syncedAt ?? new Date().toISOString(),
    cachedAt: Date.now(),
  };

  await cacheSet('hideout', cachedHideout);
  return cachedHideout;
}

/**
 * Sync and cache learned blueprints.
 */
export async function syncBlueprints(): Promise<CachedBlueprints> {
  const response = await apiRequest<ArctrackerBlueprintsResponse>(
    `/v2/user/blueprints`
  );

  const blueprintsByTargetItemId: CachedBlueprints['blueprintsByTargetItemId'] = {};
  const unlockedItemIds: string[] = [];

  for (const blueprint of response.data.blueprints) {
    if (!blueprint.targetItemId) continue;

    blueprintsByTargetItemId[blueprint.targetItemId] = {
      id: blueprint.id,
      name: blueprint.name,
      category: blueprint.category,
      rarity: blueprint.rarity,
      learned: blueprint.learned,
      targetItemId: blueprint.targetItemId,
    };

    if (blueprint.learned) {
      unlockedItemIds.push(blueprint.targetItemId);
    }
  }

  const cachedBlueprints: CachedBlueprints = {
    unlockedItemIds: Array.from(new Set(unlockedItemIds)).sort((a, b) => a.localeCompare(b)),
    blueprintsByTargetItemId,
    syncedAt: new Date().toISOString(),
    cachedAt: Date.now(),
  };

  await cacheSet('blueprints', cachedBlueprints);
  return cachedBlueprints;
}

/**
 * Sync and cache project progress.
 */
function transformPhaseGoals(
  phase: ArctrackerProjectPhase,
): { goals: CachedProjectGoal[]; categoryRequirements?: CachedProjectCategoryGoal[] } {
  const goals: CachedProjectGoal[] = (phase.requirements ?? []).map((req) => ({
    itemId: req.itemId,
    required: req.required,
    submitted: req.submitted,
    remaining: Math.max(0, req.required - req.submitted),
    completed: req.submitted >= req.required,
  }));

  const categoryRequirements: CachedProjectCategoryGoal[] | undefined = phase.categoryRequirements?.length
    ? phase.categoryRequirements.map((cat) => ({
        category: cat.category,
        required: cat.required,
        submitted: cat.submitted,
        remaining: Math.max(0, cat.required - cat.submitted),
        completed: cat.submitted >= cat.required,
      }))
    : undefined;

  return { goals, categoryRequirements: categoryRequirements?.length ? categoryRequirements : undefined };
}

export async function syncProjects(): Promise<CachedProjects> {
  const response = await apiRequest<ArctrackerProjectsResponse>(
    `/v2/user/projects`
  );

  const projects = response.data.projects.map((proj) => {
    const stepProgressList = proj.phases.map((phase) => {
      const { goals, categoryRequirements } = transformPhaseGoals(phase);
      return {
        name: phase.name,
        index: phase.phase,
        completed: phase.completed,
        goals,
        categoryRequirements,
      };
    });

    return {
      projectId: proj.id,
      projectName: proj.name,
      completed: proj.fullyCompleted,
      steps: stepProgressList,
      syncedAt: new Date().toISOString(),
      cachedAt: Date.now(),
    };
  });

  const cachedProjects: CachedProjects = {
    projects: projects.map((proj) => ({
      ...proj,
      syncedAt: new Date().toISOString(),
      cachedAt: Date.now(),
    })),
    syncedAt: new Date().toISOString(),
    cachedAt: Date.now(),
  };

  await cacheSet('projects', cachedProjects);
  return cachedProjects;
}

/**
 * Get cached project progress (from IndexedDB).
 */
export async function getProjects(): Promise<CachedProjects | undefined> {
  return getCachedProjects();
}

/**
 * Sync all data (profile, stash, loadout).
 */
export async function syncAll(): Promise<{
  profile: CachedProfile;
  stash: CachedStash;
  loadout: CachedLoadout;
}> {
  const [profile, stash, loadout] = await Promise.all([
    syncProfile(),
    syncStashAllPages(),
    syncLoadout(),
  ]);

  return { profile, stash, loadout };
}

/**
 * Get cached profile (from IndexedDB).
 */
export async function getProfile(): Promise<CachedProfile | undefined> {
  return getCachedProfile();
}

/**
 * Get cached stash (from IndexedDB).
 */
export async function getStash(): Promise<CachedStash | undefined> {
  return getCachedStash();
}

/**
 * Get cached loadout (from IndexedDB).
 */
export async function getLoadout(): Promise<CachedLoadout | undefined> {
  return getCachedLoadout();
}

/**
 * Get cached hideout (from IndexedDB).
 */
export async function getHideout(): Promise<CachedHideout | undefined> {
  return getCachedHideout();
}

/**
 * Get cached blueprints (from IndexedDB).
 */
export async function getBlueprints(): Promise<CachedBlueprints | undefined> {
  return getCachedBlueprints();
}
