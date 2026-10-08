import type { ItemRarity } from '../types/item';

const VALID_RARITIES: Set<string> = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary', 'amplified']);

/**
 * Normalize any rarity input into a canonical ItemRarity. Missing or unknown input yields
 * `undefined`: the game gives some items no rarity (blueprints, currency, …) and they are shown
 * without a rarity color.
 */
export function normalizeItemRarity(value: string | null | undefined): ItemRarity | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (VALID_RARITIES.has(lower)) {
    return (lower.charAt(0).toUpperCase() + lower.slice(1)) as ItemRarity;
  }
  return undefined;
}

/** Return a `rarity-<lowercase>` CSS class, or '' for items without rarity. Accepts any string. */
export function getRarityClass(rarity: string | null | undefined): string {
  const normalized = normalizeItemRarity(rarity);
  return normalized ? `rarity-${normalized.toLowerCase()}` : '';
}
