import type { AppLocale } from '../../../shared/i18n/config';
import { getLocalizedMapName, normalizeMapId } from './localization';

export type MapSlug =
  | 'blue-gate'
  | 'buried-city'
  | 'dam-battleground'
  | 'stella-montis'
  | 'the-spaceport';

const KNOWN_MAP_SLUGS: readonly MapSlug[] = [
  'blue-gate',
  'buried-city',
  'dam-battleground',
  'stella-montis',
  'the-spaceport',
];

const MAP_IMAGE_PATHS: Record<MapSlug, string> = {
  'blue-gate': '/images/maps/blue-gate.webp',
  'buried-city': '/images/maps/buried-city.webp',
  'dam-battleground': '/images/maps/dam-battleground.webp',
  'stella-montis': '/images/maps/stella-montis.webp',
  'the-spaceport': '/images/maps/the-spaceport.webp',
};

/**
 * Accent colors loosely tied to each map's visual identity.
 * Used for the vertical separator bar on the sidebar map indicator.
 */
const MAP_ACCENT_COLORS: Record<MapSlug, string> = {
  'blue-gate': '#4fc3f7',
  'buried-city': '#ff9800',
  'dam-battleground': '#26a69a',
  'stella-montis': '#b39ddb',
  'the-spaceport': '#90a4ae',
};

const MULTI_ACCENT_COLOR = '#9e9e9e';

function isKnownMapSlug(slug: string): slug is MapSlug {
  return (KNOWN_MAP_SLUGS as readonly string[]).includes(slug);
}

export function getMapSlug(mapId: string): MapSlug | null {
  const normalized = normalizeMapId(mapId);
  return isKnownMapSlug(normalized) ? normalized : null;
}

export function getMapImage(slug: MapSlug): string {
  return MAP_IMAGE_PATHS[slug];
}

export function getMapAccent(slug: MapSlug): string {
  return MAP_ACCENT_COLORS[slug];
}

export interface QuestMapIndicator {
  /** Unique map slugs after normalization (in input order). */
  slugs: MapSlug[];
  /** Localized map names for display (in input order, deduped). */
  names: string[];
  /** Accent color: map-specific for single, generic for multiple. */
  accentColor: string;
  /** Background image URL for the indicator, undefined when multiple. */
  backgroundImage?: string;
  /** True when the quest takes place on more than one distinct map. */
  isMultiple: boolean;
}

/**
 * Build metadata used to render the map indicator for a quest in the sidebar.
 * Returns null when the quest has no known maps so the caller can omit the indicator.
 */
export function getQuestMapIndicator(
  mapIds: string[] | undefined,
  locale: AppLocale
): QuestMapIndicator | null {
  if (!mapIds || mapIds.length === 0) {
    return null;
  }

  const uniqueSlugs: MapSlug[] = [];
  const uniqueNames: string[] = [];
  const seenSlugs = new Set<string>();
  const seenNames = new Set<string>();

  for (const mapId of mapIds) {
    const slug = getMapSlug(mapId);
    if (slug && !seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      uniqueSlugs.push(slug);
    }
    const name = getLocalizedMapName(mapId, locale);
    if (name && !seenNames.has(name)) {
      seenNames.add(name);
      uniqueNames.push(name);
    }
  }

  if (uniqueSlugs.length === 0) {
    return null;
  }

  const isMultiple = uniqueSlugs.length > 1;

  if (isMultiple) {
    return {
      slugs: uniqueSlugs,
      names: uniqueNames,
      accentColor: MULTI_ACCENT_COLOR,
      isMultiple: true,
    };
  }

  const [onlySlug] = uniqueSlugs;
  return {
    slugs: uniqueSlugs,
    names: uniqueNames,
    accentColor: getMapAccent(onlySlug),
    backgroundImage: getMapImage(onlySlug),
    isMultiple: false,
  };
}
