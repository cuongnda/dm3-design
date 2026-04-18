import { useEffect, useState, useRef } from 'react';

export type HealthState = 'ok' | 'degraded' | 'down' | 'unknown';

interface UseApiHealthResult {
  state: HealthState;
  lastCheckedAt: Date | null;
}

const HEALTH_ENDPOINT = '/api/v1/auth/me';
const POLL_INTERVAL_MS = 30_000;
const TIMEOUT_MS = 5_000;

export function useApiHealth(): UseApiHealthResult {
  const [state, setState] = useState<HealthState>('unknown');
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const check = async () => {
      const token = localStorage.getItem('dm3-token');
      if (!token) {
        if (aliveRef.current) {
          setState('unknown');
          setLastCheckedAt(new Date());
        }
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(HEALTH_ENDPOINT, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!aliveRef.current) return;
        if (res.ok) setState('ok');
        else if (res.status >= 500) setState('down');
        else setState('degraded');
      } catch {
        if (aliveRef.current) setState('down');
      } finally {
        clearTimeout(timer);
        if (aliveRef.current) setLastCheckedAt(new Date());
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return { state, lastCheckedAt };
}
