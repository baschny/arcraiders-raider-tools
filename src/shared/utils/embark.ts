import type { EmbarkLinkStatus } from '../services/userApi';
import {
  formatExpirationShort,
  getExpirationRemainingMinutes,
  getExpirationState,
  type ExpirationState,
} from './expiration';

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
  return getExpirationRemainingMinutes(expiresAt, nowMs);
}

export function isEmbarkExpired(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return getExpirationState(expiresAt, nowMs) === 'expired';
}

export function getEmbarkExpirationState(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): ExpirationState {
  return getExpirationState(expiresAt, nowMs);
}

export function getEmbarkStatusLabel(
  status: EmbarkLinkStatus | null,
  nowMs: number = Date.now(),
): string | null {
  if (!status?.linked) return null;
  return formatExpirationShort(status.expiresAt, nowMs) ?? 'Connected';
}

export function detectEmbarkExtensionInstalled(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('meta[name="raider-tools-extension"]'));
}
