import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { SettingsView } from '@/src/views/Settings';
import type { AccountSummary } from '@/src/lib/savedAccounts';
import type { User } from '@/src/types';

interface ProfileViewProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
  onLogout: () => void;
  savedAccountSummaries?: AccountSummary[];
  onSwitchAccount?: (userId: string) => void;
  onAddAccount?: () => void;
  onRemoveSavedAccount?: (userId: string) => void;
  /** Volver al perfil de Progreso. */
  onBackToProfile: () => void;
}

/** Solo ajustes. El perfil propio vive en la pestaña Perfil (antes Progreso). */
export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
  savedAccountSummaries,
  onSwitchAccount,
  onAddAccount,
  onRemoveSavedAccount,
  onBackToProfile,
}) => {
  return (
    <div>
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
        <button
          type="button"
          onClick={onBackToProfile}
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
};
