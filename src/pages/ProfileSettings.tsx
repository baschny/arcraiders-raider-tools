/**
 * Profile Settings Page
 * Allows users to manage their ArcTracker API token.
 */

import { useState, useEffect } from 'react';
import { Eye, EyeOff, ExternalLink, LogOut, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../shared/context/AuthContext';
import { getToken } from '../shared/utils/tokenStorage';
import { getCacheMeta } from '../shared/services/cacheService';
import '../shared/styles/_settings.scss';

export function ProfileSettings() {
  const { isAuthenticated, username, isValidating, error, login, logout } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load existing token on mount
  useEffect(() => {
    const existingToken = getToken();
    if (existingToken) {
      setTokenInput(existingToken);
    }
  }, []);

  // Load last synced time
  useEffect(() => {
    async function loadMeta() {
      const meta = await getCacheMeta();
      if (meta?.lastSyncedAt) {
        setLastSynced(new Date(meta.lastSyncedAt));
      }
    }
    loadMeta();
  }, []);

  const handleTokenSubmit = async () => {
    setLocalError(null);
    setSuccessMessage(null);

    // Empty token = logout
    if (!tokenInput.trim()) {
      await logout();
      setSuccessMessage('Logged out successfully.');
      return;
    }

    setIsSubmitting(true);
    const success = await login(tokenInput.trim());
    setIsSubmitting(false);

    if (success) {
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

  const displayError = localError || error;

  return (
    <div className="content-container">
      <div className="settings-page">
        <h2 className="settings-title">Account Settings</h2>

        <div className="settings-section">
          <h3 className="settings-section-title">ArcTracker Integration</h3>

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
                <a href="https://arctracker.io/settings" target="_blank" rel="noopener noreferrer">
                  ArcTracker settings page <ExternalLink size={12} />
                </a>
                .
              </li>
              <li>Paste the token below and click "Save Token".</li>
            </ol>
          </div>

          <div className="settings-form">
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

            <div className="settings-actions">
              <button
                className="settings-button settings-button--primary"
                onClick={handleTokenSubmit}
                disabled={isSubmitting || isValidating}
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

              {isAuthenticated && (
                <button
                  className="settings-button settings-button--danger"
                  onClick={handleLogout}
                  disabled={isSubmitting || isValidating}
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              )}
            </div>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
