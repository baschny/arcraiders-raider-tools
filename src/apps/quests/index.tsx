import { useState, useEffect } from 'react';
import { QuestTracker } from './components/QuestTracker';
import type { Quest } from './types/quest';
import { MAP_NODES } from './data/static-data';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import './styles/main.scss';

export function QuestsApp() {
  const [questData, setQuestData] = useState<Quest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/quests/quest-data.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load quest data');
        }
        return response.json();
      })
      .then((data: Quest[]) => {
        // Combine MAP_NODES with loaded quest data
        const allQuests = [...MAP_NODES, ...data];
        setQuestData(allQuests);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading quest data..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  if (!questData) {
    return <ErrorDisplay message="No quest data available" />;
  }

  return (
    <div className="quest-tracker-wrapper">
      <QuestTracker quests={questData} />
    </div>
  );
}
