import type { EmbarkLinkStatus } from '../services/userApi';

export const EMBARK_IDP_OPTIONS = [
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
] as const;

export function getEmbarkCountdownMinutes(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!expiresAt) return null;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return null;
  return Math.floor((expiresMs - nowMs) / 60_000);
}

export function isEmbarkExpired(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const minutes = getEmbarkCountdownMinutes(expiresAt, nowMs);
  return minutes !== null ? minutes <= 0 : false;
}

export function getEmbarkStatusLabel(
  status: EmbarkLinkStatus | null,
  nowMs: number = Date.now(),
): string | null {
  if (!status?.linked) return null;
  const expired = isEmbarkExpired(status.expiresAt, nowMs);
  const minutes = getEmbarkCountdownMinutes(status.expiresAt, nowMs);
  if (minutes === null) return expired ? 'Expired' : 'Connected';
  if (minutes <= 0) return 'Expired';
  return minutes === 1 ? '1 min left' : `${minutes} min left`;
}

export function detectEmbarkExtensionInstalled(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('meta[name="raider-tools-extension"]'));
}
