export const SUPPORTED_LOCALES = ['en', 'de', 'pt-BR'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_STORAGE_KEY = 'raider-tools-locale';

export interface LocaleOption {
  code: AppLocale;
  label: string;
  nativeLabel: string;
  upstreamKeys: string[];
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', upstreamKeys: ['en'] },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', upstreamKeys: ['de', 'en'] },
  {
    code: 'pt-BR',
    label: 'Portuguese (Brazil)',
    nativeLabel: 'Português (Brasil)',
    upstreamKeys: ['pt-BR', 'pt', 'en'],
  },
];

export function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function getLocaleOption(locale: AppLocale): LocaleOption {
  return LOCALE_OPTIONS.find((option) => option.code === locale) ?? LOCALE_OPTIONS[0];
}

export function getLocaleFallbackChain(locale: AppLocale): AppLocale[] {
  return locale === 'en' ? ['en'] : [locale, 'en'];
}

export function getLocaleCandidates(locale: AppLocale): string[] {
  return getLocaleOption(locale).upstreamKeys;
}

export function getIntlLocale(locale: AppLocale): string {
  switch (locale) {
    case 'pt-BR':
      return 'pt-BR';
    case 'de':
      return 'de-DE';
    default:
      return 'en-US';
  }
}

export function detectInitialLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && isSupportedLocale(stored)) {
    return stored;
  }

  const browserLanguages = navigator.languages ?? [navigator.language];
  for (const language of browserLanguages) {
    if (!language) {
      continue;
    }

    if (isSupportedLocale(language)) {
      return language;
    }

    if (language.startsWith('pt')) {
      return 'pt-BR';
    }

    if (language.startsWith('de')) {
      return 'de';
    }

    if (language.startsWith('en')) {
      return 'en';
    }
  }

  return DEFAULT_LOCALE;
}

export function localizeDataPath(path: string, locale: string): string {
  return path.replace(/\.json$/, `.${locale}.json`);
}
