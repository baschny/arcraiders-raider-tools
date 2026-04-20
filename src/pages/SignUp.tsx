/**
 * Sign-up page.
 *
 * Two-step flow:
 *   1. Email + password -> Cognito sends a confirmation code by email.
 *   2. User enters the code -> account is confirmed; they can sign in.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useCognitoAuth } from '../shared/context/CognitoAuthContext';
import '../shared/styles/_auth.scss';
import '../shared/styles/_settings.scss';

export function SignUp() {
  const cognito = useCognitoAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'register' | 'confirm'>('register');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!cognito.available) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2 className="auth-card__title">Create account</h2>
          <div className="settings-message settings-message--error">
            <AlertCircle size={16} />
            <span>Sign-up is not configured for this build.</span>
          </div>
        </div>
      </div>
    );
  }

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setSubmitting(true);
    try {
      await cognito.signUpWithPassword(email.trim(), password);
      setStage('confirm');
      setInfo('We sent a confirmation code to your email. Enter it below to finish.');
    } catch (err) {
      setError((err as Error).message || 'Sign-up failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setSubmitting(true);
    try {
      await cognito.confirmSignUp(email.trim(), code.trim());
      setInfo('Account confirmed. You can sign in now.');
      setTimeout(() => navigate('/auth/sign-in'), 1500);
    } catch (err) {
      setError((err as Error).message || 'Confirmation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-card__title">Create account</h2>

        {stage === 'register' ? (
          <form className="settings-form" onSubmit={onRegister}>
            <label htmlFor="signup-email" className="settings-label">Email</label>
            <input
              id="signup-email" type="email" required autoComplete="email"
              className="token-input" disabled={submitting}
              value={email} onChange={e => setEmail(e.target.value)}
            />
            <label htmlFor="signup-password" className="settings-label">Password (min 10 chars)</label>
            <input
              id="signup-password" type="password" required autoComplete="new-password"
              className="token-input" disabled={submitting} minLength={10}
              value={password} onChange={e => setPassword(e.target.value)}
            />
            {error && (<div className="settings-message settings-message--error"><AlertCircle size={16} /><span>{error}</span></div>)}
            <div className="settings-actions">
              <button type="submit" className="settings-button settings-button--primary" disabled={submitting} style={{ flex: 1 }}>
                {submitting ? <><Loader2 size={16} className="spin" /><span>Creating…</span></> : 'Create account'}
              </button>
            </div>
          </form>
        ) : (
          <form className="settings-form" onSubmit={onConfirm}>
            <label htmlFor="confirm-code" className="settings-label">Confirmation code</label>
            <input
              id="confirm-code" type="text" required inputMode="numeric"
              className="token-input" disabled={submitting}
              value={code} onChange={e => setCode(e.target.value)}
            />
            {info && (<div className="settings-message settings-message--success"><CheckCircle size={16} /><span>{info}</span></div>)}
            {error && (<div className="settings-message settings-message--error"><AlertCircle size={16} /><span>{error}</span></div>)}
            <div className="settings-actions">
              <button type="submit" className="settings-button settings-button--primary" disabled={submitting} style={{ flex: 1 }}>
                {submitting ? <><Loader2 size={16} className="spin" /><span>Confirming…</span></> : 'Confirm'}
              </button>
            </div>
          </form>
        )}

        <div className="auth-card__footer">
          <span>Already have an account?</span>
          <Link to="/auth/sign-in">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
