import { useEffect, useRef, useCallback } from 'react';
import { getApiBaseUrl } from '@/src/lib/api';

export type SseEventType =
  | 'social_update'
  | 'checkin_update'
  | 'challenge_update'
  | 'routine_update';

interface UseRealtimeUpdatesOptions {
  onSocialUpdate?: () => void;
  onCheckinUpdate?: () => void;
  onChallengeUpdate?: () => void;
  onRoutineUpdate?: () => void;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

export function useRealtimeUpdates(
  userId: string | null,
  options: UseRealtimeUpdatesOptions
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const esRef = useRef<EventSource | null>(null);
  const retryIndexRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !userId) return;
    cleanup();

    const base = getApiBaseUrl();
    if (!base) return;

    const token =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('auth_token')
        : null;
    if (!token) return;

    const url = `${base}/api/sse/stream?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryIndexRef.current = 0;
    };

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        switch (data.type) {
          case 'social_update':
            optionsRef.current.onSocialUpdate?.();
            break;
          case 'checkin_update':
            optionsRef.current.onCheckinUpdate?.();
            break;
          case 'challenge_update':
            optionsRef.current.onChallengeUpdate?.();
            break;
          case 'routine_update':
            optionsRef.current.onRoutineUpdate?.();
            break;
        }
      } catch {
        /* ignore parse errors */
      }
    };

    es.addEventListener('social_update', handleEvent);
    es.addEventListener('checkin_update', handleEvent);
    es.addEventListener('challenge_update', handleEvent);
    es.addEventListener('routine_update', handleEvent);

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;
      const delay =
        RECONNECT_DELAYS[
          Math.min(retryIndexRef.current, RECONNECT_DELAYS.length - 1)
        ];
      retryIndexRef.current++;
      retryTimerRef.current = setTimeout(connect, delay);
    };
  }, [userId, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  // Reconnect when returning to foreground
  useEffect(() => {
    if (!userId || typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
          retryIndexRef.current = 0;
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId, connect]);
}
