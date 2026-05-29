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

export type DetectedBrowser = 'chrome' | 'firefox' | 'other';

export function detectBrowser(): DetectedBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'chrome';
  return 'other';
}

export const EXTENSION_DOWNLOAD_URLS = {
  chrome: 'https://chromewebstore.google.com/detail/raider-tools-embark-auth/ebhdfpellgipnfjobejhiabgnenmidol?authuser=0&hl=en-GB',
  firefox: 'https://addons.mozilla.org/de/firefox/addon/raider-tools-embark-auth/',
} as const;
