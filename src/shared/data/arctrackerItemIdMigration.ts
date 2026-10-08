/**
 * ArcTracker item id translation.
 *
 * Item ids from the arctracker API are arctracker slugs. Ours are frozen slugs that equal them in
 * almost all cases; where they differ, the v2 items file carries `arctrackerAliases`
 * (arctracker id → our slug), generated from arcraiders-api-mapping. Call
 * `ensureArctrackerAliases()` before translating (it loads the cached items structure).
 */
import { loadStructure } from '../gamedata/loader';

let aliases: Record<string, string> = {};
let loaded: Promise<void> | null = null;

export function ensureArctrackerAliases(): Promise<void> {
  loaded ??= loadStructure('items')
    .then((items) => {
      aliases = { ...(items.arctrackerAliases ?? {}) };
    })
    .catch((error: unknown) => {
      loaded = null;
      console.error('Failed to load arctracker aliases:', error);
    });
  return loaded;
}

/** Test helper / explicit injection. */
export function setArctrackerAliases(next: Record<string, string>): void {
  aliases = { ...next };
  loaded = Promise.resolve();
}

export function migrateArctrackerItemId(itemId: string | null): string | null {
  if (!itemId) return itemId;
  return aliases[itemId] ?? itemId;
}
