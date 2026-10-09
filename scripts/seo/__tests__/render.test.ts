import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, type AppLocale } from '../../../src/shared/i18n/localeCodes';
import { SEO_PAGES, findSeoPage } from '../../../src/shared/seo/pages';
import {
  createTranslate,
  pageOutputFile,
  renderPageHtml,
  renderRobots,
  renderSitemap,
  type Dictionaries,
} from '../render';

const root = resolve(__dirname, '../../..');
const dictionaries: Dictionaries = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(resolve(root, `src/shared/i18n/locales/${locale}.json`), 'utf8')),
  ]),
);
const t = createTranslate(dictionaries);
const INDEX_HTML = '<html lang="en"><head>\n    <title>ARC Raiders Tools</title>\n</head><body></body></html>';

function page(path: string) {
  const found = findSeoPage(path);
  if (!found) throw new Error(`no page ${path}`);
  return found;
}

function render(path: string, locale: AppLocale = 'en'): string {
  return renderPageHtml(INDEX_HTML, page(path), locale, createTranslate(dictionaries, locale));
}

describe('SEO pages', () => {
  it('have a title, description and preview image for every page', () => {
    for (const seoPage of SEO_PAGES) {
      if (seoPage.titleKey) expect(() => t(seoPage.titleKey!)).not.toThrow();
      expect(t(seoPage.descriptionKey).length).toBeLessThanOrEqual(165);
      expect(existsSync(resolve(root, 'public/images/og', seoPage.image)), seoPage.image).toBe(true);
    }
  });

  it('have their search texts translated in every language', () => {
    const keys = new Set(
      SEO_PAGES.flatMap((seoPage) => [seoPage.descriptionKey, seoPage.titleKey].filter((key) => key?.startsWith('seo.'))),
    );
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dictionaries[locale]);
        expect(typeof value, `${locale}: ${key}`).toBe('string');
      }
    }
  });

  it('finds pages with and without trailing slash', () => {
    expect(findSeoPage('/quests/')?.path).toBe('/quests');
    expect(findSeoPage('/profile')).toBeUndefined();
  });
});

describe('renderPageHtml', () => {
  it('puts the page tags in place of the title', () => {
    const html = render('/quests');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Quest Tracker | ARC Raiders Tools</title>');
    expect(html).toContain('<link rel="canonical" href="https://raider-tools.app/quests/" />');
    expect(html).toContain('<meta property="og:image" content="https://raider-tools.app/images/og/quests.jpg" />');
    expect(html).toContain('<meta property="og:locale" content="en_US" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('application/ld+json');
  });

  it('renders a page in another language under its prefix', () => {
    const html = render('/quests', 'de');
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<title>Quest-Tracker | ARC Raiders Tools</title>');
    expect(html).toContain('<link rel="canonical" href="https://raider-tools.app/de/quests/" />');
    expect(html).toContain('<meta property="og:locale" content="de_DE" />');
  });

  it('links every language version of a page', () => {
    const html = render('/quests', 'pt-BR');
    for (const locale of SUPPORTED_LOCALES) {
      const href = locale === 'en' ? 'https://raider-tools.app/quests/' : `https://raider-tools.app/${locale}/quests/`;
      expect(html).toContain(`<link rel="alternate" hreflang="${locale}" href="${href}" />`);
    }
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://raider-tools.app/quests/" />');
  });

  it('gives the home page the site name as title and structured data', () => {
    const html = render('/');
    expect(html).toContain('<title>ARC Raiders Tools</title>');
    expect(html).toContain('<link rel="canonical" href="https://raider-tools.app/" />');
    expect(html).toContain('"@type":"WebSite"');
    expect(render('/', 'ja')).toContain('<link rel="canonical" href="https://raider-tools.app/ja/" />');
  });

  it('makes the version page the entry point of the update', () => {
    const html = render('/whats-new/frozen-trail');
    expect(html).toContain("<title>Frozen Trail: what's new in ARC Raiders 2.0 | ARC Raiders Tools</title>");
    expect(html).toContain('href="https://raider-tools.app/whats-new/frozen-trail/"');
    expect(html).toContain('/images/og/whats-new-frozen-trail.jpg');
  });

  it('points the redirected what-is-new paths to the version page, without alternates', () => {
    for (const path of ['/whats-new', '/whats-new/frozen-trail/new-items']) {
      const html = render(path, 'fr');
      expect(html).toContain('<link rel="canonical" href="https://raider-tools.app/fr/whats-new/frozen-trail/" />');
      expect(html).not.toContain('hreflang');
    }
  });

  it('escapes text in attributes', () => {
    const html = renderPageHtml(INDEX_HTML, page('/'), 'en', () => 'Say "hi" & <bye>');
    expect(html).toContain('content="Say &quot;hi&quot; &amp; &lt;bye&gt;"');
  });

  it('falls back to English and fails on a key missing there', () => {
    expect(createTranslate({ en: { seo: { home: 'Home' } }, de: {} }, 'de')('seo.home')).toBe('Home');
    expect(() => createTranslate({})('seo.home')).toThrow(/seo\.home/);
  });
});

describe('sitemap and robots', () => {
  it('lists the canonical public pages in every language', () => {
    const sitemap = renderSitemap();
    expect(sitemap).toContain('<loc>https://raider-tools.app/</loc>');
    expect(sitemap).toContain('<loc>https://raider-tools.app/de/</loc>');
    expect(sitemap).toContain('<loc>https://raider-tools.app/zh-TW/whats-new/frozen-trail/research/</loc>');
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="ko-KR" href="https://raider-tools.app/ko-KR/maps/"/>');
    expect(sitemap).not.toContain('<loc>https://raider-tools.app/whats-new/</loc>');
    expect(sitemap).not.toContain('new-items');
    expect(sitemap).not.toContain('profile');
    expect(sitemap.match(/<loc>/g)).toHaveLength(SEO_PAGES.filter((p) => !p.canonicalPath).length * SUPPORTED_LOCALES.length);
  });

  it('keeps private pages out in every language and points to the sitemap', () => {
    const robots = renderRobots();
    expect(robots).toContain('Disallow: /profile');
    expect(robots).toContain('Disallow: /pt-BR/auth');
    expect(robots).toContain('Sitemap: https://raider-tools.app/sitemap.xml');
  });

  it('writes nested routes to their own index.html', () => {
    expect(pageOutputFile(page('/'))).toBe('index.html');
    expect(pageOutputFile(page('/'), 'de')).toBe('de/index.html');
    expect(pageOutputFile(page('/whats-new/frozen-trail/outpost'), 'pt-BR')).toBe('pt-BR/whats-new/frozen-trail/outpost/index.html');
  });
});
