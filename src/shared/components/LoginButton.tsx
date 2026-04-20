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
import { ChevronDown, LogIn, LogOut, Loader2, User, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCognitoAuth } from '../context/CognitoAuthContext';
import { useLocale } from '../context/LocaleContext';
import { runSignOutWipe } from '../state/hydration';

export function LoginButton() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const { username, isValidating } = useAuth();
  const cognito = useCognitoAuth();

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
                <span className="user-menu__identity-value">{displayName}</span>
              </div>
            </div>
            <button
              className="header-menu-item"
              onClick={handleProfileClick}
              role="menuitem"
            >
              <User size={16} />
              <span>{t('shared.userMenu.profile')}</span>
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
