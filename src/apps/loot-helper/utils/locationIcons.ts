const LOCATION_ICONS: Record<string, string> = {
  arc: '/images/locations/arc.webp',
  commercial: '/images/locations/commercial.webp',
  electrical: '/images/locations/electrical.webp',
  industrial: '/images/locations/industrial.webp',
  mechanical: '/images/locations/mechanical.webp',
  medical: '/images/locations/medical.webp',
  nature: '/images/locations/nature.webp',
  old_world: '/images/locations/old_world.webp',
  residential: '/images/locations/residential.webp',
  technological: '/images/locations/technological.webp',
};

export function normalizeLocationKey(location: string): string {
  return location.trim().toLowerCase().replace(/\s+/g, '_');
}

export function getLocationIcon(location: string): string | undefined {
  const key = normalizeLocationKey(location);
  return LOCATION_ICONS[key];
}

export const LOCATION_ICON_KEYS = LOCATION_ICONS;