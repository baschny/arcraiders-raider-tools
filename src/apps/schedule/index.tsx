import { useEffect, useState } from 'react';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { Schedule } from './components/Schedule';
import { loadMapEventsData } from './utils/dataLoader';
import type { MapEventsData } from './types/mapEvents';
import { useLocale } from '../../shared/context/LocaleContext';
import './styles/main.scss';

// The schedule is updated hourly by the Lambda; poll to stay fresh.
const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export function ScheduleApp() {
  const { t } = useLocale();
  const [data, setData] = useState<MapEventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    loadMapEventsData()
      .then((loadedData) => {
        if (active) {
          setData(loadedData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load map events data:', err);
          setError(err.message);
          setLoading(false);
        }
      });

    const timer = setInterval(() => {
      loadMapEventsData()
        .then((loadedData) => setData(loadedData))
        .catch((err) => console.error('Schedule refetch failed:', err));
    }, REFETCH_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) return <LoadingSpinner message={t('schedule.loading')} />;
  if (error) return <ErrorDisplay message={error} />;
  if (!data) return <ErrorDisplay message={t('schedule.noData')} />;

  return (
    <div className="content-container">
      <Schedule data={data} />
    </div>
  );
}
