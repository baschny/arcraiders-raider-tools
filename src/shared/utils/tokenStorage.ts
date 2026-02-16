/**
 * Token Storage Utility
 * Manages ArcTracker API token in localStorage.
 */

const TOKEN_KEY = 'rt_arctracker_token';
const VALIDATED_AT_KEY = 'rt_arctracker_validatedAt';

/**
 * Get the stored API token.
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store the API token and update validation timestamp.
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(VALIDATED_AT_KEY, Date.now().toString());
}

/**
 * Clear the stored token and validation timestamp.
 */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(VALIDATED_AT_KEY);
}

/**
 * Get the timestamp when the token was last validated.
 * Returns null if never validated.
 */
export function getValidatedAt(): number | null {
  const value = localStorage.getItem(VALIDATED_AT_KEY);
  if (!value) return null;
  const timestamp = parseInt(value, 10);
  return isNaN(timestamp) ? null : timestamp;
}

/**
 * Check if a token looks valid (basic format check).
 * Token format: arc_u1_xxxx...
 */
export function isTokenFormatValid(token: string): boolean {
  return /^arc_u1_[A-Za-z0-9_-]{20,}$/.test(token);
}
