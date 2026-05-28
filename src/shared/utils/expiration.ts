export type ExpirationState = 'unknown' | 'valid' | 'warning' | 'expired';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const WARNING_THRESHOLD_MS = HOUR_MS;

export function getExpirationRemainingMs(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!expiresAt) return null;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return null;
  return expiresMs - nowMs;
}

export function getExpirationRemainingMinutes(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const remainingMs = getExpirationRemainingMs(expiresAt, nowMs);
  if (remainingMs === null) return null;
  return Math.floor(remainingMs / MINUTE_MS);
}

export function getExpirationState(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): ExpirationState {
  const remainingMs = getExpirationRemainingMs(expiresAt, nowMs);
  if (remainingMs === null) return 'unknown';
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= WARNING_THRESHOLD_MS) return 'warning';
  return 'valid';
}

export function formatExpirationShort(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const remainingMs = getExpirationRemainingMs(expiresAt, nowMs);
  if (remainingMs === null) return null;
  if (remainingMs <= 0) return 'Expired';
  if (remainingMs < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(remainingMs / MINUTE_MS));
    return `${minutes}m left`;
  }
  const hours = Math.floor(remainingMs / HOUR_MS);
  return `>${hours}h left`;
}
