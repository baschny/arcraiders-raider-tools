import { getMapSlug, getMapImage } from '../utils/mapMeta';

// Trader image paths (keyed by English trader name)
export const TRADER_IMAGES: Record<string, string> = {
  Celeste: '/images/trader/celeste.png',
  Shani: '/images/trader/shani.png',
  Lance: '/images/trader/lance.png',
  'Tian Wen': '/images/trader/tian_wen.png',
  Apollo: '/images/trader/apollo.png',
};

/** Image of a map prerequisite node (its `map[0]` is the `maps` domain slug). */
export function getMapNodeImage(mapId: string | undefined): string | undefined {
  const slug = mapId ? getMapSlug(mapId) : null;
  return slug ? getMapImage(slug) : undefined;
}

// LocalStorage key for quest progress
export const STORAGE_KEY = 'arcraiders-quest-progress-reactflow';
