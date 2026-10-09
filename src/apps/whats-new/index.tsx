import { Navigate, useParams } from 'react-router-dom';
import { WhatsNewPage } from './WhatsNewPage';
import { DEFAULT_WHATS_NEW_TAB, parseTab } from './tabConfig';
import { DEFAULT_WHATS_NEW_VERSION, WHATS_NEW_VERSIONS, whatsNewPath } from './routing';
import './styles/main.scss';

/**
 * Route: `/whats-new/:version?/:tab?`. The version's own page shows the default tab; the default
 * tab's segment, an unknown version or an unknown tab redirect there.
 */
export function WhatsNewApp() {
  const { version, tab } = useParams<{ version?: string; tab?: string }>();
  const known = WHATS_NEW_VERSIONS.find((v) => v === version);
  const knownTab = parseTab(tab);
  if (!known || (tab !== undefined && (!knownTab || knownTab === DEFAULT_WHATS_NEW_TAB))) {
    return <Navigate to={whatsNewPath(known ?? DEFAULT_WHATS_NEW_VERSION)} replace />;
  }
  return <WhatsNewPage version={known} tab={knownTab ?? DEFAULT_WHATS_NEW_TAB} />;
}
