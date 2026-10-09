// URL segments of the what's-new page. Kept free of React and icons so the build's SEO plugin can import them.

/** Versions that have a what's-new page. */
export const WHATS_NEW_VERSIONS = ['frozen-trail'] as const;
export type WhatsNewVersion = (typeof WHATS_NEW_VERSIONS)[number];
export const DEFAULT_WHATS_NEW_VERSION: WhatsNewVersion = 'frozen-trail';

/** Tabs of the what's-new page, in display order; the first one is the default. */
export const WHATS_NEW_TAB_IDS = [
  'new-items',
  'old-items',
  'outpost',
  'research',
  'amplified',
  'crafting',
  'changes',
] as const;

export type WhatsNewTab = (typeof WHATS_NEW_TAB_IDS)[number];
export const DEFAULT_WHATS_NEW_TAB: WhatsNewTab = 'new-items';
