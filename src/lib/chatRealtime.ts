export type ChatRealtimeEvent =
  | {
      type: 'chat_message';
      peerId?: string;
      groupId?: string;
      message?: {
        id: string;
        text: string;
        createdAt: string;
        mine: boolean;
        mediaKey?: string | null;
        mediaType?: 'image' | 'video' | null;
        storyReply?: {
          postId: string;
          mediaKey: string;
          mediaType: 'image' | 'video';
          caption?: string;
          available?: boolean;
        } | null;
        author?: { id: string; name: string; avatar: string | null };
      };
    }
  | {
      type: 'chat_typing';
      fromId: string;
      fromName?: string;
      peerId?: string;
      groupId?: string;
    }
  | {
      type: 'chat_read';
      peerId?: string;
      groupId?: string;
      at?: string;
    };

const EVENT = 'pl-chat';

export function emitChatRealtime(event: ChatRealtimeEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: event }));
}

export function subscribeChatRealtime(handler: (event: ChatRealtimeEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<ChatRealtimeEvent>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}

let sseOpen = false;

export function setRealtimeOpen(open: boolean) {
  sseOpen = open;
}

export function isRealtimeOpen() {
  return sseOpen;
}
