// Locale codes and their URL prefixes. Kept free of DOM types so the build's SEO plugin can import them.

export const SUPPORTED_LOCALES = [
  'en',
  'de',
  'pt-BR',
  'es',
  'fr',
  'it',
  'ja',
  'ko-KR',
  'pl',
  'ru',
  'tr',
  'zh-CN',
  'zh-TW',
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

export function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function getIntlLocale(locale: AppLocale): string {
  switch (locale) {
    case 'pt-BR':
      return 'pt-BR';
    case 'de':
      return 'de-DE';
    case 'es':
      return 'es-ES';
    case 'fr':
      return 'fr-FR';
    case 'it':
      return 'it-IT';
    case 'ja':
      return 'ja-JP';
    case 'ko-KR':
      return 'ko-KR';
    case 'pl':
      return 'pl-PL';
    case 'ru':
      return 'ru-RU';
    case 'tr':
      return 'tr-TR';
    case 'zh-CN':
      return 'zh-CN';
    case 'zh-TW':
      return 'zh-TW';
    default:
      return 'en-US';
  }
}

/** URL path prefix of a locale: `/de`, `/pt-BR`; English pages have none. */
export function localePrefix(locale: AppLocale): string {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

/** An app path (`/quests`, `/`) in a locale: `/de/quests`, `/de`. */
export function localizePath(path: string, locale: AppLocale): string {
  const prefix = localePrefix(locale);
  if (!prefix) return path;
  return path === '/' ? prefix : `${prefix}${path}`;
}

export interface LocalePath {
  /** Locale of the URL prefix, or null when the path has none. */
  locale: AppLocale | null;
  /** The path without the prefix, starting with `/`. */
  path: string;
  /** Whether the prefix is not written the canonical way (`/pt-br`, or `/en` which has no prefix). */
  nonCanonical: boolean;
}

/** Splits a URL path into its locale prefix (case-insensitive) and the app path. */
export function splitLocalePath(pathname: string): LocalePath {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const segment = match?.[1];
  const locale = segment && SUPPORTED_LOCALES.find((code) => code.toLowerCase() === segment.toLowerCase());
  if (!match || !locale) return { locale: null, path: pathname || '/', nonCanonical: false };
  const path = match[2] || '/';
  if (locale === DEFAULT_LOCALE) return { locale: null, path, nonCanonical: true };
  return { locale, path, nonCanonical: segment !== locale };
}
