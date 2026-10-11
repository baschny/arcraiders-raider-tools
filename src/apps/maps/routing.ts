// Map slugs of the page URLs (/maps/<slug>). Kept free of React so the build's SEO plugin can import them; they must
// match the `slug` of the maps in public/data/map-data/index.json (checked by __tests__/routing.test.ts).

/** Map slugs (`slug` of the arc-data map records) of the maps the page shows. */
export const MAP_SLUGS = [
  'dam-battleground',
  'buried-city',
  'the-spaceport',
  'blue-gate',
  'stella-montis',
  'riven-tides',
  'pendola-pass',
] as const;
