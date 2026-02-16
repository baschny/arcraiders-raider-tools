/**
 * AuthGate Component
 * Handles authentication gating for Quartermaster views
 * See specification section 4.1.1
 */

import { Link } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext';
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
  const { isAuthenticated, isValidating } = useAuth();

  if (isValidating) {
    return (
      <div className="qm-auth-gate">
        <div className="qm-auth-gate__loading">
          <Loader2 size={32} className="animate-spin" />
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="qm-auth-gate">
        <div className="qm-auth-gate__login">
          <LogIn size={48} />
          <h3>Authentication Required</h3>
          <p>
            To use the Quartermaster planner, you need to connect your ArcTracker account.
          </p>
          <Link to="/settings/profile" className="qm-button qm-button--primary">
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
