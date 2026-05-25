import { describe, expect, it } from 'vitest';
import {
  formatExpirationShort,
  getExpirationRemainingMinutes,
  getExpirationState,
} from '../expiration';

const NOW = Date.parse('2026-05-25T10:00:00.000Z');

function fromNow(ms: number): string {
  return new Date(NOW + ms).toISOString();
}

describe('expiration utilities', () => {
  it('reports unknown for missing or invalid expiration timestamps', () => {
    expect(getExpirationState(null, NOW)).toBe('unknown');
    expect(formatExpirationShort(undefined, NOW)).toBeNull();
    expect(getExpirationRemainingMinutes('not-a-date', NOW)).toBeNull();
  });

  it('reports expired at or before the current time', () => {
    expect(getExpirationState(fromNow(0), NOW)).toBe('expired');
    expect(formatExpirationShort(fromNow(-1), NOW)).toBe('Expired');
  });

  it('uses minute display below one hour', () => {
    expect(getExpirationState(fromNow(59 * 60_000), NOW)).toBe('warning');
    expect(formatExpirationShort(fromNow(59 * 60_000), NOW)).toBe('59m left');
    expect(formatExpirationShort(fromNow(30_000), NOW)).toBe('1m left');
  });

  it('uses warning state through exactly one hour', () => {
    expect(getExpirationState(fromNow(60 * 60_000), NOW)).toBe('warning');
    expect(formatExpirationShort(fromNow(60 * 60_000), NOW)).toBe('>1h left');
  });

  it('uses compact hour buckets above one hour', () => {
    expect(getExpirationState(fromNow(119 * 60_000), NOW)).toBe('valid');
    expect(formatExpirationShort(fromNow(119 * 60_000), NOW)).toBe('>1h left');
    expect(formatExpirationShort(fromNow(120 * 60_000), NOW)).toBe('>2h left');
    expect(formatExpirationShort(fromNow(5 * 60 * 60_000 + 20 * 60_000), NOW)).toBe('>5h left');
  });
});
