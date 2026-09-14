import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Settings as SettingsIcon, Users, Trophy } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ProfileScreen } from '@/src/components/social/ProfileScreen';
import { SettingsView } from '@/src/views/Settings';
import type { AccountSummary } from '@/src/lib/savedAccounts';
import type { User } from '@/src/types';
import { SCREEN_TRANSITION, VIEW_TRANSITION } from '@/src/lib/motionPresets';

interface ProfileViewProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
  onLogout: () => void;
  savedAccountSummaries?: AccountSummary[];
  onSwitchAccount?: (userId: string) => void;
  onAddAccount?: () => void;
  onRemoveSavedAccount?: (userId: string) => void;
  /** Ir a Inicio para publicar la primera foto. */
  onGoToFeed?: () => void;
  onGoToFriends?: () => void;
  onGoToChallenges?: () => void;
  pendingFriendCount?: number;
  /** Cada incremento abre directamente los ajustes (p. ej. al añadir una cuenta). */
  openSettingsSignal?: number;
}

/**
 * Pestaña Perfil: tu ficha social de cara al resto y, detrás del engranaje, los ajustes
 * de la cuenta. Antes eran dos sitios distintos.
 */
export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
  savedAccountSummaries,
  onSwitchAccount,
  onAddAccount,
  onRemoveSavedAccount,
  onGoToFeed,
  onGoToFriends,
  onGoToChallenges,
  pendingFriendCount = 0,
  openSettingsSignal = 0,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (openSettingsSignal > 0) setShowSettings(true);
  }, [openSettingsSignal]);

  if (showSettings) {
    return (
      <div>
        <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400"
          >
            <ArrowLeft size={16} />
            Perfil
          </button>
        </div>
        <SettingsView
          user={user}
          onUpdateUser={onUpdateUser}
          onLogout={onLogout}
          savedAccountSummaries={savedAccountSummaries}
          onSwitchAccount={onSwitchAccount}
          onAddAccount={onAddAccount}
          onRemoveSavedAccount={onRemoveSavedAccount}
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={VIEW_TRANSITION}
      className="mx-auto max-w-2xl px-4 py-6 pb-28 text-slate-900 sm:px-6 sm:py-8 sm:pb-32 dark:text-slate-100"
    >
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Perfil</h1>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="Ajustes"
          aria-label="Ajustes"
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <SettingsIcon size={18} />
        </button>
      </header>

      <ProfileScreen
        userId={user.id}
        onOpenProfile={id => setViewingProfileId(id)}
        onGoToFeed={onGoToFeed}
      />

      <div className="mt-5 space-y-2">
        {onGoToFriends && (
          <button
            type="button"
            onClick={onGoToFriends}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left dark:border-slate-700 dark:bg-slate-900"
          >
            <Users size={18} className="text-slate-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Amigos</span>
              <span className="block text-xs text-slate-500">Solicitudes y gente que sigues</span>
            </span>
            {pendingFriendCount > 0 && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
                {pendingFriendCount}
              </span>
            )}
          </button>
        )}
        {onGoToChallenges && (
          <button
            type="button"
            onClick={onGoToChallenges}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left dark:border-slate-700 dark:bg-slate-900"
          >
            <Trophy size={18} className="text-amber-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Torneos</span>
              <span className="block text-xs text-slate-500">Compite con amigos</span>
            </span>
          </button>
        )}
      </div>

      {viewingProfileId && viewingProfileId !== user.id && typeof document !== 'undefined' &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={SCREEN_TRANSITION}
            className="fixed inset-0 overflow-y-auto bg-slate-50 dark:bg-slate-950"
            style={{ zIndex: 99000 }}
          >
            <div className="mx-auto max-w-2xl px-4 py-5 pb-28">
              <ProfileScreen
                userId={viewingProfileId}
                onBack={() => setViewingProfileId(null)}
                onOpenProfile={id => setViewingProfileId(id)}
              />
            </div>
          </motion.div>,
          document.body
        )}
    </motion.div>
  );
};
