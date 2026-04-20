/**
 * Sign in page.
 *
 * Offers two paths:
 *   - Email + password (Cognito)
 *   - "Continue with Discord" (Lambda OAuth bridge)
 *
 * In dev-auth mode (`VITE_DEV_AUTH=true`) the Cognito paths are hidden
 * and an extra "Sign in as dev user" panel is rendered so local dev can
 * exercise the server-backed state stores against the local API server.
 *
 * If neither Cognito nor dev-auth is configured we render a friendly
 * notice and let the user keep using the app anonymously.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useCognitoAuth } from '../shared/context/CognitoAuthContext';
import '../shared/styles/_auth.scss';
import '../shared/styles/_settings.scss';

export function SignIn() {
  const cognito = useCognitoAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devSub, setDevSub] = useState('dev-user-1');
  const [devEmail, setDevEmail] = useState('dev@localhost');

  // If the user is already signed in, skip straight to the dashboard.
  useEffect(() => {
    if (cognito.user) {
      navigate('/', { replace: true });
    }
  }, [cognito.user, navigate]);

  if (!cognito.available) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2 className="auth-card__title">Sign in</h2>
          <div className="settings-message settings-message--error">
            <AlertCircle size={16} />
            <span>Sign-in is not configured for this build. You can keep using the app anonymously.</span>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await cognito.signInWithPassword(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onDevSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      cognito.signInAsDevUser(devSub.trim(), devEmail.trim() || null);
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Dev sign-in failed');
    }
  };

  if (cognito.devAuth) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2 className="auth-card__title">Sign in (dev mode)</h2>
          <div className="settings-message">
            <AlertCircle size={16} />
            <span>
              Dev auth is active (<code>VITE_DEV_AUTH=true</code>). Requests go to the local
              API server; no real Cognito or Discord calls are made.
            </span>
          </div>
          <form className="settings-form" onSubmit={onDevSubmit}>
            <label htmlFor="dev-sub" className="settings-label">User id (sub)</label>
            <input
              id="dev-sub"
              type="text"
              required
              value={devSub}
              onChange={e => setDevSub(e.target.value)}
              className="token-input"
              autoComplete="off"
            />
            <label htmlFor="dev-email" className="settings-label">Email (optional)</label>
            <input
              id="dev-email"
              type="email"
              value={devEmail}
              onChange={e => setDevEmail(e.target.value)}
              className="token-input"
              autoComplete="off"
            />
            {error && (
              <div className="settings-message settings-message--error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div className="settings-actions">
              <button
                type="submit"
                className="settings-button settings-button--primary"
              >
                Sign in as dev user
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-card__title">Sign in</h2>
        <p className="auth-card__subtitle">
          Sign in to sync your progress across devices.
        </p>

        <button
          className="auth-discord-button"
          onClick={cognito.startDiscordSignIn}
          disabled={submitting}
        >
          Continue with Discord
        </button>

        <div className="auth-card__divider">or with email</div>

        <form className="settings-form" onSubmit={onSubmit}>
          <label htmlFor="signin-email" className="settings-label">Email</label>
          <input
            id="signin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="token-input"
            disabled={submitting}
          />
          <label htmlFor="signin-password" className="settings-label">Password</label>
          <input
            id="signin-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="token-input"
            disabled={submitting}
          />
          {error && (
            <div className="settings-message settings-message--error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="settings-actions">
            <button
              type="submit"
              className="settings-button settings-button--primary"
              disabled={submitting}
              style={{ flex: 1 }}
            >
              {submitting ? <><Loader2 size={16} className="spin" /><span>Signing in…</span></> : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="auth-card__footer">
          <span>Don't have an account?</span>
          <Link to="/auth/sign-up">Create one</Link>
        </div>
      </div>
    </div>
  );
}
