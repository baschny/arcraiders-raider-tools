import { ArrowRight, FlaskConical, KeyRound, ListPlus, LogIn, ShieldCheck, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useCognitoAuth } from '../../../../shared/context/CognitoAuthContext';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { ViewId } from '../Sidebar';

interface WelcomeViewProps {
  onViewChange: (view: ViewId) => void;
}

export function WelcomeView({ onViewChange }: WelcomeViewProps) {
  const { t } = useLocale();
  const { isAuthenticated, isValidating, username } = useAuth();
  const cognito = useCognitoAuth();
  const isSignedIn = !!cognito.user;
  const needsSignIn = !isSignedIn;
  const needsArcTracker = isSignedIn && !isAuthenticated;
  const setupTitle = needsSignIn
    ? t('quartermaster.welcome.signInLinkTitle')
    : needsArcTracker
      ? t('quartermaster.welcome.linkTitle')
      : t('quartermaster.welcome.arcTrackerTitle');
  const setupBody = needsSignIn
    ? t('quartermaster.welcome.statusSignedOut')
    : needsArcTracker
      ? t('quartermaster.welcome.statusNeedsArcTracker')
      : username
        ? t('quartermaster.welcome.statusReadyWithName').replace('{username}', username)
        : t('quartermaster.welcome.statusReady');

  return (
    <div className="welcome-view">
      <section className="welcome-view__intro">
        <div>
          <h2>{t('quartermaster.welcome.title')}</h2>
          <h3>{t('quartermaster.welcome.subtitle')}</h3>
          <p>{t('quartermaster.welcome.body')}</p>
        </div>
      </section>

      <section className="welcome-view__setup">
        <div className="welcome-view__setup-status">
          {needsSignIn ? (
            <LogIn size={24} />
          ) : needsArcTracker ? (
            <KeyRound size={24} />
          ) : (
            <ShieldCheck size={24} />
          )}
          <div>
            <h3>{setupTitle}</h3>
            <p>{setupBody}</p>
          </div>
        </div>
        {needsSignIn ? (
          <Link to="/auth/sign-in" className="qm-button qm-button--primary">
            {t('quartermaster.welcome.signIn')}
          </Link>
        ) : needsArcTracker ? (
          <Link to="/profile/arctracker" className="qm-button qm-button--primary">
            {t('quartermaster.welcome.linkArcTracker')}
          </Link>
        ) : null}
      </section>

      <div className="welcome-view__workflow">
        <section className="welcome-view__panel">
          <ListPlus size={24} />
          <h3>{t('quartermaster.welcome.planTitle')}</h3>
          <p>{t('quartermaster.welcome.planBody')}</p>
          <button
            type="button"
            className="qm-button"
            onClick={() => onViewChange('lists')}
          >
            {t('quartermaster.welcome.openLists')}
          </button>
        </section>

        <ArrowRight className="welcome-view__arrow" size={22} />

        <section className="welcome-view__panel">
          <Target size={24} />
          <h3>{t('quartermaster.welcome.inRaidTitle')}</h3>
          <p>{t('quartermaster.welcome.inRaidBody')}</p>
          <button
            type="button"
            className="qm-button"
            onClick={() => onViewChange('in-raid')}
            disabled={isValidating}
          >
            {t('quartermaster.welcome.openInRaid')}
          </button>
        </section>

        <ArrowRight className="welcome-view__arrow" size={22} />

        <section className="welcome-view__panel">
          <FlaskConical size={24} />
          <h3>{t('quartermaster.welcome.craftingTitle')}</h3>
          <p>{t('quartermaster.welcome.craftingBody')}</p>
          <button
            type="button"
            className="qm-button"
            onClick={() => onViewChange('crafting')}
            disabled={isValidating}
          >
            {t('quartermaster.welcome.openCrafting')}
          </button>
        </section>
      </div>
    </div>
  );
}
