const LOCATION_ICONS: Record<string, string> = {
  arc: '/images/locations/arc.webp',
  commercial: '/images/locations/commercial.webp',
  electrical: '/images/locations/electrical.webp',
  exodus: '/images/locations/exodus.webp',
  industrial: '/images/locations/industrial.webp',
  mechanical: '/images/locations/mechanical.webp',
  medical: '/images/locations/medical.webp',
  old_world: '/images/locations/old_world.webp',
  raider: '/images/locations/raider.webp',
  residential: '/images/locations/residential.webp',
  security: '/images/locations/security.webp',
  technological: '/images/locations/technological.webp',
};

function normalizeLocationKey(location: string): string {
  return location
    .trim()
    .toLowerCase()
    .replace(/[.-]/g, ' ')
    .replace(/\s+/g, '_');
}

export function getLocationIcon(location: string): string | undefined {
  return LOCATION_ICONS[normalizeLocationKey(location)];
}
