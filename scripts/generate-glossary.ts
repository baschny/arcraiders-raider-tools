/**
 * Generates the ARC Raiders glossary from the game's own localization, so site texts use the game's
 * official wording in every language.
 *
 * Input:  scripts/glossary/terms.ts (hand-kept term list) and
 *         EMBARK_API_DIR/data-game-extract/current/localization/PioneerGame/Content/Localization/Game/<locale>/Game.json
 * Output: src/shared/i18n/glossary.json (used by getGlossaryTerm and by translators),
 *         docs/i18n/glossary.md (review table) and docs/i18n/glossary.csv (all languages).
 *
 * Reports terms whose game text is missing or whose English changed, and game texts with the same
 * English wording that are translated differently elsewhere in the game (listed as variants).
 */
import * as fs from 'fs';
import * as path from 'path';
import { EMBARK_API_DIR } from './gamedata/arcData';
import { SUPPORTED_LOCALES, type AppLocale } from '../src/shared/i18n/config';
import { GLOSSARY_TERMS } from './glossary/terms';

const repoRoot = path.resolve(import.meta.dirname, '..');
const EXTRACT = path.join(EMBARK_API_DIR, 'data-game-extract', 'current');
const LOC_DIR = path.join(EXTRACT, 'localization', 'PioneerGame', 'Content', 'Localization', 'Game');
const OUT_JSON = path.join(repoRoot, 'src', 'shared', 'i18n', 'glossary.json');
const OUT_DOCS = path.join(repoRoot, 'docs', 'i18n');

/** Site locale to the game's localization folder. */
const GAME_LOCALE: Record<AppLocale, string> = {
  en: 'en', de: 'de', 'pt-BR': 'pt-BR', es: 'es', fr: 'fr', it: 'it', ja: 'ja', 'ko-KR': 'ko-KR',
  pl: 'pl', ru: 'ru', tr: 'tr', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant',
};
/** Locales shown in the Markdown review table (the others are in the CSV). */
const REVIEW_LOCALES: AppLocale[] = ['en', 'de', 'pt-BR'];

type StringTables = Record<string, Record<string, unknown>>;

export interface GlossaryTerm {
  /** The term per locale (always complete for en). */
  text: Partial<Record<AppLocale, string>>;
  /** "game:<table>/<key>" or "manual". */
  source: string;
  notes?: string;
  /** Other translations the game uses for the same English text, per locale. */
  variants?: Partial<Record<AppLocale, string[]>>;
}

export interface GlossaryFile {
  /** Game version folder the translations were taken from. */
  gameVersion: string;
  terms: Record<string, GlossaryTerm>;
}

const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function loadTables(): Record<AppLocale, StringTables> {
  const out = {} as Record<AppLocale, StringTables>;
  for (const locale of SUPPORTED_LOCALES) {
    const file = path.join(LOC_DIR, GAME_LOCALE[locale], 'Game.json');
    if (!fs.existsSync(file)) throw new Error(`Missing game localization: ${file}`);
    out[locale] = JSON.parse(fs.readFileSync(file, 'utf8')) as StringTables;
  }
  return out;
}

function lookup(tables: StringTables, ref: string): string | undefined {
  const [table, key] = ref.split('/');
  const value = tables[table]?.[key];
  return typeof value === 'string' && value.trim() ? clean(value) : undefined;
}

/** English game text (lower case) to every "<table>/<key>" carrying it. */
function englishIndex(en: StringTables): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [table, entries] of Object.entries(en)) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue;
      const norm = clean(value).toLowerCase();
      index.set(norm, [...(index.get(norm) ?? []), `${table}/${key}`]);
    }
  }
  return index;
}

const csvCell = (s = '') => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const mdCell = (s = '') => s.replace(/\|/g, '\\|');

function main(): void {
  const gameVersion = path.basename(fs.realpathSync(EXTRACT));
  const tables = loadTables();
  const index = englishIndex(tables.en);
  const warnings: string[] = [];
  const terms: Record<string, GlossaryTerm> = {};

  for (const source of GLOSSARY_TERMS) {
    if (terms[source.id]) throw new Error(`Duplicate glossary term id: ${source.id}`);
    const text: Partial<Record<AppLocale, string>> = {};
    const variants: Partial<Record<AppLocale, string[]>> = {};
    if (source.game) {
      const gameEn = lookup(tables.en, source.game);
      if (!gameEn) warnings.push(`${source.id}: game text ${source.game} not found`);
      else if (gameEn.toLowerCase() !== source.en.toLowerCase())
        warnings.push(`${source.id}: game English is now "${gameEn}" (term says "${source.en}")`);
      const sameEnglish = (gameEn && index.get(gameEn.toLowerCase())) || [];
      for (const locale of SUPPORTED_LOCALES) {
        const value = lookup(tables[locale], source.game);
        if (value) text[locale] = value;
        const others = new Set(
          sameEnglish
            .filter((ref) => ref !== source.game)
            .map((ref) => lookup(tables[locale], ref))
            .filter((v): v is string => !!v && v.toLowerCase() !== value?.toLowerCase()),
        );
        if (others.size) variants[locale] = [...others];
      }
    }
    text.en = source.en;
    Object.assign(text, source.manual);
    const missing = SUPPORTED_LOCALES.filter((l) => !text[l]);
    if (source.game && missing.length) warnings.push(`${source.id}: no translation for ${missing.join(', ')}`);
    terms[source.id] = {
      text,
      source: source.game ? `game:${source.game}` : 'manual',
      ...(source.notes ? { notes: source.notes } : {}),
      ...(Object.keys(variants).length ? { variants } : {}),
    };
  }

  const file: GlossaryFile = { gameVersion, terms };
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(file, null, 2)}\n`);

  fs.mkdirSync(OUT_DOCS, { recursive: true });
  const csv = [
    ['id', ...SUPPORTED_LOCALES, 'source', 'notes'].join(','),
    ...Object.entries(terms).map(([id, t]) =>
      [id, ...SUPPORTED_LOCALES.map((l) => t.text[l]), t.source, t.notes].map(csvCell).join(','),
    ),
  ];
  fs.writeFileSync(path.join(OUT_DOCS, 'glossary.csv'), `${csv.join('\n')}\n`);

  const md = [
    '# ARC Raiders glossary',
    '',
    `Generated by \`npm run generate:glossary\` from the game's localization (${gameVersion}); edit`,
    '`scripts/glossary/terms.ts`, not this file. All 13 languages are in `glossary.csv` and',
    '`src/shared/i18n/glossary.json`. "Also in game" lists other wordings the game uses for the same',
    'English text.',
    '',
    `| Term | ${REVIEW_LOCALES.filter((l) => l !== 'en').join(' | ')} | Also in game | Notes |`,
    `| --- | ${REVIEW_LOCALES.filter((l) => l !== 'en').map(() => '---').join(' | ')} | --- | --- |`,
    ...Object.values(terms).map((t) => {
      const also = REVIEW_LOCALES.filter((l) => t.variants?.[l]?.length)
        .map((l) => `${l}: ${t.variants![l]!.join(', ')}`)
        .join('; ');
      const cells = REVIEW_LOCALES.filter((l) => l !== 'en').map((l) => mdCell(t.text[l]));
      return `| ${mdCell(t.text.en)} | ${cells.join(' | ')} | ${mdCell(also)} | ${mdCell(t.notes)}${t.source === 'manual' ? ' (manual)' : ''} |`;
    }),
    '',
  ];
  fs.writeFileSync(path.join(OUT_DOCS, 'glossary.md'), md.join('\n'));

  console.log(`Glossary: ${Object.keys(terms).length} terms from ${gameVersion}`);
  for (const w of warnings) console.warn(`  warning: ${w}`);
}

main();
