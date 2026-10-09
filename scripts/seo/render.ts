// Head tags, sitemap and robots.txt of the public pages (src/shared/seo/pages.ts), rendered at build time.
// Link preview crawlers do not run JavaScript, so each page needs its tags in the served HTML.
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

/** Looks up an English UI string; throws on a missing key so the build fails instead of shipping a raw key. */
export type Translate = (key: string) => string;

export function createTranslate(dictionary: Record<string, unknown>): Translate {
  return (key) => {
    const value = key.split('.').reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      dictionary,
    );
    if (typeof value !== 'string') throw new Error(`SEO: missing translation key "${key}" in en.json`);
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

export function renderHead(page: SeoPage, t: Translate): string {
  const siteName = t('app.name');
  const title = formatPageTitle(siteName, page.titleKey ? t(page.titleKey) : undefined);
  const description = t(page.descriptionKey);
  const url = canonicalUrl(page);
  const image = imageUrl(page);
  const meta = (attr: 'name' | 'property', key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    meta('name', 'description', description),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', siteName),
    meta('property', 'og:locale', 'en_US'),
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
      url: `${SITE_URL}/`,
      description,
      inLanguage: 'en',
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(website).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}

/** The built index.html with the head tags of a page in place of its `<title>`. */
export function renderPageHtml(indexHtml: string, page: SeoPage, t: Translate): string {
  if (!/<title>[^<]*<\/title>/.test(indexHtml)) throw new Error('SEO: index.html has no <title> to replace');
  return indexHtml.replace(/<title>[^<]*<\/title>/, () => renderHead(page, t));
}

export function renderSitemap(pages: readonly SeoPage[] = SEO_PAGES): string {
  const urls = pages
    .filter((page) => !page.canonicalPath)
    .map((page) => `  <url><loc>${escapeHtml(absoluteUrl(page.path))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function renderRobots(): string {
  return [
    'User-agent: *',
    ...PRIVATE_PATH_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Output file of a page in the build directory, relative to it. */
export function pageOutputFile(page: SeoPage): string {
  return page.path === '/' ? 'index.html' : `${page.path.slice(1)}/index.html`;
}
