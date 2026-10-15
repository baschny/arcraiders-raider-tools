import { Navigate, useParams } from 'react-router-dom';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useLocale } from '../../shared/context/LocaleContext';
import { useUpdatesIndex } from './hooks/useUpdates';
import { UpdatePage } from './UpdatePage';
import { UpdatesListPage } from './UpdatesListPage';
import { UPDATES_PATH, updatePath } from './routing';
import './styles/main.scss';

/**
 * Route: `/updates/:id?` (id = release slug). Without it the list of updates; a release's bare date
 * redirects to its slug, an unknown id to the list.
 */
export function UpdatesApp() {
  const { id } = useParams<{ id?: string }>();
  const { t } = useLocale();
  const { data, loading, error } = useUpdatesIndex();
  if (loading) return <LoadingSpinner message={t('updates.loading')} />;
  if (error || !data) return <ErrorDisplay message={error ?? t('shared.errorPrefix')} />;
  if (!id) return <UpdatesListPage releases={data.releases} />;
  const summary = data.releases.find((r) => r.slug === id) ?? data.releases.find((r) => r.id === id);
  if (!summary) return <Navigate to={UPDATES_PATH} replace />;
  // The bare date of a release with slug words redirects to its full URL.
  if (summary.slug !== id) return <Navigate to={updatePath(summary.slug)} replace />;
  return <UpdatePage key={id} summary={summary} />;
}
