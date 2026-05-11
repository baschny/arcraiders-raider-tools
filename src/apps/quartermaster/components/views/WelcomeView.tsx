import { ExternalLink, KeyRound, ListPlus, LogIn, RefreshCw, ShieldCheck } from 'lucide-react';
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

  return (
    <div className="welcome-view">
      <section className="welcome-view__intro">
        <div>
          <p className="welcome-view__eyebrow">{t('quartermaster.welcome.eyebrow')}</p>
          <h2>{t('quartermaster.welcome.title')}</h2>
          <p>{t('quartermaster.welcome.body')}</p>
        </div>
        <div className="welcome-view__status">
          {needsSignIn ? (
            <>
              <LogIn size={20} />
              <span>{t('quartermaster.welcome.statusSignedOut')}</span>
            </>
          ) : needsArcTracker ? (
            <>
              <KeyRound size={20} />
              <span>{t('quartermaster.welcome.statusNeedsArcTracker')}</span>
            </>
          ) : (
            <>
              <ShieldCheck size={20} />
              <span>
                {username
                  ? t('quartermaster.welcome.statusReadyWithName').replace('{username}', username)
                  : t('quartermaster.welcome.statusReady')}
              </span>
            </>
          )}
        </div>
      </section>

      <div className="welcome-view__grid">
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

        <section className="welcome-view__panel">
          <KeyRound size={24} />
          <h3>{t('quartermaster.welcome.connectTitle')}</h3>
          <p>
            {needsSignIn
              ? t('quartermaster.welcome.connectSignedOutBody')
              : t('quartermaster.welcome.connectSignedInBody')}
          </p>
          {needsSignIn ? (
            <Link to="/auth/sign-in" className="qm-button qm-button--primary">
              {t('quartermaster.welcome.signIn')}
            </Link>
          ) : needsArcTracker ? (
            <Link to="/profile/arctracker" className="qm-button qm-button--primary">
              {t('quartermaster.welcome.linkArcTracker')}
            </Link>
          ) : (
            <button
              type="button"
              className="qm-button qm-button--primary"
              onClick={() => onViewChange('stash')}
              disabled={isValidating}
            >
              {t('quartermaster.welcome.openMyItems')}
            </button>
          )}
        </section>

        <section className="welcome-view__panel">
          <RefreshCw size={24} />
          <h3>{t('quartermaster.welcome.syncTitle')}</h3>
          <p>{t('quartermaster.welcome.syncBody')}</p>
          <a
            href="https://arctracker.io/stash"
            className="qm-button"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('quartermaster.welcome.openArcTracker')}
            <ExternalLink size={14} />
          </a>
        </section>
      </div>
    </div>
  );
}
