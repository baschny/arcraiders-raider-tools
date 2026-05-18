/**
 * Token-link abstraction for the ArcTracker integration.
 *
 * Tokens are kept server-side under the user's Cognito identity,
 * envelope-encrypted at rest. Validation happens on the server when the
 * user submits a token (PUT /me/links/arctracker).
 */

import { getArctrackerLink, putArctrackerLink, deleteArctrackerLink } from '../services/userApi';

export interface ArctrackerLinkSnapshot {
    isLinked: boolean;
    username: string | null;
}

export interface ArctrackerTokenLink {
    /** Returns the current link snapshot. Hits the authenticated user API. */
    refresh(): Promise<ArctrackerLinkSnapshot>;

    /**
     * Links a new ArcTracker token. The server validates and persists it.
     * Returns the validated username, or null if the token was rejected.
     */
    link(token: string): Promise<string | null>;

    /** Removes the current link. */
    unlink(): Promise<void>;
}

export const serverTokenLink: ArctrackerTokenLink = {
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
