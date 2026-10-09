import { Navigate, useParams } from 'react-router-dom';
import { WhatsNewPage } from './WhatsNewPage';
import { DEFAULT_WHATS_NEW_TAB, parseTab } from './tabConfig';
import { DEFAULT_WHATS_NEW_VERSION, WHATS_NEW_VERSIONS } from './routing';
import './styles/main.scss';

/** Route: `/whats-new/:version?/:tab?`. Unknown version or tab redirects to the default. */
export function WhatsNewApp() {
  const { version, tab } = useParams<{ version?: string; tab?: string }>();
  const known = WHATS_NEW_VERSIONS.find((v) => v === version);
  const knownTab = parseTab(tab);
  if (!known || (tab !== undefined && !knownTab)) {
    return <Navigate to={`/whats-new/${known ?? DEFAULT_WHATS_NEW_VERSION}/${DEFAULT_WHATS_NEW_TAB}`} replace />;
  }
  return <WhatsNewPage version={known} tab={knownTab ?? DEFAULT_WHATS_NEW_TAB} />;
}
