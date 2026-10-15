// Public pages of the site: the single source for page titles, search snippets, link previews,
// the pre-rendered HTML of each route and the sitemap (see scripts/seo/). Kept free of React
// and DOM types so the build can import it.
import { MAP_SLUGS } from '../../apps/maps/routing';
import {
  DEFAULT_WHATS_NEW_TAB,
  DEFAULT_WHATS_NEW_VERSION,
  WHATS_NEW_TAB_IDS,
  WHATS_NEW_VERSIONS,
  whatsNewPath,
  type WhatsNewTab,
} from '../../apps/whats-new/routing';
import { UPDATE_SLUGS } from '../../apps/updates/releases.generated';
import { UPDATES_PATH, updatePath } from '../../apps/updates/routing';
import { DEFAULT_LOCALE, localizePath, type AppLocale } from '../i18n/localeCodes';

export const SITE_URL = 'https://raider-tools.app';

export interface SeoPage {
  /** Route path without trailing slash, `/` for the dashboard. */
  path: string;
  /** Translation key of the page name; absent on the dashboard, whose title is the site name. */
  titleKey?: string;
  /** Translation key of the search snippet and link preview text. */
  descriptionKey: string;
  /** Link preview image, a file in `public/images/og/`. */
  image: string;
  /** Path of the page search engines should index instead; such pages stay out of the sitemap. */
  canonicalPath?: string;
}

export const SEO_PAGES: readonly SeoPage[] = [
  { path: '/', descriptionKey: 'seo.home', image: 'home.jpg' },
  { path: '/schedule', titleKey: 'shared.tools.schedule', descriptionKey: 'seo.schedule', image: 'schedule.jpg' },
  {
    path: '/craft-calculator',
    titleKey: 'shared.tools.craftCalculator',
    descriptionKey: 'seo.craftCalculator',
    image: 'craft-calculator.jpg',
  },
  { path: '/quests', titleKey: 'shared.tools.quests', descriptionKey: 'seo.quests', image: 'quests.jpg' },
  { path: '/loot-helper', titleKey: 'shared.tools.lootHelper', descriptionKey: 'seo.lootHelper', image: 'loot-helper.jpg' },
  {
    path: '/quartermaster',
    titleKey: 'shared.tools.quartermaster',
    descriptionKey: 'seo.quartermaster',
    image: 'quartermaster.jpg',
  },
  { path: '/maps', titleKey: 'shared.tools.maps', descriptionKey: 'seo.maps', image: 'maps.jpg' },
  // Each map has its own URL; search engines index the tool page.
  ...MAP_SLUGS.map((slug) => ({
    path: `/maps/${slug}`,
    titleKey: 'shared.tools.maps',
    descriptionKey: 'seo.maps',
    image: 'maps.jpg',
    canonicalPath: '/maps',
  })),
  { path: '/map-sizes', titleKey: 'maps.sizes.viewSizes', descriptionKey: 'seo.mapSizes', image: 'map-sizes.jpg' },
  // A version's own page shows its default tab: the entry point to the update.
  ...WHATS_NEW_VERSIONS.map((version) => ({
    path: whatsNewPath(version),
    titleKey: `seo.whatsNew.${version}.title`,
    descriptionKey: `seo.whatsNew.${version}.description`,
    image: `whats-new-${version}.jpg`,
  })),
  ...WHATS_NEW_VERSIONS.flatMap((version) =>
    WHATS_NEW_TAB_IDS.filter((tab) => tab !== DEFAULT_WHATS_NEW_TAB).map((tab) => ({
      path: whatsNewPath(version, tab),
      titleKey: `whatsNew.intro.${tab}.title`,
      descriptionKey: `seo.whatsNew.${tab}`,
      image: `whats-new-${tab}.jpg`,
    })),
  ),
  // Paths the app redirects to a guide page: the default tab's own segment, and the former
  // `/whats-new/<version>[/<tab>]` URLs (the guide now lives under its release in /updates).
  ...([
    { path: '/whats-new', version: DEFAULT_WHATS_NEW_VERSION, tab: DEFAULT_WHATS_NEW_TAB },
    ...WHATS_NEW_VERSIONS.flatMap((version) => [
      { path: `${whatsNewPath(version)}/${DEFAULT_WHATS_NEW_TAB}`, version, tab: DEFAULT_WHATS_NEW_TAB },
      ...WHATS_NEW_TAB_IDS.map((tab) => ({
        path: tab === DEFAULT_WHATS_NEW_TAB ? `/whats-new/${version}` : `/whats-new/${version}/${tab}`,
        version,
        tab,
      })),
      { path: `/whats-new/${version}/${DEFAULT_WHATS_NEW_TAB}`, version, tab: DEFAULT_WHATS_NEW_TAB },
    ]),
  ] as { path: string; version: string; tab: WhatsNewTab }[]).map(({ path, version, tab }) => ({
    path,
    titleKey: tab === DEFAULT_WHATS_NEW_TAB ? `seo.whatsNew.${version}.title` : `whatsNew.intro.${tab}.title`,
    descriptionKey: tab === DEFAULT_WHATS_NEW_TAB ? `seo.whatsNew.${version}.description` : `seo.whatsNew.${tab}`,
    image: tab === DEFAULT_WHATS_NEW_TAB ? `whats-new-${version}.jpg` : `whats-new-${tab}.jpg`,
    canonicalPath: whatsNewPath(version, tab),
  })),
  // Update changelog: the list and one page per release (slugs from scripts/generate-updates.ts).
  // Preview image: the What's New "changes" image until the changelog has its own.
  { path: UPDATES_PATH, titleKey: 'shared.tools.updates', descriptionKey: 'seo.updates', image: 'whats-new-changes.jpg' },
  ...UPDATE_SLUGS.map((slug) => ({
    path: updatePath(slug),
    titleKey: 'shared.tools.updates',
    descriptionKey: 'seo.updates',
    image: 'whats-new-changes.jpg',
  })),
];

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** The public page at a route path (with or without trailing slash), if it is one. */
export function findSeoPage(pathname: string): SeoPage | undefined {
  const path = normalizePath(pathname);
  return SEO_PAGES.find((page) => page.path === path);
}

/**
 * Absolute URL of a path in a locale as the host serves it without a redirect: the pre-rendered
 * `<path>/index.html` is reached through the trailing-slash URL.
 */
export function absoluteUrl(path: string, locale: AppLocale = DEFAULT_LOCALE): string {
  const localized = localizePath(path, locale);
  return localized === '/' ? `${SITE_URL}/` : `${SITE_URL}${localized}/`;
}

export function canonicalUrl(page: SeoPage, locale: AppLocale = DEFAULT_LOCALE): string {
  return absoluteUrl(page.canonicalPath ?? page.path, locale);
}

export function imageUrl(page: SeoPage): string {
  return `${SITE_URL}/images/og/${page.image}`;
}

/** Browser and search result title: the page name first, then the site name. */
export function formatPageTitle(appName: string, pageName: string | undefined): string {
  return pageName ? `${pageName} | ${appName}` : appName;
}

/** Path prefixes of pages that must stay out of search engines. */
export const PRIVATE_PATH_PREFIXES = ['/profile', '/auth', '/embark-callback'] as const;
