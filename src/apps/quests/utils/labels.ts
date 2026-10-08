import type { AppLocale } from '../../../shared/i18n/config';
import { getLocaleCandidates } from '../../../shared/i18n/config';

type LabelKey = 'oneOf' | 'nOf' | 'oneRound' | 'optional' | 'sideQuest' | 'raids';

const LABELS: Record<string, Partial<Record<LabelKey, string>>> = {
  en: {
    oneOf: 'One of',
    nOf: '{count} of',
    oneRound: 'One round',
    optional: 'Optional',
    sideQuest: 'Side quest',
    raids: '{count} raids',
  },
  de: {
    oneOf: 'Eines von',
    nOf: '{count} von',
    oneRound: 'Eine Runde',
    optional: 'Optional',
    sideQuest: 'Nebenquest',
    raids: '{count} Raids',
  },
};

/** Small app-local strings for the objective tree (en fallback). */
export function questLabel(
  key: LabelKey,
  locale: AppLocale,
  params: Record<string, string | number> = {},
): string {
  let text: string | undefined;
  for (const candidate of getLocaleCandidates(locale)) {
    text = LABELS[candidate]?.[key];
    if (text) break;
  }
  text ??= LABELS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
