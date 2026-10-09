import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEO_PAGES, findSeoPage } from '../../../src/shared/seo/pages';
import { createTranslate, pageOutputFile, renderPageHtml, renderRobots, renderSitemap } from '../render';

const root = resolve(__dirname, '../../..');
const en = JSON.parse(readFileSync(resolve(root, 'src/shared/i18n/locales/en.json'), 'utf8')) as Record<string, unknown>;
const t = createTranslate(en);
const INDEX_HTML = '<html><head>\n    <title>ARC Raiders Tools</title>\n</head><body></body></html>';

function page(path: string) {
  const found = findSeoPage(path);
  if (!found) throw new Error(`no page ${path}`);
  return found;
}

describe('SEO pages', () => {
  it('have a title, description and preview image for every page', () => {
    for (const seoPage of SEO_PAGES) {
      if (seoPage.titleKey) expect(() => t(seoPage.titleKey!)).not.toThrow();
      expect(t(seoPage.descriptionKey).length).toBeLessThanOrEqual(165);
      expect(existsSync(resolve(root, 'public/images/og', seoPage.image)), seoPage.image).toBe(true);
    }
  });

  it('finds pages with and without trailing slash', () => {
    expect(findSeoPage('/quests/')?.path).toBe('/quests');
    expect(findSeoPage('/profile')).toBeUndefined();
  });
});

describe('renderPageHtml', () => {
  it('puts the page tags in place of the title', () => {
    const html = renderPageHtml(INDEX_HTML, page('/quests'), t);
    expect(html).toContain('<title>Quest Tracker | ARC Raiders Tools</title>');
    expect(html).toContain('<link rel="canonical" href="https://raider-tools.app/quests/" />');
    expect(html).toContain('<meta property="og:image" content="https://raider-tools.app/images/og/quests.jpg" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('application/ld+json');
  });

  it('gives the home page the site name as title and structured data', () => {
    const html = renderPageHtml(INDEX_HTML, page('/'), t);
    expect(html).toContain('<title>ARC Raiders Tools</title>');
    expect(html).toContain('<link rel="canonical" href="https://raider-tools.app/" />');
    expect(html).toContain('"@type":"WebSite"');
  });

  it('points the bare what-is-new paths to the default tab', () => {
    const html = renderPageHtml(INDEX_HTML, page('/whats-new'), t);
    expect(html).toContain('href="https://raider-tools.app/whats-new/frozen-trail/new-items/"');
  });

  it('escapes text in attributes', () => {
    const html = renderPageHtml(INDEX_HTML, page('/'), () => 'Say "hi" & <bye>');
    expect(html).toContain('content="Say &quot;hi&quot; &amp; &lt;bye&gt;"');
  });

  it('fails on a missing translation', () => {
    expect(() => createTranslate({})('seo.home')).toThrow(/seo\.home/);
  });
});

describe('sitemap and robots', () => {
  it('lists the canonical public pages only', () => {
    const sitemap = renderSitemap();
    expect(sitemap).toContain('<loc>https://raider-tools.app/</loc>');
    expect(sitemap).toContain('<loc>https://raider-tools.app/whats-new/frozen-trail/research/</loc>');
    expect(sitemap).not.toContain('<loc>https://raider-tools.app/whats-new/</loc>');
    expect(sitemap).not.toContain('profile');
  });

  it('keeps private pages out and points to the sitemap', () => {
    const robots = renderRobots();
    expect(robots).toContain('Disallow: /profile');
    expect(robots).toContain('Sitemap: https://raider-tools.app/sitemap.xml');
  });

  it('writes nested routes to their own index.html', () => {
    expect(pageOutputFile(page('/'))).toBe('index.html');
    expect(pageOutputFile(page('/whats-new/frozen-trail/outpost'))).toBe('whats-new/frozen-trail/outpost/index.html');
  });
});
