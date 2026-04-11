import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  detectInitialLocale,
  getIntlLocale,
  getLocaleFallbackChain,
  LOCALE_OPTIONS,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  type LocaleOption,
} from '../i18n/config';
import { getTranslationValue } from '../i18n/translations';

interface LocaleContextValue {
  locale: AppLocale;
  localeOptions: LocaleOption[];
  setLocale: (locale: AppLocale) => void;
  t: (key: string) => string;
  tm: (key: string, replacements: Record<string, string | number>) => string;
  formatDate: (value: Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  compareText: (left: string, right: string) => number;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(detectInitialLocale);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const fallbackChain = getLocaleFallbackChain(locale);
    const intlLocale = getIntlLocale(locale);

    return {
      locale,
      localeOptions: LOCALE_OPTIONS,
      setLocale: setLocaleState,
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
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}
