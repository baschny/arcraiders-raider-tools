import { useCallback, useEffect, useState } from 'react';
import { getEmbarkLink, type EmbarkLinkStatus } from '../services/userApi';

interface UseEmbarkLinkStatusResult {
  status: EmbarkLinkStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setStatus: (next: EmbarkLinkStatus | null) => void;
}

interface UseEmbarkLinkStatusOptions {
  pollIntervalMs?: number | null;
}

export function useEmbarkLinkStatus(
  enabled: boolean,
  { pollIntervalMs = null }: UseEmbarkLinkStatusOptions = {},
): UseEmbarkLinkStatusResult {
  const [status, setStatus] = useState<EmbarkLinkStatus | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getEmbarkLink();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Embark status');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !pollIntervalMs || pollIntervalMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollIntervalMs, refresh]);

  return { status, loading, error, refresh, setStatus };
}
