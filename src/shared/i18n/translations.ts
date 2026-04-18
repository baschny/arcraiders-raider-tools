import type { AppLocale } from './config';

import en from './locales/en.json';
import de from './locales/de.json';
import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import koKR from './locales/ko-KR.json';
import pl from './locales/pl.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';

type TranslationValue = string | TranslationDictionary;

export interface TranslationDictionary {
  [key: string]: TranslationValue;
}

export const translations: Partial<Record<AppLocale, TranslationDictionary>> = {
  en,
  de,
  'pt-BR': ptBR,
  es,
  fr,
  it,
  ja,
  'ko-KR': koKR,
  pl,
  ru,
  tr,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

export function getTranslationValue(locale: AppLocale, key: string): string | undefined {
  const parts = key.split('.');
  let current: TranslationValue | undefined = translations[locale];

  for (const part of parts) {
    if (!current || typeof current === 'string') {
      return undefined;
    }
    current = current[part];
  }

  return typeof current === 'string' ? current : undefined;
}
