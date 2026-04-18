/**
 * Token-link abstraction for the ArcTracker integration.
 *
 * This is the seam that lets the app keep the same UX for two distinct
 * storage backends:
 *
 *  - LocalTokenLink: token kept in `localStorage`, validated against the
 *    ArcTracker relay on demand. Used in anonymous mode (no Cognito user).
 *
 *  - RemoteTokenLink: token kept server-side under the user's Cognito
 *    identity, envelope-encrypted at rest. Validation happens on the
 *    server when the user submits a token (PUT /me/links/arctracker).
 *
 * Both implementations expose the same async surface so the surrounding
 * `AuthContext` does not need to know which backend it is talking to.
 */

import { getToken as getLocalToken, setToken as setLocalToken, clearToken as clearLocalToken } from '../utils/tokenStorage';
import { validateToken as validateLocalToken } from '../services/arctrackerApi';
import { getArctrackerLink, putArctrackerLink, deleteArctrackerLink } from '../services/userApi';

export interface ArctrackerLinkSnapshot {
    isLinked: boolean;
    username: string | null;
}

export interface ArctrackerTokenLink {
    /** Display name of the backend, useful for diagnostics. */
    readonly kind: 'local' | 'remote';

    /** Returns the current link snapshot. May hit the network for `remote`. */
    refresh(): Promise<ArctrackerLinkSnapshot>;

    /**
     * Links a new ArcTracker token. For `local`, validates against the
     * relay; for `remote`, the server validates and persists.
     * Returns the validated username, or null if the token was rejected.
     */
    link(token: string): Promise<string | null>;

    /** Removes the current link. */
    unlink(): Promise<void>;
}

export const localTokenLink: ArctrackerTokenLink = {
    kind: 'local',
    async refresh() {
        const t = getLocalToken();
        if (!t) return { isLinked: false, username: null };
        const username = await validateLocalToken(t);
        if (!username) {
            clearLocalToken();
            return { isLinked: false, username: null };
        }
        return { isLinked: true, username };
    },
    async link(token: string) {
        const username = await validateLocalToken(token);
        if (!username) return null;
        setLocalToken(token);
        return username;
    },
    async unlink() {
        clearLocalToken();
    },
};

export const remoteTokenLink: ArctrackerTokenLink = {
    kind: 'remote',
    async refresh() {
        const r = await getArctrackerLink();
        return {
            isLinked: !!r.linked,
            username: r.validatedUsername ?? null,
        };
    },
    async link(token: string) {
        try {
            const r = await putArctrackerLink(token);
            return r.validatedUsername ?? null;
        } catch (err) {
            console.warn('Remote arctracker link failed', err);
            return null;
        }
    },
    async unlink() {
        await deleteArctrackerLink();
    },
};
