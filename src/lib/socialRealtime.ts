export type SocialRealtimeEvent = {
  type: string;
  postId?: string;
  kind?: 'story_like' | 'post_like' | string;
  likeCount?: number;
  fromId?: string;
  fromName?: string;
};

const EVENT = 'pl-social';

export function emitSocialRealtime(event: SocialRealtimeEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: event }));
}

export function subscribeSocialRealtime(handler: (event: SocialRealtimeEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<SocialRealtimeEvent>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}
