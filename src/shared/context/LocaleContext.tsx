import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  detectInitialLocale,
  getIntlLocale,
  getLocaleFallbackChain,
  LOCALE_OPTIONS,
  LOCALE_STORAGE_KEY,
  localePrefix,
  localizePath,
  splitLocalePath,
  type AppLocale,
  type LocaleOption,
} from '../i18n/config';
import { getTranslationValue } from '../i18n/translations';
import { findSeoPage } from '../seo/pages';

interface LocaleContextValue {
  locale: AppLocale;
  /** Router basename: the URL prefix of the locale (`/de`), or '' when the URL has none. */
  basename: string;
  /**
   * Moves the current URL to the prefix of the current locale, for a public page reached without
   * one (e.g. `/` after signing in while German is the chosen language).
   */
  adoptLocalePrefix: () => void;
  localeOptions: LocaleOption[];
  setLocale: (locale: AppLocale) => void;
  t: (key: string) => string;
  tm: (key: string, replacements: Record<string, string | number>) => string;
  formatDate: (value: Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  compareText: (left: string, right: string) => number;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleState {
  locale: AppLocale;
  basename: string;
}

/** Replaces the browser URL (keeping the router's history state) with the app path in a locale. */
function replaceUrlLocale(path: string, locale: AppLocale): void {
  const url = `${localizePath(path, locale)}${window.location.search}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}

/**
 * The locale of the URL prefix (`/de/quests`) wins. Without a prefix the chosen or browser language
 * applies, and a public page moves to that language's prefix, so every public URL shows one language.
 */
function initialLocaleState(): LocaleState {
  if (typeof window === 'undefined') return { locale: DEFAULT_LOCALE, basename: '' };
  const { locale, path, nonCanonical } = splitLocalePath(window.location.pathname);
  if (locale) {
    if (nonCanonical) replaceUrlLocale(path, locale);
    return { locale, basename: localePrefix(locale) };
  }
  if (nonCanonical) replaceUrlLocale(path, DEFAULT_LOCALE);
  const preferred = detectInitialLocale();
  if (preferred !== DEFAULT_LOCALE && findSeoPage(path)) {
    replaceUrlLocale(path, preferred);
    return { locale: preferred, basename: localePrefix(preferred) };
  }
  return { locale: preferred, basename: '' };
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [{ locale, basename }, setState] = useState<LocaleState>(initialLocaleState);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  // Switching the language moves the current page to the new language's URL.
  const setLocale = useCallback((next: AppLocale) => {
    replaceUrlLocale(splitLocalePath(window.location.pathname).path, next);
    setState({ locale: next, basename: localePrefix(next) });
  }, []);

  const adoptLocalePrefix = useCallback(() => {
    setLocale(locale);
  }, [locale, setLocale]);

  const value = useMemo<LocaleContextValue>(() => {
    const fallbackChain = getLocaleFallbackChain(locale);
    const intlLocale = getIntlLocale(locale);

    return {
      locale,
      basename,
      adoptLocalePrefix,
      localeOptions: LOCALE_OPTIONS,
      setLocale,
      t: (key: string) => {
        for (const currentLocale of fallbackChain) {
          const translated = getTranslationValue(currentLocale, key);
          if (translated) {
            return translated;
          }
        }
        return getTranslationValue(DEFAULT_LOCALE, key) ?? key;
      },
      tm: (key, replacements) => {
        let template = '';
        for (const currentLocale of fallbackChain) {
          const translated = getTranslationValue(currentLocale, key);
          if (translated) {
            template = translated;
            break;
          }
        }

        const base = template || getTranslationValue(DEFAULT_LOCALE, key) || key;
        return Object.entries(replacements).reduce(
          (value, [token, replacement]) =>
            value.replaceAll(`{${token}}`, String(replacement)),
          base
        );
      },
      formatDate: (value, options) => new Intl.DateTimeFormat(intlLocale, options).format(value),
      formatNumber: (value, options) => new Intl.NumberFormat(intlLocale, options).format(value),
      compareText: (left, right) => left.localeCompare(right, intlLocale),
    };
  }, [locale, basename, adoptLocalePrefix, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}
