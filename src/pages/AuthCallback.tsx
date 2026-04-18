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

export function AuthCallback() {
  const cognito = useCognitoAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (cognito.initializing) return;
    navigate(cognito.user ? '/settings/profile' : '/auth/sign-in', { replace: true });
  }, [cognito.initializing, cognito.user, navigate]);

  return (
    <div className="content-container">
      <div className="settings-page" style={{ textAlign: 'center' }}>
        <Loader2 className="spin" size={32} />
        <p>Finishing sign-in…</p>
      </div>
    </div>
  );
}
