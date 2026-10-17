import { useEffect, useState } from 'react';
import { loadDomain, loadStructure } from '../../../shared/gamedata/loader';
import { loadItemCatalog } from '../../../shared/gamedata/catalog';
import type { AppLocale } from '../../../shared/i18n/config';
import type { Quest } from '../types/quest';
import { buildQuests } from './buildQuests';
import { setMapLocalizations } from './localization';

/**
 * The quests as the Quest Tracker shows them (localized, display-normalized objective trees), loaded for the locale.
 * `enabled` false: nothing is loaded (the maps page loads them only in Quests mode).
 */
export function useQuestCatalog(locale: AppLocale, enabled = true): { quests: Quest[] | null; error: string | null } {
  const [state, setState] = useState<{ locale: string; quests: Quest[] | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([loadDomain('quests', locale), loadDomain('maps', locale), loadItemCatalog(locale), loadStructure('trades')])
      .then(([quests, maps, catalog, trades]) => {
        if (cancelled) return;
        setMapLocalizations(maps);
        const traderNames = Object.fromEntries(Object.values(trades.traders).map((trader) => [trader.id, trader.nameEn]));
        setState({ locale, quests: buildQuests({ quests, maps, catalog, traderNames, locale }), error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ locale, quests: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [locale, enabled]);
  return state && state.locale === locale ? { quests: state.quests, error: state.error } : { quests: null, error: null };
}
