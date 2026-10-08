import type { AppLocale } from '../../../shared/i18n/config';
import { getLocaleFallbackChain } from '../../../shared/i18n/config';
import { getTranslationValue } from '../../../shared/i18n/translations';

const KEYS = {
  oneOf: 'quests.objectiveOneOf',
  nOf: 'quests.objectiveNOf',
  oneRound: 'quests.objectiveOneRound',
  optional: 'quests.objectiveOptional',
  sideQuest: 'quests.sideQuestBadge',
  raids: 'quests.requirementRaids',
} as const;

type LabelKey = keyof typeof KEYS;

/** Objective-tree strings from the shared locale files (usable outside React, e.g. in buildQuests). */
export function questLabel(
  key: LabelKey,
  locale: AppLocale,
  params: Record<string, string | number> = {},
): string {
  let text: string | undefined;
  for (const candidate of getLocaleFallbackChain(locale)) {
    text = getTranslationValue(candidate, KEYS[key]);
    if (text) break;
  }
  return (text ?? KEYS[key]).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
