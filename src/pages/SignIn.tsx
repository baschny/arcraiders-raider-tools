/**
 * Sign in page.
 *
 * Offers two paths:
 *   - Email + password (Cognito)
 *   - "Continue with Discord" (Lambda OAuth bridge)
 *
 * If Cognito is not configured (e.g. local dev without env vars) we render
 * a friendly notice and let the user keep using the app anonymously.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useCognitoAuth } from '../shared/context/CognitoAuthContext';
import '../shared/styles/_settings.scss';

export function SignIn() {
  const cognito = useCognitoAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cognito.available) {
    return (
      <div className="content-container">
        <div className="settings-page">
          <h2 className="settings-title">Sign in</h2>
          <div className="settings-message settings-message--error">
            <AlertCircle size={16} />
            <span>Sign-in is not configured for this build. You can keep using the app anonymously.</span>
          </div>
        </div>
      </div>
    );
  }

  if (cognito.user) {
    return (
      <div className="content-container">
        <div className="settings-page">
          <h2 className="settings-title">Already signed in</h2>
          <p>Signed in as {cognito.user.email ?? cognito.user.sub}.</p>
          <Link to="/settings/profile">Go to account settings</Link>
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
      navigate('/settings/profile');
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="content-container">
      <div className="settings-page">
        <h2 className="settings-title">Sign in</h2>

        <button
          className="settings-button settings-button--primary"
          onClick={cognito.startDiscordSignIn}
          disabled={submitting}
        >
          Continue with Discord
        </button>

        <div className="settings-section">
          <h3 className="settings-section-title">Or with email + password</h3>
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
              >
                {submitting ? <><Loader2 size={16} className="spin" /><span>Signing in…</span></> : 'Sign in'}
              </button>
              <Link to="/auth/sign-up">Create an account</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
