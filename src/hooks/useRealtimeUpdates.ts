import { useEffect, useRef, useCallback } from 'react';
import { getApiBaseUrl } from '@/src/lib/api';
import { emitChatRealtime, setRealtimeOpen, type ChatRealtimeEvent } from '@/src/lib/chatRealtime';
import { showLocalNotification } from '@/src/pwa/notifications';

export type SseEventType =
  | 'social_update'
  | 'checkin_update'
  | 'challenge_update'
  | 'routine_update'
  | 'chat_message'
  | 'chat_typing';

interface UseRealtimeUpdatesOptions {
  onSocialUpdate?: () => void;
  onCheckinUpdate?: () => void;
  onChallengeUpdate?: () => void;
  onRoutineUpdate?: () => void;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];
/** Sondeo de respaldo mientras el SSE no está abierto (proxy que corta streams, red móvil, etc.). */
const FALLBACK_POLL_MS = 60000;
const CALLBACK_THROTTLE_MS = 2000;

function throttleCall(lastAt: { t: number }, fn?: () => void) {
  if (!fn) return;
  const now = Date.now();
  if (now - lastAt.t < CALLBACK_THROTTLE_MS) return;
  lastAt.t = now;
  fn();
}

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

  const lastSocialAt = useRef({ t: 0 });
  const lastCheckinAt = useRef({ t: 0 });
  const lastChallengeAt = useRef({ t: 0 });
  const lastRoutineAt = useRef({ t: 0 });

  const cleanup = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setRealtimeOpen(false);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !userId) return;
    const state = esRef.current?.readyState;
    if (state === EventSource.OPEN || state === EventSource.CONNECTING) return;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

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
      setRealtimeOpen(true);
    };

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { type: string; fromName?: string; preview?: string };
        switch (data.type) {
          case 'social_update':
            throttleCall(lastSocialAt.current, optionsRef.current.onSocialUpdate);
            if (document.hidden) {
              void showLocalNotification('Nueva actividad', 'Tienes avisos en Social', {
                screen: 'social',
                tab: 'chat',
                url: '/?pwa=social&tab=chat',
                tag: 'social_update',
              });
            }
            break;
          case 'checkin_update':
            throttleCall(lastCheckinAt.current, optionsRef.current.onCheckinUpdate);
            if (document.hidden) {
              void showLocalNotification('Alguien está en el gym', 'Mira quién entrena ahora', {
                screen: 'social',
                tab: 'checkins',
                url: '/?pwa=social&tab=checkins',
                tag: 'checkin_update',
              });
            }
            break;
          case 'challenge_update':
            throttleCall(lastChallengeAt.current, optionsRef.current.onChallengeUpdate);
            if (document.hidden) {
              void showLocalNotification('Torneos', 'Hay movimiento en un torneo', {
                screen: 'social',
                tab: 'challenges',
                url: '/?pwa=social&tab=challenges',
                tag: 'challenge_update',
              });
            }
            break;
          case 'routine_update':
            throttleCall(lastRoutineAt.current, optionsRef.current.onRoutineUpdate);
            break;
          case 'chat_message': {
            const chat = data as ChatRealtimeEvent;
            emitChatRealtime(chat);
            if (document.hidden && chat.type === 'chat_message' && !chat.message?.mine) {
              void showLocalNotification(
                chat.message.author?.name || 'Nuevo mensaje',
                chat.message.text || 'Te han escrito en el chat',
                { screen: 'social', tab: 'chat', url: '/?pwa=social&tab=chat', tag: 'chat_message' }
              );
            }
            break;
          }
          case 'chat_typing':
            emitChatRealtime(data as ChatRealtimeEvent);
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
    es.addEventListener('chat_message', handleEvent);
    es.addEventListener('chat_typing', handleEvent);

    es.onerror = () => {
      if (esRef.current !== es) return;
      setRealtimeOpen(false);
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
      // Strict Mode desmonta y remonta: no cortes el stream a los 0 ms.
      window.setTimeout(() => {
        if (!mountedRef.current) cleanup();
      }, 80);
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

  // Sin SSE abierto no llegaría nada (solicitudes de amistad, check-ins...): se refresca por sondeo.
  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (esRef.current?.readyState === EventSource.OPEN) return;
      optionsRef.current.onSocialUpdate?.();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [userId]);
}
