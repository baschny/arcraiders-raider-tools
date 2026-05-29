import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  ClockAlert,
  KeyRound,
  Loader2,
  LogOut,
  TriangleAlert,
} from 'lucide-react';
import { useMinuteTicker } from '../../shared/hooks/useMinuteTicker';
import { useLinkedAccounts } from '../../shared/context/LinkedAccountsContext';
import { useLocale } from '../../shared/context/LocaleContext';
import { ApiError, deleteEmbarkLink, getMe, startEmbarkLink } from '../../shared/services/userApi';
import {
  detectBrowser,
  detectEmbarkExtensionInstalled,
  EMBARK_IDP_OPTIONS,
  EXTENSION_DOWNLOAD_URLS,
  getEmbarkExpirationState,
} from '../../shared/utils/embark';
import { formatExpirationShort } from '../../shared/utils/expiration';

type ChecklistTone = 'success' | 'warning' | 'danger' | 'neutral';

function ChecklistIcon({ tone }: { tone: ChecklistTone }) {
  if (tone === 'success') return <CircleCheck size={18} />;
  if (tone === 'danger') return <CircleX size={18} />;
  if (tone === 'warning') return <TriangleAlert size={18} />;
  return <ClockAlert size={18} />;
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'steam') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
      </svg>
    );
  }
  if (provider === 'playstation') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" />
      </svg>
    );
  }
  if (provider === 'xbox') {
    return (
      <svg viewBox="0 0 372.36823 372.57281" aria-hidden="true" focusable="false">
        <g transform="translate(-1.5706619,12.357467)">
          <path fill="currentColor" d="M 169.18811,359.44924 C 140.50497,356.70211 111.4651,346.40125 86.518706,330.1252 65.614374,316.48637 60.893704,310.87967 60.893704,299.69061 c 0,-22.47524 24.711915,-61.84014 66.992496,-106.71584 24.01246,-25.48631 57.46022,-55.36001 61.0775,-54.55105 7.0309,1.57238 63.25048,56.41053 84.29655,82.2252 33.28077,40.82148 48.58095,74.24535 40.808,89.14682 -5.9087,11.32753 -42.57224,33.4669 -69.50775,41.97242 -22.19984,7.01011 -51.35538,9.9813 -75.37239,7.68108 z M 32.660004,276.3228 C 15.288964,249.67326 6.5125436,223.43712 2.2752336,185.49086 c -1.39917002,-12.53 -0.89778,-19.69701 3.17715,-45.41515 5.0788204,-32.05404 23.3330104,-69.136381 45.2671304,-91.957616 9.34191,-9.719732 10.17624,-9.956543 21.56341,-6.120482 13.828357,4.658436 28.595936,14.857457 51.498366,35.56661 l 13.36254,12.082873 -7.2969,8.96431 C 95.97448,140.22403 60.217254,199.2085 46.741444,235.70071 c -7.32599,19.83862 -10.28084,39.75281 -7.12868,48.04363 2.12818,5.59752 0.17339,3.51093 -6.95276,-7.42154 z m 304.915426,4.53255 c 1.71605,-8.37719 -0.4544,-23.76257 -5.5413,-39.28002 -11.01667,-33.60598 -47.83964,-96.12421 -81.65282,-138.63054 L 239.73699,89.563875 251.25285,78.989784 c 15.03631,-13.806637 25.47602,-22.073835 36.74025,-29.094513 8.88881,-5.540156 21.59109,-10.444558 27.05113,-10.444558 3.36626,0 15.21723,12.298726 24.78421,25.720611 14.81725,20.787711 25.71782,45.986976 31.24045,72.219686 3.56833,16.9498 3.8657,53.23126 0.57486,70.13935 -2.70068,13.87582 -8.40314,31.87484 -13.9661,44.08195 -4.16823,9.14657 -14.53521,26.91044 -19.0783,32.69074 -2.33569,2.97175 -2.33761,2.96527 -1.02393,-3.4477 z M 172.25917,33.104812 c -15.60147,-7.922671 -39.6696,-16.427164 -52.96493,-18.715209 -4.66097,-0.802124 -12.61193,-1.249474 -17.6688,-0.994114 -10.969613,0.55394 -10.479662,-0.0197 7.11783,-8.3336652 14.63023,-6.912081 26.83386,-10.976696 43.40044,-14.455218 18.6362,-3.9130858 53.66559,-3.9590088 72.00507,-0.0944 19.80818,4.174105 43.13297,12.854085 56.27623,20.9423862 l 3.90633,2.403927 -8.96247,-0.452584 c -17.81002,-0.899366 -43.76575,6.295879 -71.63269,19.857459 -8.40538,4.090523 -15.71788,7.357511 -16.25,7.25997 -0.53211,-0.09754 -7.38426,-3.43589 -15.22701,-7.418555 z" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z" />
    </svg>
  );
}

function ChromeIcon() {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <title>Google Chrome</title>
      <path fill="currentColor" d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
    </svg>
  );
}

function FirefoxIcon() {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <title>Firefox Browser</title>
      <path fill="currentColor" d="M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 00-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.02-.149.035-.298.052-.448.232-1.994-.025-4.09-.753-5.844z" />
    </svg>
  );
}

export function EmbarkSection() {
  const { t, tm } = useLocale();
  const { embark } = useLinkedAccounts();
  const { status, loading, error, refresh, setStatus } = embark;
  const [submittingProvider, setSubmittingProvider] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [errorSupportId, setErrorSupportId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [embarkEnabled, setEmbarkEnabled] = useState<boolean | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const extensionDetected = useMemo(() => detectEmbarkExtensionInstalled(), []);
  const browser = useMemo(() => detectBrowser(), []);
  const countdownNow = useMinuteTicker(Boolean(status?.linked));

  const provider = status?.linked
    ? EMBARK_IDP_OPTIONS.find((option) => option.id === status.provider)
    : undefined;
  const providerLabel = provider?.label
    ?? (status?.linked && status.provider ? status.provider : t('pages.profile.embark.unknownProvider'));
  const linkedUsername = status?.linked
    ? status.profile?.displayName?.name
      ?? status.profile?.thirdPartyLastSeenAccountName
      ?? t('pages.profile.embark.unknownUsername')
    : t('pages.profile.embark.unknownUsername');
  const expirationState = status?.linked
    ? getEmbarkExpirationState(status.expiresAt, countdownNow)
    : 'unknown';
  const countdownLabel = status?.linked
    ? formatExpirationShort(status.expiresAt, countdownNow) ?? t('pages.profile.embark.unknownExpiry')
    : t('pages.profile.embark.unknownExpiry');
  const connectionTone: ChecklistTone = !status?.linked
    ? 'danger'
    : expirationState === 'expired'
      ? 'danger'
      : expirationState === 'warning' || expirationState === 'unknown'
        ? 'warning'
        : 'success';
  const connectionTitle = !status?.linked
    ? t('pages.profile.embark.accountNotConnectedTitle')
    : expirationState === 'expired'
      ? t('pages.profile.embark.accountExpiredTitle')
      : expirationState === 'warning'
        ? t('pages.profile.embark.accountExpiringTitle')
        : t('pages.profile.embark.accountConnectedTitle');
  const providerActionTitle = status?.linked
    ? t('pages.profile.embark.refreshConnectionTitle')
    : t('pages.profile.embark.connectAccountTitle');
  const providerActionHint = extensionDetected
    ? status?.linked
      ? t('pages.profile.embark.refreshConnectionHint')
      : t('pages.profile.embark.connectAccountHint')
    : status?.linked
      ? t('pages.profile.embark.refreshWithoutExtensionHint')
      : t('pages.profile.embark.connectWithoutExtensionHint');

  useEffect(() => {
    let cancelled = false;
    void getMe()
      .then((me) => {
        if (!cancelled) setEmbarkEnabled(me.features?.embarkEnabled === true);
      })
      .catch((err) => {
        if (!cancelled) {
          setEmbarkEnabled(false);
          setLocalError(err instanceof Error ? err.message : 'Unable to load Embark access');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStart(provider: string) {
    setSubmittingProvider(provider);
    setLocalError(null);
    setErrorSupportId(null);
    setSuccessMessage(null);
    try {
      const returnUrl = `${window.location.origin}/embark-callback`;
      const result = await startEmbarkLink(provider, returnUrl);
      window.sessionStorage.setItem(`rt_embark_support_${result.state}`, result.supportId);
      window.location.href = result.authUrl;
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to start Embark authentication');
      setErrorSupportId(err instanceof ApiError ? err.supportId : null);
      setSubmittingProvider(null);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    setLocalError(null);
    setErrorSupportId(null);
    setSuccessMessage(null);
    try {
      await deleteEmbarkLink();
      setStatus({ linked: false });
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
        {embarkEnabled === null ? (
          <div className="embark-loading">
            <Loader2 size={18} className="spin" />
            <span>{t('shared.loading')}</span>
          </div>
        ) : !embarkEnabled ? (
          <div className="embark-access-gate">
            <div className="embark-access-gate__icon">
              <KeyRound size={28} />
            </div>
            <div>
              <h3>{t('pages.profile.embark.accessGateTitle')}</h3>
              <p>{t('pages.profile.embark.accessGateBody')}</p>
              <ul>
                <li>{t('pages.profile.embark.accessFeatureInventory')}</li>
                <li>{t('pages.profile.embark.accessFeatureProgress')}</li>
                <li>{t('pages.profile.embark.accessFeatureQuartermaster')}</li>
              </ul>
              <a
                className="settings-button settings-button--primary"
                href="https://discord.com/users/793567008331399178"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('pages.profile.embark.contactSupport')}
              </a>
            </div>
          </div>
        ) : (
          <>
        <div className="embark-section-header">
          <div>
            <h3 className="settings-section-title">{t('pages.profile.embark.checklistTitle')}</h3>
            <p className="embark-section-subtitle">{t('pages.profile.embark.checklistSubtitle')}</p>
          </div>
        </div>

        <div className="embark-checklist">
          <details className={`embark-checklist-item embark-checklist-item--${extensionDetected ? 'success' : 'warning'}`}>
            <summary>
              <span className="embark-checklist-item__icon">
                <ChecklistIcon tone={extensionDetected ? 'success' : 'warning'} />
              </span>
              <span className="embark-checklist-item__content">
                <span className="embark-checklist-item__title">
                  {extensionDetected
                    ? t('pages.profile.embark.extensionInstalledTitle')
                    : status?.linked
                      ? t('pages.profile.embark.extensionMissingRefreshTitle')
                      : t('pages.profile.embark.extensionMissingConnectTitle')}
                </span>
                <span className="embark-checklist-item__summary">
                  {extensionDetected
                    ? t('pages.profile.embark.extensionInstalledSummary')
                    : status?.linked
                      ? t('pages.profile.embark.extensionMissingRefreshSummary')
                      : t('pages.profile.embark.extensionMissingConnectSummary')}
                </span>
              </span>
              <ChevronDown size={16} className="embark-checklist-item__chevron" />
            </summary>
            <div className="embark-checklist-item__details">
              {extensionDetected
                ? t('pages.profile.embark.extensionInstalledDetails')
                : t('pages.profile.embark.extensionMissingDetails')}
              {!extensionDetected && (
                <div className="embark-extension-download">
                  <p className="embark-extension-download__title">
                    {t('pages.profile.embark.extensionDownloadTitle')}
                  </p>
                  {browser === 'chrome' && (
                    <a
                      className="settings-button settings-button--chrome embark-extension-download__link"
                      href={EXTENSION_DOWNLOAD_URLS.chrome}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="embark-provider-button__icon embark-provider-button__icon--chrome">
                        <ChromeIcon />
                      </span>
                      <span>{t('pages.profile.embark.extensionDownloadChrome')}</span>
                    </a>
                  )}
                  {browser === 'firefox' && (
                    <a
                      className="settings-button settings-button--firefox embark-extension-download__link"
                      href={EXTENSION_DOWNLOAD_URLS.firefox}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="embark-provider-button__icon embark-provider-button__icon--firefox">
                        <FirefoxIcon />
                      </span>
                      <span>{t('pages.profile.embark.extensionDownloadFirefox')}</span>
                    </a>
                  )}
                  {browser === 'other' && (
                    <>
                      <p className="embark-extension-download__other-note">
                        {t('pages.profile.embark.extensionDownloadOther')}
                      </p>
                      <div className="embark-extension-download__buttons">
                        <a
                          className="settings-button settings-button--chrome embark-extension-download__link"
                          href={EXTENSION_DOWNLOAD_URLS.chrome}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="embark-provider-button__icon embark-provider-button__icon--chrome">
                            <ChromeIcon />
                          </span>
                          <span>{t('pages.profile.embark.extensionDownloadChrome')}</span>
                        </a>
                        <a
                          className="settings-button settings-button--firefox embark-extension-download__link"
                          href={EXTENSION_DOWNLOAD_URLS.firefox}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="embark-provider-button__icon embark-provider-button__icon--firefox">
                            <FirefoxIcon />
                          </span>
                          <span>{t('pages.profile.embark.extensionDownloadFirefox')}</span>
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </details>

          <details className={`embark-checklist-item embark-checklist-item--${connectionTone}`}>
            <summary>
              <span className="embark-checklist-item__icon">
                <ChecklistIcon tone={connectionTone} />
              </span>
              <span className="embark-checklist-item__content">
                <span className="embark-checklist-item__title">{connectionTitle}</span>
                {status?.linked ? (
                  <span className="embark-checklist-item__summary embark-connection-summary">
                    <span>{providerLabel} · {linkedUsername}</span>
                    <span className={`embark-expiration-badge embark-expiration-badge--${connectionTone}`}>
                      {countdownLabel}
                    </span>
                  </span>
                ) : (
                  <span className="embark-checklist-item__summary">
                    {t('pages.profile.embark.accountNotConnectedSummary')}
                  </span>
                )}
              </span>
              <ChevronDown size={16} className="embark-checklist-item__chevron" />
            </summary>
            <div className="embark-checklist-item__details embark-account-summary">
              {loading ? (
                <span className="embark-loading">
                  <Loader2 size={16} className="spin" />
                  <span>{t('shared.loading')}</span>
                </span>
              ) : status?.linked ? (
                <>
                  <dl>
                    <div>
                      <dt>{t('pages.profile.embark.providerLabel')}</dt>
                      <dd>{providerLabel}</dd>
                    </div>
                    <div>
                      <dt>{t('pages.profile.embark.usernameLabel')}</dt>
                      <dd>{linkedUsername}</dd>
                    </div>
                    <div>
                      <dt>{t('pages.profile.embark.sessionLabel')}</dt>
                      <dd>
                        <span className={`embark-status-pill embark-status-pill--${connectionTone}`}>
                          {countdownLabel}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="settings-button settings-button--danger embark-unlink-button"
                    onClick={() => void handleUnlink()}
                    disabled={unlinking || submittingProvider !== null}
                  >
                    {unlinking ? <Loader2 size={16} className="spin" /> : <LogOut size={16} />}
                    <span>{t('pages.profile.embark.unlink')}</span>
                  </button>
                </>
              ) : (
                <span>{t('pages.profile.embark.accountNotConnectedDetails')}</span>
              )}
            </div>
          </details>
        </div>

        {(localError || error) && (
          <div className="settings-message settings-message--error">
            <AlertCircle size={16} />
            <span>
              {localError || error}
              {errorSupportId && (
                <>
                  <br />
                  {t('pages.profile.embark.supportIdLabel')}: {errorSupportId}
                </>
              )}
            </span>
          </div>
        )}

        {successMessage && (
          <div className="settings-message settings-message--success">
            <CircleCheck size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="embark-provider-section">
          <h3 className="settings-section-title">{providerActionTitle}</h3>
          <p className="embark-section-subtitle">{providerActionHint}</p>
          {!extensionDetected && (
            <p className="embark-manual-note">{t('pages.profile.embark.manualFlowNote')}</p>
          )}

        <div className="embark-provider-grid">
          {EMBARK_IDP_OPTIONS.map((provider) => (
            <button
              key={provider.id}
              className={`settings-button embark-provider-button embark-provider-button--${provider.id}${status?.linked && status.provider === provider.id ? ' embark-provider-button--active' : ''}`}
              disabled={loading || unlinking || submittingProvider !== null}
              onClick={() => void handleStart(provider.id)}
            >
              {submittingProvider === provider.id ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{t('pages.profile.embark.redirecting')}</span>
                </>
              ) : (
                <>
                  <span className="embark-provider-button__icon" aria-hidden="true">
                    <ProviderIcon provider={provider.id} />
                  </span>
                  <span>
                    {status?.linked
                      ? tm('pages.profile.embark.refreshWithProvider', { provider: provider.label })
                      : tm('pages.profile.embark.connectWithProvider', { provider: provider.label })}
                  </span>
                  {status?.linked && status.provider === provider.id && (
                    <Check size={16} className="embark-provider-button__active-check" />
                  )}
                </>
              )}
            </button>
          ))}
        </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
