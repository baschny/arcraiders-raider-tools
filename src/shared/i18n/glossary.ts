import type { AppLocale } from './config';
import glossary from './glossary.json';

/**
 * ARC Raiders terminology in every site language, taken from the game's own localization.
 * Generated into glossary.json by `npm run generate:glossary` from scripts/glossary/terms.ts;
 * the review table is docs/i18n/glossary.md. Translators: use these terms instead of inventing new ones.
 */
export interface GlossaryEntry {
  /** The term per locale (en is always present). */
  text: Partial<Record<AppLocale, string>>;
  /** "game:<string table>/<key>" or "manual". */
  source: string;
  notes?: string;
  /** Other translations the game uses for the same English text. */
  variants?: Partial<Record<AppLocale, string[]>>;
}

export const GLOSSARY_GAME_VERSION: string = glossary.gameVersion;

export const DOMAIN_GLOSSARY: Record<string, GlossaryEntry> = glossary.terms;

export function getGlossaryTerm(key: string, locale: AppLocale): string {
  const entry = DOMAIN_GLOSSARY[key];
  if (!entry) throw new Error(`Unknown glossary term: ${key}`);
  return entry.text[locale] ?? entry.text.en ?? key;
}
