import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useEmbarkLinkStatus } from '../../shared/hooks/useEmbarkLinkStatus';
import { useMinuteTicker } from '../../shared/hooks/useMinuteTicker';
import { useCognitoAuth } from '../../shared/context/CognitoAuthContext';
import { useLocale } from '../../shared/context/LocaleContext';
import { deleteEmbarkLink, startEmbarkLink } from '../../shared/services/userApi';
import {
  detectEmbarkExtensionInstalled,
  EMBARK_IDP_OPTIONS,
  getEmbarkCountdownMinutes,
  isEmbarkExpired,
} from '../../shared/utils/embark';

export function EmbarkSection() {
  const { t, formatDate } = useLocale();
  const cognito = useCognitoAuth();
  const { status, loading, error, refresh } = useEmbarkLinkStatus(Boolean(cognito.user), { pollIntervalMs: null });
  const [submittingProvider, setSubmittingProvider] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const extensionDetected = useMemo(() => detectEmbarkExtensionInstalled(), []);
  const countdownNow = useMinuteTicker(Boolean(status?.linked));

  const countdownMinutes = status?.linked ? getEmbarkCountdownMinutes(status.expiresAt, countdownNow) : null;
  const expired = status?.linked ? isEmbarkExpired(status.expiresAt, countdownNow) : false;
  const countdownLabel = countdownMinutes === null
    ? t('pages.profile.embark.unknownExpiry')
    : countdownMinutes <= 0
      ? t('pages.profile.embark.expired')
      : countdownMinutes === 1
        ? t('pages.profile.embark.oneMinute')
        : t('pages.profile.embark.minutesRemaining').replace('{minutes}', String(countdownMinutes));

  async function handleStart(provider: string) {
    setSubmittingProvider(provider);
    setLocalError(null);
    setSuccessMessage(null);
    try {
      const returnUrl = `${window.location.origin}/embark-callback`;
      const result = await startEmbarkLink(provider, returnUrl);
      window.location.href = result.authUrl;
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to start Embark authentication');
      setSubmittingProvider(null);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    setLocalError(null);
    setSuccessMessage(null);
    try {
      await deleteEmbarkLink();
      await refresh();
      setSuccessMessage(t('pages.profile.embark.unlinked'));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to unlink Embark account');
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="settings-page profile-section">
      <h2 className="settings-title">{t('pages.profile.sections.embark')}</h2>

      <div className="settings-section">
        <div className="settings-info">
          <p>{t('pages.profile.embark.description')}</p>
        </div>

        <div className={`embark-warning${extensionDetected ? '' : ' embark-warning--alert'}`}>
          {extensionDetected ? <CheckCircle size={16} /> : <TriangleAlert size={16} />}
          <span>
            {extensionDetected
              ? t('pages.profile.embark.extensionDetected')
              : t('pages.profile.embark.extensionMissing')}
          </span>
        </div>

        <div className="settings-steps">
          <h4>{t('pages.profile.embark.howItWorksTitle')}</h4>
          <ol>
            <li>{t('pages.profile.embark.stepInstall')}</li>
            <li>{t('pages.profile.embark.stepChooseProvider')}</li>
            <li>{t('pages.profile.embark.stepConfirm')}</li>
          </ol>
        </div>

        {(localError || error) && (
          <div className="settings-message settings-message--error">
            <AlertCircle size={16} />
            <span>{localError || error}</span>
          </div>
        )}

        {successMessage && (
          <div className="settings-message settings-message--success">
            <CheckCircle size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="embark-provider-grid">
          {EMBARK_IDP_OPTIONS.map((provider) => (
            <button
              key={provider.id}
              className="settings-button settings-button--primary embark-provider-button"
              disabled={loading || unlinking || submittingProvider !== null}
              onClick={() => void handleStart(provider.id)}
            >
              {submittingProvider === provider.id ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{t('pages.profile.embark.redirecting')}</span>
                </>
              ) : (
                <span>
                  {status?.linked
                    ? t('pages.profile.embark.reauthenticateWith').replace('{provider}', provider.label)
                    : t('pages.profile.embark.authenticateWith').replace('{provider}', provider.label)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="embark-section-header">
          <h3 className="settings-section-title">{t('pages.profile.embark.currentStatus')}</h3>
          <button
            className="settings-button embark-refresh-button"
            onClick={() => void refresh()}
            disabled={loading || unlinking || submittingProvider !== null}
          >
            <RefreshCw size={16} />
            <span>{t('pages.profile.embark.refreshStatus')}</span>
          </button>
        </div>

        {loading ? (
          <div className="embark-loading">
            <Loader2 size={18} className="spin" />
            <span>{t('shared.loading')}</span>
          </div>
        ) : !status?.linked ? (
          <p className="embark-empty">{t('pages.profile.embark.notLinked')}</p>
        ) : (
          <>
            <div className="settings-account-info">
              <div className="account-detail">
                <span className="account-label">{t('pages.profile.embark.stateLabel')}</span>
                <span className={`account-value embark-status-pill${expired ? ' embark-status-pill--expired' : ''}`}>
                  {expired ? t('pages.profile.embark.expired') : t('pages.profile.embark.active')}
                </span>
              </div>
              <div className="account-detail">
                <span className="account-label">{t('pages.profile.embark.providerLabel')}</span>
                <span className="account-value">{status.provider ?? 'Unknown'}</span>
              </div>
              <div className="account-detail">
                <span className="account-label">{t('pages.profile.embark.expiresLabel')}</span>
                <span className="account-value">
                  {status.expiresAt ? formatDate(new Date(status.expiresAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }) : t('pages.profile.embark.unknownExpiry')}
                </span>
              </div>
              <div className="account-detail">
                <span className="account-label">{t('pages.profile.embark.countdownLabel')}</span>
                <span className="account-value">{countdownLabel}</span>
              </div>
              {status.profile?.displayName?.name && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.displayNameLabel')}</span>
                  <span className="account-value">{status.profile.displayName.name}</span>
                </div>
              )}
              {status.profile?.email && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.emailLabel')}</span>
                  <span className="account-value">{status.profile.email}</span>
                </div>
              )}
              {status.profile?.accountId !== undefined && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.accountIdLabel')}</span>
                  <span className="account-value">{status.profile.accountId}</span>
                </div>
              )}
              {status.profile?.tenancyUserId !== undefined && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.tenancyUserIdLabel')}</span>
                  <span className="account-value">{status.profile.tenancyUserId}</span>
                </div>
              )}
              {status.profile?.thirdPartyUserId && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.thirdPartyIdLabel')}</span>
                  <span className="account-value">{status.profile.thirdPartyUserId}</span>
                </div>
              )}
              {status.profile?.thirdPartyLastSeenAccountName && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.thirdPartyNameLabel')}</span>
                  <span className="account-value">{status.profile.thirdPartyLastSeenAccountName}</span>
                </div>
              )}
              {status.profileFetchedAt && (
                <div className="account-detail">
                  <span className="account-label">{t('pages.profile.embark.profileFetchedLabel')}</span>
                  <span className="account-value">
                    {formatDate(new Date(status.profileFetchedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className="settings-actions">
              <button
                className="settings-button settings-button--danger"
                onClick={() => void handleUnlink()}
                disabled={unlinking || submittingProvider !== null}
              >
                {unlinking ? <Loader2 size={16} className="spin" /> : <LogOut size={16} />}
                <span>{t('pages.profile.embark.unlink')}</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-info">
          <p>
            {t('pages.profile.embark.supportText')}{' '}
            <a href="https://auth.embark.net" target="_blank" rel="noopener noreferrer">
              auth.embark.net <ExternalLink size={12} />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
