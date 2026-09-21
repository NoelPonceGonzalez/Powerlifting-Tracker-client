import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { ChatPeoplePanel } from '@/src/components/social/ChatPeoplePanel';
import { PersonPeekModal, type PeekPerson } from '@/src/components/social/PersonPeekModal';
import { ProfileScreen } from '@/src/components/social/ProfileScreen';

export function ConnectionsOverlay({
  myId,
  filter,
  onClose,
  onSendRequest,
  onOpenChat,
}: {
  myId: string;
  filter: 'followers' | 'following';
  onClose: () => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onOpenChat?: (userId: string) => void;
}) {
  const [peek, setPeek] = useState<PeekPerson | null>(null);
  const [fullId, setFullId] = useState<string | null>(null);

  const closeFull = () => {
    setFullId(null);
    setPeek(null);
  };
  const closePeek = () => {
    setFullId(null);
    setPeek(null);
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fullId) closeFull();
      else if (peek) closePeek();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullId, peek, onClose]);

  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--app-bg)]">
          <div className="app-page mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 pb-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-12 min-w-12 items-center gap-2 rounded-full py-2 pr-2 text-slate-500"
                aria-label="Volver al perfil"
              >
                <ArrowLeft size={18} />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {filter === 'followers' ? 'Seguidores' : 'Seguidos'}
                </span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatPeoplePanel
                myId={myId}
                pending={[]}
                friends={[]}
                friendIds={[]}
                page="friends"
                friendsFilter={filter}
                onPageChange={() => {}}
                onAccept={() => {}}
                onReject={() => {}}
                onSendRequest={onSendRequest}
                onOpenPerson={person => setPeek(person)}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      <PersonPeekModal
        person={fullId ? null : peek}
        onClose={closePeek}
        onOpenFull={person => {
          setPeek(null);
          setFullId(person.id);
        }}
        onSendRequest={onSendRequest}
        onOpenChat={id => {
          onClose();
          onOpenChat?.(id);
        }}
      />

      {fullId &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--app-bg)]">
            <div className="app-page mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
              <ProfileScreen
                userId={fullId}
                onBack={closeFull}
                onOpenProfile={id => setFullId(id)}
                onOpenChat={id => {
                  onClose();
                  onOpenChat?.(id);
                }}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
