/**
 * ArcTracker Item ID Migration
 *
 * Maps incorrect item IDs from the ArcTracker API to our canonical item IDs.
 * This mapping is temporary and should be removed once the upstream API is fixed.
 */
export const ARCTRACKER_ITEM_ID_MAP: Record<string, string> = {
  football_shoes_green: 'colorful_shoes_red',
  football_shoes_red: 'colorful_shoes_green',
  football_shoes_silver: 'colorful_shoes_silver',
};

export function migrateArctrackerItemId(itemId: string | null): string | null {
  if (!itemId) return itemId;
  return ARCTRACKER_ITEM_ID_MAP[itemId] ?? itemId;
}
