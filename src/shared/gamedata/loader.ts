import type { AppLocale } from '../i18n/config';
import {
  GAME_DATA_SCHEMA_VERSION,
  type DomainFile,
  type GameDomain,
  type LoadedDomain,
  type TextEntry,
  type TextFile,
} from './types';

/** Base URL of the v2 game data files (public/data/game/). */
export const GAME_DATA_BASE = '/data/game';

const structureCache = new Map<GameDomain, Promise<unknown>>();
const textCache = new Map<string, Promise<TextFile>>();

export class GameDataSchemaError extends Error {
  constructor(domain: GameDomain, found: unknown) {
    super(`game data ${domain}: schemaVersion ${String(found)} != ${GAME_DATA_SCHEMA_VERSION}`);
    this.name = 'GameDataSchemaError';
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function structureUrl(domain: GameDomain): string {
  return `${GAME_DATA_BASE}/${domain}.json`;
}

export function textUrl(domain: GameDomain, locale: string): string {
  return `${GAME_DATA_BASE}/${domain}.text.${locale}.json`;
}

/** Locale-independent structure of a domain; fetched once and shared across locale switches. */
export function loadStructure<D extends GameDomain>(domain: D): Promise<DomainFile<D>> {
  let pending = structureCache.get(domain) as Promise<DomainFile<D>> | undefined;
  if (!pending) {
    pending = fetchJson<DomainFile<D>>(structureUrl(domain)).then((file) => {
      if (file.schemaVersion !== GAME_DATA_SCHEMA_VERSION) {
        throw new GameDataSchemaError(domain, file.schemaVersion);
      }
      return file;
    });
    pending.catch(() => structureCache.delete(domain));
    structureCache.set(domain, pending);
  }
  return pending;
}

/**
 * Text of a domain for a locale. Text files exist for every site locale and already carry the
 * English fallback for missing strings, so the only fallback here is `en` when a file is missing.
 */
export function loadText(domain: GameDomain, locale: AppLocale | string): Promise<TextFile> {
  const key = `${domain}:${locale}`;
  let pending = textCache.get(key);
  if (!pending) {
    pending = fetchJson<TextFile>(textUrl(domain, locale)).catch((error: unknown) => {
      if (locale === 'en') throw error;
      return loadText(domain, 'en');
    });
    pending.catch(() => textCache.delete(key));
    textCache.set(key, pending);
  }
  return pending;
}

/** Structure + text of a domain. Domains without own text return an empty text map. */
export async function loadDomain<D extends GameDomain>(
  domain: D,
  locale: AppLocale | string,
): Promise<LoadedDomain<D>> {
  // Fetch in parallel, but report structure errors (e.g. schema mismatch) first.
  const structurePending = loadStructure(domain);
  const textPending = DOMAINS_WITHOUT_TEXT.has(domain)
    ? Promise.resolve({} as TextFile)
    : loadText(domain, locale);
  textPending.catch(() => undefined);
  const structure = await structurePending;
  const text = await textPending;
  return { structure, text, locale };
}

/** Domains whose display text comes from `items` (spec-site.md "Files" table). */
export const DOMAINS_WITHOUT_TEXT: ReadonlySet<GameDomain> = new Set<GameDomain>([
  'recipes',
  'blueprints',
  'amplification',
]);

/** Resolves a possibly renamed slug (persisted state, old URLs) to the current slug. */
export function resolveSlug(file: { aliases?: Record<string, string> }, slug: string): string {
  return file.aliases?.[slug] ?? slug;
}

export function textOf(loaded: { text: TextFile }, slug: string): TextEntry | undefined {
  return loaded.text[slug];
}

/** Localized name with the structure's English name as fallback. */
export function nameOf(
  loaded: { text: TextFile },
  slug: string,
  fallbackEn?: string,
): string {
  const name = loaded.text[slug]?.name;
  return typeof name === 'string' && name ? name : (fallbackEn ?? slug);
}

/** Test helper: forget cached files. */
export function resetGameDataCache(): void {
  structureCache.clear();
  textCache.clear();
}
