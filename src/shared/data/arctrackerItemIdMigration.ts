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

/**
 * Reverse map: canonical item ID → ArcTracker API item ID.
 * The CDN serves images under ArcTracker's original item IDs, not our
 * canonical IDs, so we need to translate CDN URLs at runtime.
 */
const CANONICAL_TO_ARCTRACKER_ID: Record<string, string> = {};
for (const [apiId, canonicalId] of Object.entries(ARCTRACKER_ITEM_ID_MAP)) {
  CANONICAL_TO_ARCTRACKER_ID[canonicalId] = apiId;
}

const CDN_ITEM_URL_REGEX = /^https:\/\/cdn\.arctracker\.io\/items\/v2\/(.+)\.png$/;

export function fixCdnItemUrl(imageFilename?: string): string | undefined {
  if (!imageFilename) return imageFilename;

  const match = imageFilename.match(CDN_ITEM_URL_REGEX);
  if (!match) return imageFilename;

  const canonicalId = match[1];
  const arctrackerId = CANONICAL_TO_ARCTRACKER_ID[canonicalId];
  if (!arctrackerId) return imageFilename;

  return `https://cdn.arctracker.io/items/v2/${arctrackerId}.png`;
}
