/**
 * User Menu Component (rendered in the header).
 *
 * - Signed-out: a "Login" button that links to the dedicated sign-in page.
 * - Signed-in: an icon-first button that opens a dropdown showing the
 *   current identity, a link to the Profile page, and a Logout button
 *   guarded by a confirmation dialog.
 *
 * The file is still named `LoginButton.tsx` for backward compatibility
 * with the rest of the codebase, but the exported component plays the
 * role of a user menu now.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  ClockAlert,
  LogIn,
  LogOut,
  Loader2,
  TriangleAlert,
  User,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCognitoAuth } from '../context/CognitoAuthContext';
import { useLinkedAccounts, type ArctrackerConnectionState } from '../context/LinkedAccountsContext';
import { useLocale } from '../context/LocaleContext';
import { runSignOutWipe } from '../state/hydration';
import { useMinuteTicker } from '../hooks/useMinuteTicker';
import { getEmbarkExpirationState, getEmbarkStatusLabel } from '../utils/embark';
import type { EmbarkLinkStatus } from '../services/userApi';

type MenuStatusTone = 'neutral' | 'connected' | 'warning' | 'disconnected';

function getArctrackerTone(state: ArctrackerConnectionState): MenuStatusTone {
  if (state === 'connected') return 'connected';
  if (state === 'invalid') return 'warning';
  return 'neutral';
}

function getEmbarkTone(status: EmbarkLinkStatus | null, nowMs: number): MenuStatusTone {
  if (!status?.linked) return 'disconnected';
  const state = getEmbarkExpirationState(status.expiresAt, nowMs);
  if (state === 'expired') return 'disconnected';
  if (state === 'warning') return 'warning';
  return 'connected';
}

function StatusIcon({ tone }: { tone: MenuStatusTone }) {
  if (tone === 'connected') return <CircleCheck size={16} />;
  if (tone === 'warning') return <TriangleAlert size={16} />;
  if (tone === 'disconnected') return <CircleX size={16} />;
  return <User size={16} />;
}

export function LoginButton() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const { username, isValidating } = useAuth();
  const cognito = useCognitoAuth();
  const { arctracker, embark } = useLinkedAccounts();
  const embarkStatus = embark.status;
  const countdownNow = useMinuteTicker(Boolean(embarkStatus?.linked));

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Close both the menu and any confirm dialog if the user hits Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleProfileClick = useCallback(() => {
    setOpen(false);
    navigate('/profile');
  }, [navigate]);

  const handleEmbarkClick = useCallback(() => {
    setOpen(false);
    navigate('/profile/embark');
  }, [navigate]);

  const handleLogoutConfirm = useCallback(async () => {
    setConfirming(false);
    setOpen(false);
    // 1. Await the wipe so all user-state stores and legacy localStorage
    //    keys are fully cleared before the tokens are gone.
    //    (`CognitoAuthContext.signOut` also kicks this off, but we drive
    //    it here synchronously so we can reliably reload right after.)
    try {
      await runSignOutWipe();
    } catch {
      // Best effort — continue with sign-out even if a flush/wipe step fails.
    }
    // 2. Clear the Cognito session (sync) and update context state.
    cognito.signOut();
    // 3. Full navigation to the home page. This re-mounts every app so
    //    components that loaded data once on mount (loot-helper,
    //    quest-tracker, etc.) visibly reset to the empty/default state.
    window.location.href = '/';
  }, [cognito]);

  // Loading state (auth validating OR Cognito still initializing).
  if (isValidating || cognito.initializing) {
    return (
      <button className="login-button login-button--loading" disabled>
        <Loader2 size={16} className="spin" />
      </button>
    );
  }

  // Signed in: user icon + username, clickable dropdown.
  const signedIn = Boolean(cognito.user) || Boolean(username);

  if (signedIn) {
    const displayName = cognito.user?.email ?? username ?? '';
    const embarkLabel = getEmbarkStatusLabel(embarkStatus, countdownNow);
    const arctrackerTone = getArctrackerTone(arctracker.state);
    const arctrackerStatusLabel = arctracker.state === 'connected'
      ? arctracker.isSubscribed
        ? `${t('shared.userMenu.statusLinked')} * ${t('shared.userMenu.statusSubscribed')}`
        : t('shared.userMenu.statusLinked')
      : arctracker.state === 'invalid'
        ? t('shared.userMenu.statusInvalid')
        : t('shared.userMenu.statusNotConfigured');
    const embarkTone = getEmbarkTone(embarkStatus, countdownNow);
    const embarkStatusLabel = embarkStatus?.linked
      ? embarkLabel ?? t('shared.userMenu.statusConnected')
      : t('shared.userMenu.statusNotConnected');
    const showEmbarkAttention = Boolean(embarkStatus?.linked)
      && (embarkTone === 'warning' || embarkTone === 'disconnected');
    const EmbarkAttentionIcon = embarkTone === 'warning' ? ClockAlert : TriangleAlert;

    return (
      <div className="header-dropdown" ref={wrapperRef}>
        <button
          className="login-button login-button--authenticated"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <UserCircle size={18} />
          {displayName && <span className="login-button__name">{displayName}</span>}
          {showEmbarkAttention && (
            <span
              className={`connection-alert connection-alert--${embarkTone}`}
              title={`${t('shared.userMenu.embark')}: ${embarkStatusLabel}`}
            >
              <EmbarkAttentionIcon size={14} />
            </span>
          )}
          <ChevronDown size={14} />
        </button>
        {open && (
          <div className="header-menu user-menu" role="menu">
            <div className="user-menu__identity">
              <User size={16} />
              <div className="user-menu__identity-text">
                <span className="user-menu__identity-label">
                  {t('shared.userMenu.signedInAs')}
                </span>
                <span className="user-menu__identity-line">
                  <span className="user-menu__identity-value">{displayName}</span>
                  {showEmbarkAttention && (
                    <span
                      className={`connection-alert connection-alert--${embarkTone}`}
                      title={`${t('shared.userMenu.embark')}: ${embarkStatusLabel}`}
                    >
                      <EmbarkAttentionIcon size={14} />
                    </span>
                  )}
                </span>
              </div>
            </div>
            <button
              className="header-menu-item"
              onClick={handleProfileClick}
              role="menuitem"
            >
              <span className={`connection-status connection-status--${arctrackerTone}`}>
                <StatusIcon tone={arctrackerTone} />
              </span>
              <span className="user-menu__item-text">
                <span>{t('shared.userMenu.arctracker')}</span>
                <span className="user-menu__item-meta">{arctrackerStatusLabel}</span>
              </span>
            </button>
            <button
              className="header-menu-item"
              onClick={handleEmbarkClick}
              role="menuitem"
            >
              <span className={`connection-status connection-status--${embarkTone}`}>
                <StatusIcon tone={embarkTone} />
              </span>
              <span className="user-menu__item-text">
                <span>{t('shared.userMenu.embark')}</span>
                <span className="user-menu__item-meta">{embarkStatusLabel}</span>
              </span>
            </button>
            <button
              className="header-menu-item header-menu-item--danger"
              onClick={() => setConfirming(true)}
              role="menuitem"
            >
              <LogOut size={16} />
              <span>{t('shared.userMenu.logout')}</span>
            </button>
          </div>
        )}
        {confirming && (
          <div
            className="confirm-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirming(false);
            }}
          >
            <div className="confirm-dialog">
              <h3 className="confirm-dialog__title">
                {t('shared.userMenu.confirmSignOutTitle')}
              </h3>
              <p className="confirm-dialog__body">
                {t('shared.userMenu.confirmSignOutBody')}
              </p>
              <div className="confirm-dialog__actions">
                <button
                  className="settings-button"
                  onClick={() => setConfirming(false)}
                >
                  {t('shared.userMenu.cancel')}
                </button>
                <button
                  className="settings-button settings-button--danger"
                  onClick={handleLogoutConfirm}
                  autoFocus
                >
                  <LogOut size={16} />
                  <span>{t('shared.userMenu.confirm')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Signed out: simple login button → dedicated sign-in page.
  return (
    <button className="login-button" onClick={() => navigate('/auth/sign-in')}>
      <LogIn size={16} />
      <span>{t('shared.userMenu.login')}</span>
    </button>
  );
}
