// Head tags, sitemap and robots.txt of the public pages (src/shared/seo/pages.ts) in every language,
// rendered at build time. Link preview crawlers do not run JavaScript, so each page needs its tags
// in the served HTML.
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getIntlLocale,
  localizePath,
  type AppLocale,
} from '../../src/shared/i18n/localeCodes';
import {
  PRIVATE_PATH_PREFIXES,
  SEO_PAGES,
  SITE_URL,
  absoluteUrl,
  canonicalUrl,
  formatPageTitle,
  imageUrl,
  type SeoPage,
} from '../../src/shared/seo/pages';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Looks up a UI string; throws on a key missing in English so the build fails instead of shipping a raw key. */
export type Translate = (key: string) => string;

export type Dictionaries = Partial<Record<AppLocale, Record<string, unknown>>>;

function lookup(dictionary: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    dictionary,
  );
  return typeof value === 'string' && value ? value : undefined;
}

/** Translations of a locale, falling back to English like the app does. */
export function createTranslate(dictionaries: Dictionaries, locale: AppLocale = DEFAULT_LOCALE): Translate {
  return (key) => {
    const value = lookup(dictionaries[locale], key) ?? lookup(dictionaries[DEFAULT_LOCALE], key);
    if (value === undefined) throw new Error(`SEO: missing translation key "${key}" in en.json`);
    return value;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Open Graph locale: `de_DE`, `pt_BR`. */
function ogLocale(locale: AppLocale): string {
  return getIntlLocale(locale).replace('-', '_');
}

/** The page in every language, plus `x-default` (English, the version without prefix). */
function alternateLinks(page: SeoPage): string[] {
  return [
    ...SUPPORTED_LOCALES.map(
      (locale) => `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(absoluteUrl(page.path, locale))}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(absoluteUrl(page.path))}" />`,
  ];
}

export function renderHead(page: SeoPage, locale: AppLocale, t: Translate): string {
  const siteName = t('app.name');
  const title = formatPageTitle(siteName, page.titleKey ? t(page.titleKey) : undefined);
  const description = t(page.descriptionKey);
  const url = canonicalUrl(page, locale);
  const image = imageUrl(page);
  const meta = (attr: 'name' | 'property', key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    meta('name', 'description', description),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    // Pages that only redirect point to their target and have no language versions of their own.
    ...(page.canonicalPath ? [] : alternateLinks(page)),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', siteName),
    meta('property', 'og:locale', ogLocale(locale)),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', String(OG_IMAGE_WIDTH)),
    meta('property', 'og:image:height', String(OG_IMAGE_HEIGHT)),
    meta('property', 'og:image:alt', title),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    meta('name', 'twitter:image', image),
  ];
  if (page.path === '/') {
    const website = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      alternateName: 'Raider Tools',
      url,
      description,
      inLanguage: locale,
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(website).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}

/** The built index.html in a page's language, with the page's head tags in place of its `<title>`. */
export function renderPageHtml(indexHtml: string, page: SeoPage, locale: AppLocale, t: Translate): string {
  if (!/<title>[^<]*<\/title>/.test(indexHtml)) throw new Error('SEO: index.html has no <title> to replace');
  return indexHtml
    .replace(/<html lang="[^"]*">/, `<html lang="${locale}">`)
    .replace(/<title>[^<]*<\/title>/, () => renderHead(page, locale, t));
}

export function renderSitemap(pages: readonly SeoPage[] = SEO_PAGES): string {
  const urls = pages
    .filter((page) => !page.canonicalPath)
    .flatMap((page) => {
      const alternates = [
        ...SUPPORTED_LOCALES.map(
          (locale) =>
            `    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeHtml(absoluteUrl(page.path, locale))}"/>`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(absoluteUrl(page.path))}"/>`,
      ];
      return SUPPORTED_LOCALES.map((locale) =>
        [`  <url>`, `    <loc>${escapeHtml(absoluteUrl(page.path, locale))}</loc>`, ...alternates, `  </url>`].join('\n'),
      );
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function renderRobots(): string {
  return [
    'User-agent: *',
    ...SUPPORTED_LOCALES.flatMap((locale) =>
      PRIVATE_PATH_PREFIXES.map((prefix) => `Disallow: ${localizePath(prefix, locale)}`),
    ),
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Output file of a page in a language, relative to the build directory. */
export function pageOutputFile(page: SeoPage, locale: AppLocale = DEFAULT_LOCALE): string {
  const path = localizePath(page.path, locale);
  return path === '/' ? 'index.html' : `${path.slice(1)}/index.html`;
}
