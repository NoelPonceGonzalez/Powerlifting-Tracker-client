import React, { useEffect, useState } from 'react';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { CloseFriendButton } from '@/src/components/social/CloseFriendButton';
import { InstagramCover } from '@/src/components/social/ProgressMiniProfile';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { LoadingBlock } from '@/src/components/ui/Spinner';
import { apiDelete } from '@/src/lib/api';
import { fetchProfile, type PublicProfile } from '@/src/lib/feedApi';

export type PeekPerson = { id: string; name: string; avatar?: string | null };

export function PersonPeekModal({
  person,
  persist,
  onClose,
  onOpenFull,
  onOpenChat,
  onSendRequest,
  onUnfriend,
}: {
  person: PeekPerson | null;
  persist?: boolean;
  onClose: () => void;
  onOpenFull: (person: PeekPerson) => void;
  onOpenChat?: (userId: string) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onUnfriend?: (userId: string) => Promise<void>;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [blocked, setBlocked] = useState<'you' | 'them' | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!person) {
      setProfile(null);
      setBlocked(null);
      setConfirmLeave(false);
      return;
    }
    let live = true;
    setLoading(true);
    setBlocked(null);
    setConfirmLeave(false);
    setProfile(null);
    fetchProfile(person.id)
      .then(p => {
        if (live) setProfile(p);
      })
      .catch((e: unknown) => {
        if (!live) return;
        const msg = String((e as { message?: string })?.message || '');
        if (/te ha bloqueado/i.test(msg)) setBlocked('them');
        else if (/has bloqueado/i.test(msg)) setBlocked('you');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [person?.id]);

  const linked =
    !!profile &&
    !profile.isSelf &&
    blocked == null &&
    (profile.isFriend || profile.friendshipStatus === 'following' || profile.friendshipStatus === 'accepted');

  const dropFriend = async () => {
    if (!person) return;
    setBusy(true);
    try {
      if (onUnfriend) await onUnfriend(person.id);
      else await apiDelete(`/api/social/friends/${person.id}`);
      const fresh = await fetchProfile(person.id).catch(() => null);
      if (fresh) setProfile(fresh);
      else {
        setProfile(prev =>
          prev
            ? { ...prev, isFriend: false, friendshipStatus: 'none', friendshipDirection: null, canSendRequest: true }
            : prev
        );
      }
      setConfirmLeave(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open={!!person}
      onClose={onClose}
      persist={persist}
      center
      title={profile?.name || person?.name || 'Perfil'}
      titleExtra={
        person && linked ? (
          <button
            type="button"
            onClick={() => onOpenFull(person)}
            className="shrink-0 text-[12px] font-semibold text-indigo-600 dark:text-indigo-300"
          >
            Ver perfil completo
          </button>
        ) : undefined
      }
      subtitle={profile?.coach ? `Entrena con ${profile.coach.name}` : undefined}
      footer={
        person ? (
          confirmLeave ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" disabled={busy} onClick={() => setConfirmLeave(false)}>
                Cancelar
              </Button>
              <Button variant="danger" className="flex-1 rounded-xl" disabled={busy} onClick={() => void dropFriend()}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <UserMinus size={16} />}
                Dejar de ser amigo
              </Button>
            </div>
          ) : (
          <div className="flex gap-2">
            {linked && (
              <CloseFriendButton
                userId={person.id}
                name={profile.name}
                avatar={profile.avatar || person.avatar}
              />
            )}
            {linked && (
              <Button
                variant="outline"
                className="rounded-xl px-3"
                aria-label="Dejar de ser amigo"
                onClick={() => setConfirmLeave(true)}
              >
                <UserMinus size={16} />
              </Button>
            )}
            {blocked === 'them' ? (
              <p className="py-2 text-center text-sm font-medium text-slate-500">Te ha bloqueado</p>
            ) : blocked === 'you' ? (
              <p className="py-2 text-center text-sm font-medium text-slate-500">Has bloqueado a esta persona</p>
            ) : profile?.canSendRequest || profile?.friendshipStatus === 'follower' ? (
              <Button
                variant="primary"
                className="flex-1 rounded-xl"
                disabled={busy || !onSendRequest}
                onClick={async () => {
                  if (!onSendRequest) return;
                  setBusy(true);
                  try {
                    await onSendRequest(person.id);
                    setProfile(prev =>
                      prev
                        ? { ...prev, canSendRequest: false, friendshipStatus: 'pending', friendshipDirection: 'outgoing' }
                        : prev
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                Seguir
              </Button>
            ) : (
              <Button
                variant="primary"
                className="flex-1 rounded-xl"
                onClick={() => onOpenChat?.(person.id)}
              >
                Escribir
              </Button>
            )}
          </div>
          )
        ) : undefined
      }
    >
      {person && (
        <div>
          {blocked ? null : (
            <InstagramCover
              name={profile?.name || person.name}
              username={profile?.username}
              userId={person.id}
              avatar={profile?.avatar || person.avatar}
              marcas={profile?.trainingMaxes?.length ?? 0}
              followers={profile?.followerCount ?? 0}
              following={profile?.followingCount ?? 0}
              bio={profile?.bio || ''}
            />
          )}
          {loading && !profile ? (
            <LoadingBlock className="py-4" />
          ) : profile ? null : (
            <p className="py-8 text-center text-sm text-slate-400">
              {blocked === 'them' ? 'Te ha bloqueado.' : blocked === 'you' ? 'Has bloqueado a esta persona.' : 'No se ha podido cargar.'}
            </p>
          )}
        </div>
      )}
    </GlassModal>
  );
}
