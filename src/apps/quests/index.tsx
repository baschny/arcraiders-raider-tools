import { useState, useEffect } from 'react';
import { QuestTracker } from './components/QuestTracker';
import type { LocalizedQuest, Quest } from './types/quest';
import { MAP_NODES } from './data/static-data';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useLocale } from '../../shared/context/LocaleContext';
import { fetchLocalizedJson } from '../../shared/utils/localizedContent';
import './styles/main.scss';

export function QuestsApp() {
  const { locale, t } = useLocale();
  const [questData, setQuestData] = useState<Quest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLocalizedJson<LocalizedQuest[]>('/data/quests/quest-data.json', locale)
      .then((data) => {
        const localizedQuests: Quest[] = data.map((quest) => ({
          ...quest,
          name: quest.name.value,
          originalNameEn: quest.name.originalEn,
          blueprintRewards: quest.blueprintRewards.map((reward) => ({
            ...reward,
            name: reward.name.value,
            originalNameEn: reward.name.originalEn,
          })),
        }));
        // Combine MAP_NODES with loaded quest data
        const allQuests = [...MAP_NODES, ...localizedQuests];
        setQuestData(allQuests);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
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
      <QuestTracker quests={questData} />
    </div>
  );
}
