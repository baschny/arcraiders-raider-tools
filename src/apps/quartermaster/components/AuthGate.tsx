/**
 * AuthGate Component
 * Handles authentication gating for Quartermaster views
 * See specification section 4.1.1
 */

import { Link } from 'react-router-dom';
import { KeyRound, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext';
import { useCognitoAuth } from '../../../shared/context/CognitoAuthContext';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { ReactNode } from 'react';

interface AuthGateProps {
  children: ReactNode;
}

/**
 * Gates content behind authentication state.
 * - Shows loading state while validating
 * - Shows login prompt if not authenticated
 * - Renders children if authenticated
 */
export function AuthGate({ children }: AuthGateProps) {
  const { t } = useLocale();
  const { isAuthenticated, isValidating } = useAuth();
  const cognito = useCognitoAuth();

  if (isValidating) {
    return (
      <div className="qm-auth-gate">
        <div className="qm-auth-gate__loading">
          <Loader2 size={32} className="animate-spin" />
          <p>{t('quartermaster.auth.verifying')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const isSignedIn = !!cognito.user;
    const linkTarget = isSignedIn ? '/profile' : '/auth/sign-in';
    const linkLabel = isSignedIn
      ? t('quartermaster.auth.linkAccount')
      : t('quartermaster.auth.signIn');
    const title = isSignedIn
      ? t('quartermaster.auth.linkRequiredTitle')
      : t('quartermaster.auth.requiredTitle');
    const body = isSignedIn
      ? t('quartermaster.auth.linkRequiredBody')
      : t('quartermaster.auth.signInRequiredBody');

    return (
      <div className="qm-auth-gate">
        <div className="qm-auth-gate__login">
          {isSignedIn ? <KeyRound size={48} /> : <LogIn size={48} />}
          <h3>{title}</h3>
          <p>{body}</p>
          <Link to={linkTarget} className="qm-button qm-button--primary">
            {linkLabel}
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
