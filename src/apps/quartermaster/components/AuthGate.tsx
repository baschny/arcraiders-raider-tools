/**
 * AuthGate Component
 * Handles authentication gating for Quartermaster views
 * See specification section 4.1.1
 */

import { Link } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
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
    const linkTarget = cognito.user ? '/profile/arctracker' : '/auth/sign-in';
    const linkLabel = cognito.user
      ? t('quartermaster.auth.goToSettings')
      : t('shared.userMenu.login');

    return (
      <div className="qm-auth-gate">
        <div className="qm-auth-gate__login">
          <LogIn size={48} />
          <h3>{t('quartermaster.auth.requiredTitle')}</h3>
          <p>
            {t('quartermaster.auth.requiredBody')}
          </p>
          <Link to={linkTarget} className="qm-button qm-button--primary">
            {linkLabel}
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
