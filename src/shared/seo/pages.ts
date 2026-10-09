// Public pages of the site: the single source for page titles, search snippets, link previews,
// the pre-rendered HTML of each route and the sitemap (see scripts/seo/). Kept free of React
// and DOM types so the build can import it.
import {
  DEFAULT_WHATS_NEW_TAB,
  DEFAULT_WHATS_NEW_VERSION,
  WHATS_NEW_TAB_IDS,
  WHATS_NEW_VERSIONS,
} from '../../apps/whats-new/routing';

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

const WHATS_NEW_DEFAULT_PATH = `/whats-new/${DEFAULT_WHATS_NEW_VERSION}/${DEFAULT_WHATS_NEW_TAB}`;

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
  { path: '/map-sizes', titleKey: 'maps.sizes.viewSizes', descriptionKey: 'seo.mapSizes', image: 'map-sizes.jpg' },
  // The bare what's-new paths redirect to the default tab in the app.
  ...['/whats-new', ...WHATS_NEW_VERSIONS.map((version) => `/whats-new/${version}`)].map((path) => ({
    path,
    titleKey: 'whatsNew.title',
    descriptionKey: `seo.whatsNew.${DEFAULT_WHATS_NEW_TAB}`,
    image: `whats-new-${DEFAULT_WHATS_NEW_TAB}.jpg`,
    canonicalPath: WHATS_NEW_DEFAULT_PATH,
  })),
  ...WHATS_NEW_VERSIONS.flatMap((version) =>
    WHATS_NEW_TAB_IDS.map((tab) => ({
      path: `/whats-new/${version}/${tab}`,
      titleKey: `whatsNew.intro.${tab}.title`,
      descriptionKey: `seo.whatsNew.${tab}`,
      image: `whats-new-${tab}.jpg`,
    })),
  ),
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
 * Absolute URL of a path as the host serves it without a redirect: the pre-rendered
 * `<path>/index.html` is reached through the trailing-slash URL.
 */
export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}/`;
}

export function canonicalUrl(page: SeoPage): string {
  return absoluteUrl(page.canonicalPath ?? page.path);
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
