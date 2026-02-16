/**
 * Login Button Component
 * Shows "Login" when not authenticated, username when authenticated.
 * Links to the profile settings page.
 */

import { useNavigate } from 'react-router-dom';
import { User, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginButton() {
  const navigate = useNavigate();
  const { isAuthenticated, username, isValidating } = useAuth();

  const handleClick = () => {
    navigate('/settings/profile');
  };

  if (isValidating) {
    return (
      <button className="login-button login-button--loading" disabled>
        <Loader2 size={16} className="spin" />
      </button>
    );
  }

  if (isAuthenticated && username) {
    return (
      <button className="login-button login-button--authenticated" onClick={handleClick}>
        <User size={16} />
        <span>{username}</span>
      </button>
    );
  }

  return (
    <button className="login-button" onClick={handleClick}>
      <LogIn size={16} />
      <span>Login</span>
    </button>
  );
}
