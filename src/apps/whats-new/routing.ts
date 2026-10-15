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

/**
 * Release of the update changelog each guide belongs to (its URL slug): the guide is that
 * release's in-depth page, `/updates/<slug>/details`.
 */
const RELEASE_OF_VERSION: Record<WhatsNewVersion, { slug: string; title: string }> = {
  'frozen-trail': { slug: '2026-10-08-frozen-trail', title: '2.0 Frozen Trail' },
};

/** Path and title of the release a guide belongs to (for the breadcrumb). */
export function releaseOfWhatsNew(version: WhatsNewVersion): { path: string; title: string } {
  const r = RELEASE_OF_VERSION[version];
  return { path: `/updates/${r.slug}`, title: r.title };
}

export function whatsNewVersionOfRelease(slug: string | undefined): WhatsNewVersion | undefined {
  return WHATS_NEW_VERSIONS.find((v) => RELEASE_OF_VERSION[v].slug === slug);
}

/** URL of a tab: the default tab is the guide's own page, without a tab segment. */
export function whatsNewPath(version: string, tab: WhatsNewTab = DEFAULT_WHATS_NEW_TAB): string {
  const base = `/updates/${RELEASE_OF_VERSION[version as WhatsNewVersion]?.slug ?? version}/details`;
  return tab === DEFAULT_WHATS_NEW_TAB ? base : `${base}/${tab}`;
}
