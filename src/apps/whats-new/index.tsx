import { Navigate, useParams } from 'react-router-dom';
import { WhatsNewPage } from './WhatsNewPage';
import { DEFAULT_WHATS_NEW_TAB, parseTab } from './tabConfig';
import { DEFAULT_WHATS_NEW_VERSION, WHATS_NEW_VERSIONS, whatsNewPath, whatsNewVersionOfRelease } from './routing';
import './styles/main.scss';

/**
 * Route: `/updates/:release/details/:tab?` (the guide is the in-depth page of its release). The
 * guide's own page shows the default tab; the default tab's segment or an unknown tab redirect there.
 */
export function WhatsNewApp() {
  const { release, tab } = useParams<{ release?: string; tab?: string }>();
  const known = whatsNewVersionOfRelease(release);
  const knownTab = parseTab(tab);
  if (!known || (tab !== undefined && (!knownTab || knownTab === DEFAULT_WHATS_NEW_TAB))) {
    return <Navigate to={whatsNewPath(known ?? DEFAULT_WHATS_NEW_VERSION)} replace />;
  }
  return <WhatsNewPage version={known} tab={knownTab ?? DEFAULT_WHATS_NEW_TAB} />;
}

/** Former route `/whats-new/:version?/:tab?`: redirects to the guide's page under its release. */
export function LegacyWhatsNewRedirect() {
  const { version, tab } = useParams<{ version?: string; tab?: string }>();
  const known = WHATS_NEW_VERSIONS.find((v) => v === version) ?? DEFAULT_WHATS_NEW_VERSION;
  return <Navigate to={whatsNewPath(known, parseTab(tab) ?? DEFAULT_WHATS_NEW_TAB)} replace />;
}
