import { ArrowRight, FlaskConical, KeyRound, ListPlus, LogIn, ShieldCheck, Target, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useCognitoAuth } from '../../../../shared/context/CognitoAuthContext';
import { useLinkedAccounts } from '../../../../shared/context/LinkedAccountsContext';
import { useLocale } from '../../../../shared/context/LocaleContext';
import type { ViewId } from '../Sidebar';

interface WelcomeViewProps {
  onViewChange: (view: ViewId) => void;
  embarkEnabled: boolean;
}

export function WelcomeView({ onViewChange, embarkEnabled }: WelcomeViewProps) {
  const { t } = useLocale();
  const { isAuthenticated, isValidating, username } = useAuth();
  const { embark } = useLinkedAccounts();
  const cognito = useCognitoAuth();
  const isSignedIn = !!cognito.user;
  const needsSignIn = !isSignedIn;
  const hasEmbarkLink = embark.status?.linked === true;
  const needsLinkedAccount = isSignedIn && !isAuthenticated && !hasEmbarkLink;
  const setupTitle = needsSignIn
    ? t('quartermaster.welcome.signInLinkTitle')
    : needsLinkedAccount
      ? t('quartermaster.welcome.linkTitle')
      : hasEmbarkLink
        ? t('quartermaster.welcome.embarkTitle')
        : t('quartermaster.welcome.arcTrackerTitle');
  const setupBody = needsSignIn
    ? t('quartermaster.welcome.statusSignedOut')
    : needsLinkedAccount
      ? t('quartermaster.welcome.statusNeedsLinkedAccount')
      : hasEmbarkLink
        ? t('quartermaster.welcome.statusReadyWithEmbark')
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
          ) : needsLinkedAccount ? (
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
        ) : needsLinkedAccount ? (
          <div className="welcome-view__link-options">
            {embarkEnabled && (
              <Link to="/profile/embark" className="welcome-view__link-card welcome-view__link-card--primary">
                <Zap size={20} />
                <span>
                  <strong>{t('quartermaster.welcome.linkEmbark')}</strong>
                  <small>{t('quartermaster.welcome.linkEmbarkBenefit')}</small>
                </span>
              </Link>
            )}
            <Link to="/profile/arctracker" className="welcome-view__link-card">
              <KeyRound size={20} />
              <span>
                <strong>{t('quartermaster.welcome.linkArcTracker')}</strong>
                <small>{t('quartermaster.welcome.linkArcTrackerBenefit')}</small>
              </span>
            </Link>
          </div>
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
