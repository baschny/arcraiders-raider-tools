/**
 * ArcTracker API Service
 * Handles all communication with the arctracker.io API via our proxy.
 * Includes retry logic, timeout handling, and IndexedDB caching.
 */

import type {
  ArctrackerProfileResponse,
  ArctrackerStashResponse,
  ArctrackerLoadoutResponse,
  CachedProfile,
  CachedStash,
  CachedLoadout,
  ApiError,
  ArctrackerStashItem,
} from '../types/arctracker';
import {
  cacheSet,
  getCachedProfile,
  getCachedStash,
  getCachedLoadout,
  updateCacheMeta,
} from './cacheService';
import { getToken } from '../utils/tokenStorage';

const API_BASE = 'https://api.raider-tools.app/arctracker';
const LOCALE = 'en';
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;
const STASH_PER_PAGE = 500;

/**
 * Create an API error object.
 */
function createApiError(message: string, status?: number, isRetryable = false): ApiError {
  return { message, status, isRetryable };
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
  const authToken = token ?? getToken();
  if (!authToken) {
    throw createApiError('No authentication token available', 401, false);
  }

  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const isRetryable = response.status >= 500 || response.status === 429;

      if (isRetryable && retryCount < MAX_RETRIES) {
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiRequest<T>(endpoint, token, retryCount + 1);
      }

      throw createApiError(
        `API request failed: ${response.status} ${response.statusText}`,
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

/**
 * Validate a token by calling the profile endpoint.
 * Returns the username if valid, null otherwise.
 */
export async function validateToken(token: string): Promise<string | null> {
  try {
    const response = await apiRequest<ArctrackerProfileResponse>(
      `/v2/user/profile`,
      token
    );
    return response.data.username;
  } catch {
    return null;
  }
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
    cachedAt: Date.now(),
  };

  await cacheSet('profile', cachedProfile);
  return cachedProfile;
}

/**
 * Fetch a single page of stash data.
 */
async function fetchStashPage(page: number): Promise<ArctrackerStashResponse> {
  return apiRequest<ArctrackerStashResponse>(
    `/v2/user/stash?locale=${LOCALE}&page=${page}&per_page=${STASH_PER_PAGE}&sort=slot`
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
  const response = await apiRequest<ArctrackerLoadoutResponse>(
    `/v2/user/loadout?locale=${LOCALE}`
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
