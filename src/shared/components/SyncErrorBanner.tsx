/**
 * Sync-error banner.
 *
 * Global, non-dismissible alert rendered above the page content
 * whenever any backend sync failure is active for the signed-in user.
 *
 * Data source: `useSyncStatus()` — a module-level aggregator that
 * tracks errors from every `UserStateStore` plus imperative reports
 * from the post-sign-in flow in `CognitoAuthContext`.
 *
 * Rules:
 *  - Hidden when Cognito is not configured (anonymous-only builds).
 *  - Hidden when the user is not signed in.
 *  - Hidden while there are no active errors.
 *  - Not dismissible while an error is present — the banner disappears
 *    automatically once the next successful read/write clears the error
 *    in the underlying store.
 *
 * Copy is picked based on the worst kind in the active set, so the user
 * and the developer see a single coherent message rather than one
 * banner per failed domain. The HTTP status (when we have one) is
 * included to help the dev/sysop diagnose production issues.
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RotateCcw, LogIn } from 'lucide-react';
import { useCognitoAuth } from '../context/CognitoAuthContext';
import { useLocale } from '../context/LocaleContext';
import {
    useSyncStatus,
    worstErrorKind,
    type SyncErrorEntry,
} from '../state/syncStatus';
import type { SyncErrorKind } from '../state/userStateStore';
import './SyncErrorBanner.scss';

function firstStatus(errors: SyncErrorEntry[], kind: SyncErrorKind): number | undefined {
    for (const e of errors) {
        if (e.kind === kind && typeof e.status === 'number') return e.status;
    }
    return undefined;
}

function describeSources(errors: SyncErrorEntry[]): string {
    const unique = Array.from(new Set(errors.map(e => e.source)));
    return unique.join(', ');
}

export function SyncErrorBanner() {
    const cognito = useCognitoAuth();
    const { t, tm } = useLocale();
    const { errors, hasError, retry } = useSyncStatus();
    const [retrying, setRetrying] = useState(false);

    const onRetry = useCallback(async () => {
        setRetrying(true);
        try {
            await retry();
        } finally {
            setRetrying(false);
        }
    }, [retry]);

    if (!cognito.available) return null;
    if (!cognito.user) return null;
    if (!hasError) return null;

    const kind = worstErrorKind(errors) ?? 'unknown';
    const status = firstStatus(errors, kind);
    const sources = describeSources(errors);

    const title = status !== undefined
        ? tm(`shared.syncError.${kind}.title`, { status })
        : t(`shared.syncError.${kind}.title`);
    const body = t(`shared.syncError.${kind}.body`);

    return (
        <div className="sync-error-banner" role="alert" aria-live="assertive">
            <AlertTriangle size={16} className="sync-error-banner__icon" />
            <div className="sync-error-banner__body">
                <strong className="sync-error-banner__title">{title}</strong>
                <span className="sync-error-banner__text">{body}</span>
                <span className="sync-error-banner__details">
                    {tm('shared.syncError.details', { sources })}
                </span>
            </div>
            {kind === 'unauthorized' ? (
                <Link
                    to="/auth/sign-in"
                    className="sync-error-banner__action sync-error-banner__action--primary"
                >
                    <LogIn size={14} />
                    <span>{t('shared.syncError.unauthorized.signIn')}</span>
                </Link>
            ) : (
                <button
                    type="button"
                    className="sync-error-banner__action sync-error-banner__action--primary"
                    onClick={onRetry}
                    disabled={retrying}
                >
                    <RotateCcw size={14} className={retrying ? 'spin' : undefined} />
                    <span>{t('shared.syncError.retry')}</span>
                </button>
            )}
        </div>
    );
}
