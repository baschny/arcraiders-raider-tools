/**
 * Auth callback page.
 *
 * The Discord OAuth bridge redirects here with Cognito tokens in the URL
 * fragment. `CognitoAuthContext` consumes those tokens on mount; we just
 * wait briefly and then route the user to their account page (or back to
 * sign-in on failure).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCognitoAuth } from '../shared/context/CognitoAuthContext';
import '../shared/styles/_auth.scss';

export function AuthCallback() {
  const cognito = useCognitoAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (cognito.initializing) return;
    navigate(cognito.user ? '/' : '/auth/sign-in', { replace: true });
  }, [cognito.initializing, cognito.user, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center', alignItems: 'center' }}>
        <Loader2 className="spin" size={32} />
        <p>Finishing sign-in…</p>
      </div>
    </div>
  );
}
