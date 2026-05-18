/**
 * Profile Page
 *
 * Multi-section profile scaffold with its own left sidebar. The first
 * section is ArcTracker Integration; new sections (e.g. notifications,
 * linked accounts) can be added by registering a NavLink and a nested
 * route below.
 *
 * Rendered at `/profile/*`. If no sub-section is active, we redirect to
 * the ArcTracker section so the page is never empty.
 */

import { NavLink, Outlet } from 'react-router-dom';
import { KeyRound, Link2, Loader2, LogIn, UserCircle } from 'lucide-react';
import { useLocale } from '../shared/context/LocaleContext';
import { useCognitoAuth } from '../shared/context/CognitoAuthContext';
import '../shared/styles/_profile.scss';
import '../shared/styles/_settings.scss';

interface ProfileSection {
  path: string;
  labelKey: string;
  icon: typeof Link2;
}

const SECTIONS: ProfileSection[] = [
  { path: 'arctracker', labelKey: 'pages.profile.sections.arctracker', icon: Link2 },
  { path: 'embark', labelKey: 'pages.profile.sections.embark', icon: KeyRound },
];

export function Profile() {
  const { t } = useLocale();
  const cognito = useCognitoAuth();

  // While Cognito is still resolving the cached session, show a spinner
  // instead of flashing the "not signed in" state.
  if (cognito.initializing) {
    return (
      <div className="content-container">
        <div className="profile-loading">
          <Loader2 size={32} className="spin" />
        </div>
      </div>
    );
  }

  // ArcTracker linking requires a Raider Tools account because the user's
  // ArcTracker token is stored encrypted server-side.
  if (!cognito.user) {
    return (
      <div className="content-container">
        <div className="profile-signed-out">
          <UserCircle size={40} />
          <h2>{t('pages.profile.title')}</h2>
          <p>{t('shared.userMenu.confirmSignOutBody')}</p>
          {cognito.available && (
            <NavLink to="/auth/sign-in" className="settings-button settings-button--primary">
              <LogIn size={16} />
              <span>{t('shared.userMenu.login')}</span>
            </NavLink>
          )}
        </div>
      </div>
    );
  }

  const identityLabel =
    cognito.user?.email ?? cognito.user?.sub ?? null;

  return (
    <div className="profile-page">
      <aside className="profile-sidebar">
        <div className="profile-sidebar__header">
          <UserCircle size={20} />
          <div className="profile-sidebar__identity">
            <span className="profile-sidebar__title">{t('pages.profile.title')}</span>
            {identityLabel && (
              <span className="profile-sidebar__identity-value">{identityLabel}</span>
            )}
          </div>
        </div>
        <nav className="profile-sidebar__nav">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              className={({ isActive }) =>
                `profile-sidebar__link${isActive ? ' profile-sidebar__link--active' : ''}`
              }
            >
              <section.icon size={16} />
              <span>{t(section.labelKey)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="profile-content">
        <Outlet />
      </div>
    </div>
  );
}
