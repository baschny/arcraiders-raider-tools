import { useState, useEffect } from 'react';
import { QuestTracker } from './components/QuestTracker';
import type { Quest } from './types/quest';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useLocale } from '../../shared/context/LocaleContext';
import { loadDomain, loadStructure } from '../../shared/gamedata/loader';
import { loadItemCatalog } from '../../shared/gamedata/catalog';
import { setMapLocalizations } from './utils/localization';
import { buildQuests } from './utils/buildQuests';
import { SignInNudge } from '../../shared/components/SignInNudge';
import './styles/main.scss';

export function QuestsApp() {
  const { locale, t } = useLocale();
  const [questData, setQuestData] = useState<Quest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadDomain('quests', locale),
      loadDomain('maps', locale),
      loadItemCatalog(locale),
      loadStructure('trades'),
    ])
      .then(([quests, maps, catalog, trades]) => {
        if (cancelled) return;
        setMapLocalizations(maps);
        const traderNames = Object.fromEntries(
          Object.values(trades.traders).map((trader) => [trader.id, trader.nameEn]),
        );
        setQuestData(buildQuests({ quests, maps, catalog, traderNames, locale }));
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (loading) {
    return <LoadingSpinner message={t('quests.loading')} />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  if (!questData) {
    return <ErrorDisplay message={t('quests.noData')} />;
  }

  return (
    <div className="quest-tracker-wrapper">
      <SignInNudge />
      <QuestTracker quests={questData} />
    </div>
  );
}
