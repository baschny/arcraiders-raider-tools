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
export const LOCALE_STORAGE_KEY = 'raider-tools-locale';

export interface LocaleOption {
  code: AppLocale;
  label: string;
  nativeLabel: string;
  flag: string;
  upstreamKeys: string[];
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇺🇸', upstreamKeys: ['en'] },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪', upstreamKeys: ['de', 'en'] },
  {
    code: 'pt-BR',
    label: 'Portuguese (Brazil)',
    nativeLabel: 'Português (Brasil)',
    flag: '🇧🇷',
    upstreamKeys: ['pt-BR', 'pt', 'en'],
  },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸', upstreamKeys: ['es', 'en'] },
  { code: 'fr', label: 'French', nativeLabel: 'Français', flag: '🇫🇷', upstreamKeys: ['fr', 'en'] },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', flag: '🇮🇹', upstreamKeys: ['it', 'en'] },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵', upstreamKeys: ['ja', 'en'] },
  { code: 'ko-KR', label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷', upstreamKeys: ['ko-KR', 'ko', 'kr', 'en'] },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', flag: '🇵🇱', upstreamKeys: ['pl', 'en'] },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', flag: '🇷🇺', upstreamKeys: ['ru', 'en'] },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', flag: '🇹🇷', upstreamKeys: ['tr', 'en'] },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文', flag: '🇨🇳', upstreamKeys: ['zh-CN', 'en'] },
  { code: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文', flag: '🇹🇼', upstreamKeys: ['zh-TW', 'en'] },
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

    if (language.startsWith('es')) {
      return 'es';
    }

    if (language.startsWith('fr')) {
      return 'fr';
    }

    if (language.startsWith('it')) {
      return 'it';
    }

    if (language.startsWith('ja')) {
      return 'ja';
    }

    if (language.startsWith('ko')) {
      return 'ko-KR';
    }

    if (language.startsWith('pl')) {
      return 'pl';
    }

    if (language.startsWith('ru')) {
      return 'ru';
    }

    if (language.startsWith('tr')) {
      return 'tr';
    }

    if (language.toLowerCase().startsWith('zh-tw') || language.toLowerCase().startsWith('zh-hk')) {
      return 'zh-TW';
    }

    if (language.startsWith('zh')) {
      return 'zh-CN';
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
