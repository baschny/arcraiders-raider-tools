const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatAgeShort(
  isoString: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!isoString) return null;
  const syncedMs = Date.parse(isoString);
  if (!Number.isFinite(syncedMs)) return null;

  const elapsedMs = Math.max(0, nowMs - syncedMs);

  if (elapsedMs < MINUTE_MS) return '<1m';

  const elapsedMinutes = Math.floor(elapsedMs / MINUTE_MS);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `>${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedMs / DAY_MS);
  return `>${elapsedDays}d`;
}
