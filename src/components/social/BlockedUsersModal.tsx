import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Ban } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { fetchBlocked, unblockUser, type PrivacyPerson } from '@/src/lib/privacyApi';

export function BlockedUsersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<PrivacyPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetchBlocked()
      .then(r => setPeople(Array.isArray(r.people) ? r.people : []))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, [open]);

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await unblockUser(id);
      setPeople(prev => prev.filter(p => p.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      center
      frost
      title="Bloqueados"
      subtitle="No ven tus historias, chat ni avisos del gym"
    >
      {loading && people.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/45">Cargando…</p>
      ) : people.length === 0 ? (
        <div className="px-2 py-10 text-center">
          <Ban size={26} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm font-semibold text-white/80">Nadie bloqueado</p>
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
                <button
                  type="button"
                  disabled={busyId === person.id}
                  onClick={() => void unblock(person.id)}
                  className="min-h-11 shrink-0 rounded-full bg-white/12 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  Desbloquear
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </GlassModal>
  );
}
