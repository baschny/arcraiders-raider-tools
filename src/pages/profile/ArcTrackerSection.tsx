/**
 * ArcTracker Integration Section
 *
 * Extracted from the legacy `ProfileSettings` page. Lets users link or
 * unlink their arctracker.io account via API token. Tokens are stored
 * server-side for signed-in Raider Tools users.
 */

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../shared/context/AuthContext';
import { useLinkedAccounts } from '../../shared/context/LinkedAccountsContext';
import { getCacheMeta } from '../../shared/services/cacheService';
import { useLocale } from '../../shared/context/LocaleContext';

export function ArcTrackerSection() {
  const { t } = useLocale();
  const { isAuthenticated, username, isValidating, error, login, logout } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Last-synced metadata is shown alongside the connected account.
  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      const meta = await getCacheMeta();
      if (!cancelled && meta?.lastSyncedAt) {
        setLastSynced(new Date(meta.lastSyncedAt));
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTokenSubmit = async () => {
    setLocalError(null);
    setSuccessMessage(null);

    setIsSubmitting(true);
    const success = await login(tokenInput.trim());
    setIsSubmitting(false);

    if (success) {
      setTokenInput('');
      setSuccessMessage('Token validated successfully!');
    } else {
      setLocalError('Invalid token. Please check your API token and try again.');
    }
  };

  const handleLogout = async () => {
    await logout();
    setTokenInput('');
    setLastSynced(null);
    setSuccessMessage('Logged out successfully. All cached data has been cleared.');
  };

  const { arctracker } = useLinkedAccounts();
  const { isSubscribed, refreshProfile, profileUpdating } = arctracker;
  const displayError = localError || error;

  return (
    <div className="settings-page profile-section">
      <h2 className="settings-title">{t('pages.profile.sections.arctracker')}</h2>

      <div className="settings-section">
        <div className="settings-info">
          <p>
            Connect your{' '}
            <a href="https://arctracker.io" target="_blank" rel="noopener noreferrer">
              arctracker.io <ExternalLink size={12} />
            </a>{' '}
            account to sync your in-game inventory and loadout data.
          </p>
        </div>

        <div className="settings-steps">
          <h4>Setup Instructions:</h4>
          <ol>
            <li>
              Create an account on{' '}
              <a href="https://arctracker.io/stash" target="_blank" rel="noopener noreferrer">
                arctracker.io <ExternalLink size={12} />
              </a>{' '}
              and link it to your Embark game account.
            </li>
            <li>
              Generate an API token from your{' '}
              <a
                href="https://arctracker.io/settings"
                target="_blank"
                rel="noopener noreferrer"
              >
                ArcTracker settings page <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>Paste the token below and click "Save Token".</li>
          </ol>
        </div>

        <div className="settings-form">
          {isAuthenticated ? (
            <>
              <label className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={16} style={{ color: '#4caf50' }} />
                API Token Configured
              </label>
              <div className="settings-actions">
                <button
                  className="settings-button settings-button--danger"
                  onClick={handleLogout}
                  disabled={isSubmitting || isValidating}
                >
                  <LogOut size={16} />
                  <span>Unlink</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="api-token" className="settings-label">
                API Token
              </label>
              <div className="token-input-wrapper">
                <input
                  id="api-token"
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    setLocalError(null);
                    setSuccessMessage(null);
                  }}
                  placeholder="arc_u1_xxxxxxxxxx..."
                  className="token-input"
                  disabled={isSubmitting || isValidating}
                />
                <button
                  type="button"
                  className="token-toggle"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="settings-actions">
                <button
                  className="settings-button settings-button--primary"
                  onClick={handleTokenSubmit}
                  disabled={isSubmitting || isValidating || !tokenInput.trim()}
                >
                  {isSubmitting || isValidating ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    <span>Save Token</span>
                  )}
                </button>
              </div>
            </>
          )}

          {displayError && (
            <div className="settings-message settings-message--error">
              <AlertCircle size={16} />
              <span>{displayError}</span>
            </div>
          )}

          {successMessage && (
            <div className="settings-message settings-message--success">
              <CheckCircle size={16} />
              <span>{successMessage}</span>
            </div>
          )}
        </div>
      </div>

      {isAuthenticated && username && (
        <div className="settings-section">
          <h3 className="settings-section-title">Connected Account</h3>
          <div className="settings-account-info">
            <div className="account-detail">
              <span className="account-label">Username:</span>
              <span className="account-value">{username}</span>
            </div>
            {lastSynced && (
              <div className="account-detail">
                <span className="account-label">Last Synced:</span>
                <span className="account-value">
                  {lastSynced.toLocaleDateString()} {lastSynced.toLocaleTimeString()}
                </span>
              </div>
            )}
            <div className="account-detail" style={{ alignItems: 'flex-start' }}>
              <span className="account-label">Subscription:</span>
              {isSubscribed ? (
                <span className="account-value" style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={16} />
                  Premium
                </span>
              ) : (
                <span className="account-value" style={{ fontWeight: 400, lineHeight: 1.5 }}>
                  Having a Premium subscription at{' '}
                  <a href="https://arctracker.io" target="_blank" rel="noopener noreferrer">
                    arctracker.io <ExternalLink size={12} />
                  </a>{' '}
                  will enable Raider Tools to auto-sync your game data. Without the subscription, you need to
                  sync your game data on the{' '}
                  <a href="https://arctracker.io/stash" target="_blank" rel="noopener noreferrer">
                    arctracker.io/stash <ExternalLink size={12} />
                  </a>{' '}
                  page every time before syncing in Raider Tools.{' '}
                  <a href="https://arctracker.io/subscribe" target="_blank" rel="noopener noreferrer">
                    Subscribe here <ExternalLink size={12} />
                  </a>
                  .
                </span>
              )}
            </div>
          </div>
          <div className="settings-actions" style={{ marginTop: 12 }}>
            <button
              className="settings-button settings-button--secondary"
              onClick={refreshProfile}
              disabled={profileUpdating}
            >
              {profileUpdating ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              <span>Update</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
