import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ApiError, completeEmbarkLink, getEmbarkLink } from '../shared/services/userApi';
import { useCognitoAuth } from '../shared/context/CognitoAuthContext';
import { useLocale } from '../shared/context/LocaleContext';
import '../shared/styles/_settings.scss';
import '../shared/styles/_profile.scss';

const inflightEmbarkCompletions = new Map<string, Promise<void>>();
const completedEmbarkCompletions = new Set<string>();

export function EmbarkCallback() {
  const cognito = useCognitoAuth();
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [supportId, setSupportId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'waiting-auth' | 'completing' | 'redirecting'>('waiting-auth');

  useEffect(() => {
    if (cognito.initializing) return;
    if (!cognito.user) {
      setError(t('pages.profile.embark.callbackSignedOut'));
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const storedSupportId = state
      ? window.sessionStorage.getItem(`rt_embark_support_${state}`)
      : null;
    const embarkError = searchParams.get('error');
    const embarkDescription = searchParams.get('error_description');

    if (embarkError) {
      setSupportId(storedSupportId);
      setError(
        embarkDescription
          ? `${embarkError}: ${embarkDescription}`
          : embarkError
      );
      return;
    }
    if (!code || !state) {
      setSupportId(storedSupportId);
      setError(t('pages.profile.embark.callbackMissingParams'));
      return;
    }

    const requestKey = `${code}:${state}`;
    setPhase('completing');

    let cancelled = false;
    const redirectToProfile = () => {
      if (cancelled) return;
      setPhase('redirecting');
      window.location.replace('/profile/embark');
    };

    if (completedEmbarkCompletions.has(requestKey)) {
      redirectToProfile();
      return () => {
        cancelled = true;
      };
    }

    let request = inflightEmbarkCompletions.get(requestKey);
    if (!request) {
      request = completeEmbarkLink(code, state)
        .then(() => {
          completedEmbarkCompletions.add(requestKey);
          window.sessionStorage.removeItem(`rt_embark_support_${state}`);
        })
        .finally(() => {
          inflightEmbarkCompletions.delete(requestKey);
        });
      inflightEmbarkCompletions.set(requestKey, request);
    }

    void request
      .then(() => {
        redirectToProfile();
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t('pages.profile.embark.callbackFailed');
          const nextSupportId = err instanceof ApiError && err.supportId
            ? err.supportId
            : storedSupportId;
          setSupportId(nextSupportId);
          const looksReplay =
            message.toLowerCase().includes('invalid or expired embark auth state');
          if (looksReplay) {
            void getEmbarkLink()
              .then((status) => {
                if (status.linked) {
                  window.sessionStorage.removeItem(`rt_embark_support_${state}`);
                  redirectToProfile();
                  return;
                }
                setError(message);
              })
              .catch(() => {
                setError(message);
              });
            return;
          }
          setError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cognito.initializing, cognito.user, searchParams, t]);

  if (cognito.initializing || (cognito.user && !error)) {
    return (
      <div className="content-container">
        <div className="profile-loading">
          <Loader2 size={32} className="spin" />
          <span style={{ marginLeft: 12 }}>
            {phase === 'redirecting'
              ? t('pages.profile.embark.redirectingBack')
              : t('pages.profile.embark.completingLink')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container">
      <div className="profile-signed-out">
        <AlertCircle size={40} />
        <h2>{t('pages.profile.embark.callbackTitle')}</h2>
        <p>{error ?? t('pages.profile.embark.callbackFailed')}</p>
        {supportId && (
          <p>
            {t('pages.profile.embark.supportIdLabel')}: <strong>{supportId}</strong>
          </p>
        )}
        <Link to="/profile/embark" className="settings-button settings-button--primary">
          {t('pages.profile.embark.backToProfile')}
        </Link>
      </div>
    </div>
  );
}
