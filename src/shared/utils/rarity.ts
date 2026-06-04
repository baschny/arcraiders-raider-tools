import type { ItemRarity } from '../types/item';

const VALID_RARITIES: Set<string> = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);

/** Normalize any rarity input into a canonical ItemRarity. Falls back to 'Common'. */
export function normalizeItemRarity(value: string | null | undefined): ItemRarity {
  if (!value) return 'Common';
  const lower = value.toLowerCase().trim();
  if (VALID_RARITIES.has(lower)) {
    return (lower.charAt(0).toUpperCase() + lower.slice(1)) as ItemRarity;
  }
  return 'Common';
}

/** Return a `rarity-<lowercase>` CSS class suffix. Accepts any string, normalizes internally. */
export function getRarityClass(rarity: string | null | undefined): string {
  return `rarity-${normalizeItemRarity(rarity).toLowerCase()}`;
}
