import { Navigate, useParams } from 'react-router-dom';
import { WhatsNewPage } from './WhatsNewPage';
import './styles/main.scss';

/** Versions that have a what's-new page. */
export const WHATS_NEW_VERSIONS = ['frozen-trail'] as const;
export type WhatsNewVersion = (typeof WHATS_NEW_VERSIONS)[number];
export const DEFAULT_WHATS_NEW_VERSION: WhatsNewVersion = 'frozen-trail';

export function WhatsNewApp() {
  const { version } = useParams<{ version?: string }>();
  const known = WHATS_NEW_VERSIONS.find((v) => v === version);
  if (!known) {
    return <Navigate to={`/whats-new/${DEFAULT_WHATS_NEW_VERSION}`} replace />;
  }
  return <WhatsNewPage version={known} />;
}
