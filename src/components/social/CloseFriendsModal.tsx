import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Handshake } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { CloseFriendButton } from '@/src/components/social/CloseFriendButton';
import { PrivacySearchBox } from '@/src/components/social/PrivacySearchBox';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { LoadingBlock } from '@/src/components/ui/Spinner';
import { EASE_OUT } from '@/src/lib/motionPresets';
import {
  getCloseFriends,
  hydrateCloseFriends,
  subscribeCloseFriends,
  type PrivacyPerson,
} from '@/src/lib/privacyApi';
import { usePeopleSearch } from '@/src/lib/usePeopleSearch';

function canAddClose(status?: string | null) {
  return status === 'accepted' || status === 'following';
}

export function CloseFriendsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<PrivacyPerson[]>(() => getCloseFriends());
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const { hits, searching } = usePeopleSearch(open, q);

  useEffect(() => {
    const unsub = subscribeCloseFriends(() => setPeople(getCloseFriends()));
    return unsub;
  }, []);

  useEffect(() => {
    if (!open) {
      setQ('');
      return;
    }
    setLoading(true);
    void hydrateCloseFriends()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const needle = q.trim();
  const closeIds = new Set(people.map(p => p.id));

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      center
      frost
      title="Mejores amigos"
      subtitle="Busca a quien sigues para añadirlo. Solo ellos ven lo privado."
    >
      <PrivacySearchBox value={q} onChange={setQ} placeholder="Busca a quien sigues" />

      {needle ? (
        searching && hits.length === 0 ? (
          <LoadingBlock className="py-10" />
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/55">Nadie con ese nombre.</p>
        ) : (
          <div className="space-y-1">
            {hits.map((person, i) => {
              const allowed = closeIds.has(person.id) || canAddClose(person.friendshipStatus);
              return (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.2, ease: EASE_OUT }}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2"
                >
                  <Avatar name={person.name} avatar={person.avatar ?? null} userId={person.id} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-white">{person.name}</span>
                    {!allowed && (
                      <span className="block text-[12px] text-white/45">Sigue a esta persona para añadirla</span>
                    )}
                  </span>
                  {allowed ? (
                    <CloseFriendButton
                      userId={person.id}
                      name={person.name}
                      avatar={person.avatar}
                      className="bg-white/10 text-emerald-300"
                    />
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        )
      ) : loading && people.length === 0 ? (
        <LoadingBlock className="py-10" />
      ) : people.length === 0 ? (
        <div className="px-2 py-10 text-center">
          <Handshake size={26} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm font-semibold text-white/80">Aún no hay nadie</p>
          <p className="mt-1 text-xs text-white/40">Busca arriba a alguien a quien ya sigues.</p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            En la lista
          </p>
          <AnimatePresence initial={false}>
            {people.map((person, i) => (
              <motion.div
                key={person.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.2, ease: EASE_OUT }}
                className="flex items-center gap-3 rounded-2xl px-2 py-2"
              >
                <Avatar name={person.name} avatar={person.avatar ?? null} userId={person.id} size={44} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                  {person.name}
                </span>
                <CloseFriendButton
                  userId={person.id}
                  name={person.name}
                  avatar={person.avatar}
                  className="bg-white/10 text-emerald-300"
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </GlassModal>
  );
}
