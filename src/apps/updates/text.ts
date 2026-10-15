// Text helpers of the update pages: localized record names, field labels, dates.
import { useLocale } from '../../shared/context/LocaleContext';
import type { LocalizedText, UpdateChange } from './types';

/** Translation keys of field paths; other fields show their path (this is a technical log). */
const FIELD_KEYS: Record<string, string> = {
  value: 'updates.fields.value',
  'recycle.items': 'updates.fields.recycle',
  'scrap.items': 'updates.fields.scrap',
  'repair.cost': 'updates.fields.repairCost',
  'repair.durability': 'updates.fields.repairDurability',
  maxStack: 'updates.fields.maxStack',
  weightKg: 'updates.fields.weight',
  rarity: 'updates.fields.rarity',
  'cost.items': 'updates.fields.cost',
  'rewards.items': 'updates.fields.rewards',
  requires: 'updates.fields.requires',
  'limit.max': 'updates.fields.limit',
  'limit.refreshSeconds': 'updates.fields.limitRefresh',
  'rewards.accept.items': 'updates.fields.acceptRewards',
  'rewards.complete.items': 'updates.fields.completeRewards',
  'rewards.optionals.items': 'updates.fields.optionalRewards',
  mapIds: 'updates.fields.maps',
  budgets: 'updates.fields.budget',
  scenarios: 'updates.fields.scenario',
  objective: 'updates.fields.objective',
  'objective.amount': 'updates.fields.objectiveAmount',
  'levels.reward.items': 'updates.fields.levelRewards',
};

export function useText() {
  const { t, locale } = useLocale();
  const text = (v: LocalizedText | undefined | null) => (v ? v[locale] || v.en : '');
  const format = (key: string, params: Record<string, string | number>) =>
    Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key));
  return { t, locale, text, format };
}

/** Fields whose numbers are fractions shown as percent. */
export const PERCENT_FIELDS = new Set(['repair.durability']);

export function fieldLabel(change: UpdateChange, t: (key: string) => string): string {
  const key = FIELD_KEYS[change.field];
  const label = key ? t(key) : change.field;
  return change.key ? `${label} (${change.key})` : label;
}

export function formatDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}
