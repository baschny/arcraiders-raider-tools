// URL segments of the what's-new page. Kept free of React and icons so the build's SEO plugin can import them.

/** Versions that have a what's-new page. */
export const WHATS_NEW_VERSIONS = ['frozen-trail'] as const;
export type WhatsNewVersion = (typeof WHATS_NEW_VERSIONS)[number];
export const DEFAULT_WHATS_NEW_VERSION = 'frozen-trail' satisfies WhatsNewVersion;

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
export const DEFAULT_WHATS_NEW_TAB = 'new-items' satisfies WhatsNewTab;

/** URL of a tab: the default tab is the version's own page, without a tab segment. */
export function whatsNewPath(version: string, tab: WhatsNewTab = DEFAULT_WHATS_NEW_TAB): string {
  return tab === DEFAULT_WHATS_NEW_TAB ? `/whats-new/${version}` : `/whats-new/${version}/${tab}`;
}
