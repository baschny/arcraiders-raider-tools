/**
 * Cache Service
 * IndexedDB wrapper for storing ArcTracker API data locally.
 * Uses idb for a promise-based IndexedDB API.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type {
  CachedProfile,
  CachedStash,
  CachedLoadout,
  CachedHideout,
  CachedBlueprints,
  CachedProjects,
  CacheMeta,
  CacheKey,
} from '../types/arctracker';

const DB_NAME = 'raiderToolsCache';
const DB_VERSION = 1;
const STORE_NAME = 'arctracker';

type CacheValue =
  | CachedProfile
  | CachedStash
  | CachedLoadout
  | CachedHideout
  | CachedBlueprints
  | CachedProjects
  | CacheMeta;

let dbPromise: Promise<IDBPDatabase> | null = null;
let activeCacheOwnerSub: string | null = null;
let activeCacheSource: 'arctracker' | 'embark' | null = null;

/**
 * Set the signed-in Raider Tools user that owns ArcTracker cache reads/writes.
 * Passing null disables reads and writes until a new owner is known.
 */
export async function setCacheOwner(userSub: string | null): Promise<void> {
  activeCacheOwnerSub = userSub;
  if (!userSub) return;

  const meta = await readRawMeta();
  if (meta?.userSub !== userSub || (activeCacheSource && meta?.source && meta.source !== activeCacheSource)) {
    await cacheClear();
  }
}

export async function setCacheSource(source: 'arctracker' | 'embark' | null): Promise<void> {
  activeCacheSource = source;
  if (!activeCacheOwnerSub || !source) return;
  const meta = await readRawMeta();
  const sourceMatches = meta?.source === source || (source === 'arctracker' && !meta?.source);
  if (meta && !sourceMatches) {
    await cacheClear();
  }
  await updateCacheMeta({ source });
}

/**
 * Get or initialize the database connection.
 */
function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Get a value from the cache.
 */
export async function cacheGet<T extends CacheValue>(key: CacheKey): Promise<T | undefined> {
  const db = await getDB();
  if (key !== 'meta' && !(await cacheBelongsToActiveOwner())) {
    return undefined;
  }
  return db.get(STORE_NAME, key) as Promise<T | undefined>;
}

/**
 * Set a value in the cache.
 */
export async function cacheSet<T extends CacheValue>(key: CacheKey, value: T): Promise<void> {
  const db = await getDB();
  if (key !== 'meta' && !(await prepareCacheWrite())) {
    return;
  }
  await db.put(STORE_NAME, value, key);
}

/**
 * Delete a specific key from the cache.
 */
export async function cacheDelete(key: CacheKey): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

/**
 * Clear all cached data.
 */
export async function cacheClear(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

/**
 * Get the cache metadata.
 */
export async function getCacheMeta(): Promise<CacheMeta | undefined> {
  return cacheGet<CacheMeta>('meta');
}

/**
 * Update the cache metadata.
 */
export async function updateCacheMeta(updates: Partial<CacheMeta>): Promise<void> {
  const current = await getCacheMeta();
  const meta: CacheMeta = {
    lastSyncedAt: current?.lastSyncedAt ?? null,
    version: current?.version ?? 1,
    userSub: activeCacheOwnerSub,
    source: activeCacheSource ?? current?.source,
    ...updates,
  };
  await cacheSet('meta', meta);
}

/**
 * Get cached profile data.
 */
export async function getCachedProfile(): Promise<CachedProfile | undefined> {
  return cacheGet<CachedProfile>('profile');
}

/**
 * Get cached stash data.
 */
export async function getCachedStash(): Promise<CachedStash | undefined> {
  return cacheGet<CachedStash>('stash');
}

/**
 * Get cached loadout data.
 */
export async function getCachedLoadout(): Promise<CachedLoadout | undefined> {
  return cacheGet<CachedLoadout>('loadout');
}

/**
 * Get cached hideout data.
 */
export async function getCachedHideout(): Promise<CachedHideout | undefined> {
  return cacheGet<CachedHideout>('hideout');
}

/**
 * Get cached blueprint data.
 */
export async function getCachedBlueprints(): Promise<CachedBlueprints | undefined> {
  return cacheGet<CachedBlueprints>('blueprints');
}

/**
 * Get cached project progress.
 */
export async function getCachedProjects(): Promise<CachedProjects | undefined> {
  return cacheGet<CachedProjects>('projects');
}

async function readRawMeta(): Promise<CacheMeta | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, 'meta') as Promise<CacheMeta | undefined>;
}

async function cacheBelongsToActiveOwner(): Promise<boolean> {
  if (!activeCacheOwnerSub) return false;

  const meta = await readRawMeta();
  const sourceMatches = !activeCacheSource ||
    meta?.source === activeCacheSource ||
    (activeCacheSource === 'arctracker' && !meta?.source);
  return meta?.userSub === activeCacheOwnerSub &&
    sourceMatches;
}

async function prepareCacheWrite(): Promise<boolean> {
  if (!activeCacheOwnerSub) return false;

  const meta = await readRawMeta();
  if (meta?.userSub !== activeCacheOwnerSub) {
    await cacheClear();
  }

  await updateCacheMeta({ userSub: activeCacheOwnerSub, source: activeCacheSource ?? undefined });
  return true;
}
