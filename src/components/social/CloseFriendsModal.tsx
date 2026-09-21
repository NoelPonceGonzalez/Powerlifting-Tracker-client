import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Handshake } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { CloseFriendButton } from '@/src/components/social/CloseFriendButton';
import { EASE_OUT } from '@/src/lib/motionPresets';
import {
  getCloseFriends,
  hydrateCloseFriends,
  subscribeCloseFriends,
  type PrivacyPerson,
} from '@/src/lib/privacyApi';

export function CloseFriendsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<PrivacyPerson[]>(() => getCloseFriends());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeCloseFriends(() => setPeople(getCloseFriends()));
    return unsub;
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void hydrateCloseFriends()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      center
      frost
      title="Mejores amigos"
      subtitle="Solo ellos ven lo que marques para esta lista"
    >
      {loading && people.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/45">Cargando…</p>
      ) : people.length === 0 ? (
        <div className="px-2 py-10 text-center">
          <Handshake size={26} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm font-semibold text-white/80">Aún no hay nadie</p>
          <p className="mt-1 text-xs text-white/40">
            Añade a quien sigues desde su perfil o desde Seguidores / Siguiendo.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
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
                <Avatar name={person.name} avatar={person.avatar ?? null} size={44} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                  {person.name}
                </span>
                <CloseFriendButton userId={person.id} className="bg-white/10 text-emerald-300" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </GlassModal>
  );
}
