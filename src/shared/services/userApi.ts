/**
 * Typed client for the authenticated `/me` and `/me/links/*` endpoints.
 *
 * Every request automatically attaches the current Cognito ID token via the
 * cognitoClient helper.
 */

import { getIdToken } from '../auth/cognitoClient';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    'https://api.raider-tools.app';

export interface MeResponse {
    sub: string;
    email: string | null;
    displayName: string | null;
    locale: string | null;
    signupProvider: string;
    links: {
        arctracker:
            | { linked: true; validatedUsername: string | null; validatedAt: string | null }
            | { linked: false };
        embark: { linked: boolean };
    };
}

export interface ArctrackerLinkStatus {
    linked: boolean;
    validatedUsername?: string | null;
    validatedAt?: string | null;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getIdToken();
    if (!token) throw new Error('Not signed in');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function readJson<T>(resp: Response): Promise<T> {
    if (!resp.ok) {
        let message = `${resp.status} ${resp.statusText}`;
        try {
            const body = await resp.json() as { error?: string };
            if (body?.error) message = body.error;
        } catch { /* ignore */ }
        throw new Error(message);
    }
    return resp.json() as Promise<T>;
}

export async function getMe(): Promise<MeResponse> {
    return readJson<MeResponse>(await authedFetch('/me'));
}

export async function patchMe(patch: { displayName?: string; locale?: string }): Promise<void> {
    await readJson(await authedFetch('/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
    }));
}

export async function getArctrackerLink(): Promise<ArctrackerLinkStatus> {
    return readJson<ArctrackerLinkStatus>(await authedFetch('/me/links/arctracker'));
}

export async function putArctrackerLink(token: string): Promise<ArctrackerLinkStatus> {
    return readJson<ArctrackerLinkStatus>(await authedFetch('/me/links/arctracker', {
        method: 'PUT',
        body: JSON.stringify({ token }),
    }));
}

export async function deleteArctrackerLink(): Promise<void> {
    await readJson(await authedFetch('/me/links/arctracker', { method: 'DELETE' }));
}
