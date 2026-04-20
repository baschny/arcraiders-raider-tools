/**
 * Sign-in nudge banner.
 *
 * Displayed above the three apps that sync progress (quests, loot-helper,
 * quartermaster) to give anonymous users a heads-up:
 *
 *  - You can keep using the tools without signing in.
 *  - Signing in lets your progress follow you across devices.
 *  - On first sign-in, *this device's* progress is uploaded.
 *  - On later sign-ins, the account's progress replaces the device's.
 *
 * The banner is:
 *  - hidden for signed-in users,
 *  - dismissible (per-device) via `localStorage.rt_signin_nudge_dismissed`,
 *  - rendered nothing (null) when Cognito isn't configured for this build.
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, LogIn } from 'lucide-react';
import { useCognitoAuth } from '../context/CognitoAuthContext';
import './SignInNudge.scss';

const DISMISS_KEY = 'rt_signin_nudge_dismissed';

function wasDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

export function SignInNudge() {
    const cognito = useCognitoAuth();
    const [dismissed, setDismissed] = useState<boolean>(wasDismissed);

    const onDismiss = useCallback(() => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
        setDismissed(true);
    }, []);

    if (!cognito.available) return null;
    if (cognito.user) return null;
    if (dismissed) return null;

    return (
        <div className="signin-nudge" role="status">
            <LogIn size={16} className="signin-nudge__icon" />
            <div className="signin-nudge__body">
                <strong>Sign in to sync across devices.</strong>{' '}
                Your local progress is saved on this device only. When you
                <Link to="/auth/sign-in"> sign in</Link> for the first time,
                it is transferred to your account; on later sign-ins, your
                account's data replaces this device's.
            </div>
            <button
                type="button"
                aria-label="Dismiss"
                className="signin-nudge__dismiss"
                onClick={onDismiss}
            >
                <X size={16} />
            </button>
        </div>
    );
}
