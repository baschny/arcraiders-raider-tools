import { useState, useEffect } from 'react';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { Schedule } from './components/Schedule';
import { loadMapEventsData } from './utils/dataLoader';
import type { MapEventsData } from './types/mapEvents';
import './styles/main.scss';

export function ScheduleApp() {
  const [data, setData] = useState<MapEventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMapEventsData()
      .then((loadedData) => {
        setData(loadedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load map events data:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading event schedule..." />;
  if (error) return <ErrorDisplay message={error} />;
  if (!data) return <ErrorDisplay message="No data available" />;

  return (
    <div className="content-container">
      <Schedule data={data} />
    </div>
  );
}
