import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Ban, Loader2 } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { PrivacySearchBox } from '@/src/components/social/PrivacySearchBox';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { LoadingBlock } from '@/src/components/ui/Spinner';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { blockUser, fetchBlocked, unblockUser, type PrivacyPerson } from '@/src/lib/privacyApi';
import { usePeopleSearch } from '@/src/lib/usePeopleSearch';

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
  const [q, setQ] = useState('');
  const { hits, searching } = usePeopleSearch(open, q);

  const reload = () =>
    fetchBlocked()
      .then(r => setPeople(Array.isArray(r.people) ? r.people : []))
      .catch(() => setPeople([]));

  useEffect(() => {
    if (!open) {
      setQ('');
      return;
    }
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [open]);

  const blockedIds = new Set(people.map(p => p.id));

  const block = async (person: PrivacyPerson) => {
    setBusyId(person.id);
    try {
      await blockUser(person.id);
      setPeople(prev => (prev.some(p => p.id === person.id) ? prev : [person, ...prev]));
      setQ('');
    } finally {
      setBusyId(null);
    }
  };

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await unblockUser(id);
      setPeople(prev => prev.filter(p => p.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const needle = q.trim();

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      center
      frost
      title="Bloqueados"
      subtitle="Si le bloqueas dejáis de seguiros. No os veis ni podéis chatear."
    >
      <PrivacySearchBox value={q} onChange={setQ} placeholder="Busca a quien quieres bloquear" />

      {needle ? (
        searching && hits.length === 0 ? (
          <LoadingBlock className="py-10" />
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/55">Nadie con ese nombre.</p>
        ) : (
          <div className="space-y-1">
            {hits.map((person, i) => {
              const already = blockedIds.has(person.id) || person.blocked === 'you';
              return (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.2, ease: EASE_OUT }}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2"
                >
                  <Avatar name={person.name} avatar={person.avatar ?? null} size={44} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                    {person.name}
                  </span>
                  {person.blocked === 'them' ? (
                    <span className="shrink-0 text-[11px] font-medium text-white/45">Te ha bloqueado</span>
                  ) : already ? (
                    <button
                      type="button"
                      disabled={busyId === person.id}
                      onClick={() => void unblock(person.id)}
                      className="min-h-11 shrink-0 rounded-full bg-white/12 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {busyId === person.id ? <Loader2 size={14} className="animate-spin" /> : 'Desbloquear'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === person.id}
                      onClick={() => void block({ id: person.id, name: person.name, avatar: person.avatar })}
                      className="min-h-11 shrink-0 rounded-full bg-rose-500/90 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {busyId === person.id ? <Loader2 size={14} className="animate-spin" /> : 'Bloquear'}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )
      ) : loading && people.length === 0 ? (
        <LoadingBlock className="py-10" />
      ) : people.length === 0 ? (
        <div className="px-2 py-10 text-center">
          <Ban size={26} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm font-semibold text-white/80">Nadie bloqueado</p>
          <p className="mt-1 text-xs text-white/40">Busca arriba a alguien para bloquearlo.</p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Bloqueados
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
