/** White game glyphs shipped as public/images/whats-new/icons/<name>.webp (see scripts/generate-whats-new-icons.ts). */
export const GLYPH_NAMES = [
  'outpost',
  'research-station',
  'research-points',
  'research',
  'blueprint',
  'amplified',
  'gunsmith',
  'crafting',
  'workbench',
  'stencil',
  'decoration',
  'gadget',
  'key',
  'beacon',
  'trade',
] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];

export function glyphUrl(name: GlyphName): string {
  return `/images/whats-new/icons/${name}.webp`;
}
