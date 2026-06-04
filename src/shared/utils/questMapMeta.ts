import type { AppLocale } from '../i18n/config';
import { getLocalizedMapName, normalizeMapId } from './questLocalization';

export type MapSlug =
  | 'blue-gate'
  | 'buried-city'
  | 'dam-battleground'
  | 'riven-tides'
  | 'stella-montis'
  | 'the-spaceport';

const KNOWN_MAP_SLUGS: readonly MapSlug[] = [
  'blue-gate',
  'buried-city',
  'dam-battleground',
  'riven-tides',
  'stella-montis',
  'the-spaceport',
];

const MAP_IMAGE_PATHS: Record<MapSlug, string> = {
  'blue-gate': '/images/maps/blue-gate.webp',
  'buried-city': '/images/maps/buried-city.webp',
  'dam-battleground': '/images/maps/dam-battleground.webp',
  'riven-tides': '/images/maps/riven-tides.webp',
  'stella-montis': '/images/maps/stella-montis.webp',
  'the-spaceport': '/images/maps/the-spaceport.webp',
};

const MAP_ACCENT_COLORS: Record<MapSlug, string> = {
  'blue-gate': '#4fc3f7',
  'buried-city': '#ff9800',
  'dam-battleground': '#26a69a',
  'riven-tides': '#4db6ac',
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

export interface MapIndicatorSegment {
  slug: MapSlug;
  name: string;
  accentColor: string;
  backgroundImage: string;
}

export interface QuestMapIndicator {
  slugs: MapSlug[];
  names: string[];
  accentColor: string;
  backgroundImage?: string;
  segments?: MapIndicatorSegment[];
  mapCount: number;
  isMultiple: boolean;
}

export function getQuestMapIndicator(
  mapIds: string[] | undefined,
  locale: AppLocale,
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

  const mapCount = uniqueSlugs.length;
  const isMultiple = mapCount > 1;

  if (isMultiple) {
    const segments: MapIndicatorSegment[] | undefined =
      mapCount >= 2 && mapCount <= 3
        ? uniqueSlugs.map((slug, index) => ({
            slug,
            name: uniqueNames[index] ?? slug,
            accentColor: getMapAccent(slug),
            backgroundImage: getMapImage(slug),
          }))
        : undefined;

    return {
      slugs: uniqueSlugs,
      names: uniqueNames,
      accentColor: MULTI_ACCENT_COLOR,
      segments,
      mapCount,
      isMultiple: true,
    };
  }

  const [onlySlug] = uniqueSlugs;
  return {
    slugs: uniqueSlugs,
    names: uniqueNames,
    accentColor: getMapAccent(onlySlug),
    backgroundImage: getMapImage(onlySlug),
    mapCount,
    isMultiple: false,
  };
}
