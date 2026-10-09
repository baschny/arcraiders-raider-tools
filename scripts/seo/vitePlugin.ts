import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { SUPPORTED_LOCALES } from '../../src/shared/i18n/localeCodes';
import { SEO_PAGES } from '../../src/shared/seo/pages';
import {
  createTranslate,
  pageOutputFile,
  renderPageHtml,
  renderRobots,
  renderSitemap,
  type Dictionaries,
} from './render';

/**
 * Writes a pre-rendered `index.html` with its own title, description, canonical URL, language
 * alternates and link preview tags for every public page in every language (`/quests/`,
 * `/de/quests/`, ...), plus `sitemap.xml` and `robots.txt`.
 *
 * The host answers `/quests` with a redirect to `/quests/` and serves `quests/index.html` there,
 * so each public route gets a real 200 response instead of the not-found fallback.
 */
export function seoPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'raider-tools-seo',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
      const dictionaries: Dictionaries = Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [
          locale,
          JSON.parse(readFileSync(resolve(config.root, `src/shared/i18n/locales/${locale}.json`), 'utf8')),
        ]),
      );

      for (const locale of SUPPORTED_LOCALES) {
        const t = createTranslate(dictionaries, locale);
        for (const page of SEO_PAGES) {
          const file = join(outDir, pageOutputFile(page, locale));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, renderPageHtml(indexHtml, page, locale, t));
        }
      }
      writeFileSync(join(outDir, 'sitemap.xml'), renderSitemap());
      writeFileSync(join(outDir, 'robots.txt'), renderRobots());
    },
  };
}
