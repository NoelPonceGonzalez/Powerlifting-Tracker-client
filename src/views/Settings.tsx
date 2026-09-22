import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  User as UserIcon,
  Camera,
  Image as ImageIcon,
  Weight,
  Moon,
  Sun,
  LogOut,
  Plus,
  Check,
  X,
  Crop,
  Sparkles,
  Handshake,
  Ban,
  ChevronRight,
  Bell,
  Smartphone,
  Shield,
  KeyRound,
} from 'lucide-react';
import { apiPost } from '@/src/lib/api';
import { CloseFriendsModal } from '@/src/components/social/CloseFriendsModal';
import { BlockedUsersModal } from '@/src/components/social/BlockedUsersModal';
import { PwaSettingsSection } from '@/src/components/PwaSettingsSection';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { AvatarCropModal } from '@/src/components/AvatarCropModal';
import { StoryCamera } from '@/src/components/social/StoryCamera';
import { User } from '@/src/types';
import type { AccountSummary } from '@/src/lib/savedAccounts';
import { cn } from '@/src/lib/utils';
import { VIEW_TRANSITION } from '@/src/lib/motionPresets';
import { hasRealAvatar } from '@/src/lib/avatar';
import { downscaleForCrop } from '@/src/lib/avatarCrop';

interface SettingsViewProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
  onLogout: () => void;
  savedAccountSummaries?: AccountSummary[];
  onSwitchAccount?: (userId: string) => void;
  onAddAccount?: () => void;
  onRemoveSavedAccount?: (userId: string) => void;
}

function SettingsGlass({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-white/50 bg-white/75 shadow-xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/65',
        className
      )}
    >
      <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-indigo-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" />
      <div className="relative">{children}</div>
    </div>
  );
}

function SettingsHead({
  icon,
  title,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  tone: 'privacy' | 'body' | 'account' | 'perms' | 'look';
}) {
  const tones: Record<typeof tone, string> = {
    privacy: 'from-emerald-500 to-teal-600 shadow-emerald-500/25',
    body: 'from-violet-500 to-indigo-600 shadow-violet-500/25',
    account: 'from-indigo-500 to-violet-600 shadow-indigo-500/25',
    perms: 'from-sky-500 to-blue-600 shadow-sky-500/25',
    look: 'from-amber-400 to-orange-500 shadow-amber-400/25',
  };
  return (
    <div className="mb-3 flex items-center gap-3 px-1">
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md', tones[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
  savedAccountSummaries = [],
  onSwitchAccount,
  onAddAccount,
  onRemoveSavedAccount,
}) => {
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarCam, setAvatarCam] = useState(false);
  const photoMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!photoMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target as Node)) {
        setPhotoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [photoMenuOpen]);

  const [cropImage, setCropImage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [closingSessions, setClosingSessions] = useState(false);
  const reminderOn = user.workoutReminderOn !== false;
  const reminderTime = user.workoutReminderTime || '10:00';

  React.useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== user.timezone) onUpdateUser({ timezone: tz });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const originalImageRef = useRef<string | null>(null);

  const handleAvatarFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Elige una imagen (JPG, PNG o WEBP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPhotoError('La foto pesa demasiado (máx. 20 MB).');
      return;
    }
    setPhotoError('');
    try {
      const dataUrl = await downscaleForCrop(file);
      originalImageRef.current = dataUrl;
      setCropImage(dataUrl);
    } catch {
      setPhotoError('No se ha podido abrir esa foto.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={VIEW_TRANSITION}
      className="app-page mx-auto max-w-2xl text-slate-900 dark:text-slate-100"
    >
      <header className="mb-7">
        <p className="text-[11px] font-medium text-slate-400">Tu perfil</p>
        <h1 className="text-[22px] font-black tracking-tight text-slate-900 dark:text-slate-100">Ajustes</h1>
      </header>

      <div className="space-y-7">
        <section>
          <SettingsHead
            tone="privacy"
            icon={<Shield size={20} />}
            title="Privacidad"
            hint="Quién te ve y a quién no dejas entrar"
          />
          <SettingsGlass>
            <button
              type="button"
              onClick={() => setCloseFriendsOpen(true)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Handshake size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Mejores amigos</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Historias, gym y torneos privados</span>
              </span>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
            </button>
            <button
              type="button"
              onClick={() => setBlockedOpen(true)}
              className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100/80 px-4 py-3.5 text-left dark:border-white/10"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
                <Ban size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Bloqueados</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Desbloquear a alguien</span>
              </span>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
            </button>
          </SettingsGlass>
        </section>

        <section>
          <SettingsHead
            tone="body"
            icon={<Weight size={20} />}
            title="Datos físicos"
            hint="Sirven para los puntos justos de los torneos"
          />
          <SettingsGlass className="p-4 sm:p-5">
            <div className="flex items-end justify-between gap-4">
              <label className="min-w-0">
                <span className="mb-1.5 block text-[11px] font-semibold text-slate-400">Peso</span>
                <span className="flex items-baseline gap-1.5">
                  <input
                    type="number"
                    value={user.bodyWeight}
                    onChange={(e) => onUpdateUser({ bodyWeight: parseFloat(e.target.value) || 0 })}
                    className="w-20 bg-transparent text-3xl font-black tracking-tight text-slate-900 focus:outline-none dark:text-slate-100"
                  />
                  <span className="text-sm font-semibold text-slate-400">kg</span>
                </span>
              </label>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold text-slate-400">Género</p>
              <div className="grid grid-cols-2 gap-2">
                {(['hombre', 'mujer'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onUpdateUser({ gender: g })}
                    className={cn(
                      'rounded-2xl px-3 py-2.5 text-sm font-semibold',
                      user.gender === g
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    {g === 'hombre' ? 'Hombre' : 'Mujer'}
                  </button>
                ))}
              </div>
            </div>
          </SettingsGlass>
        </section>

        <section>
          <SettingsHead
            tone="account"
            icon={<UserIcon size={20} />}
            title="Cuenta"
            hint="Foto, nombre y sesiones en este móvil"
          />
          <SettingsGlass className="p-4 sm:p-5">
            {(onSwitchAccount || onAddAccount) && (
              <div className="mb-5 space-y-2">
                <p className="px-1 text-[11px] font-semibold text-slate-400">En este dispositivo</p>
                {savedAccountSummaries.map((acc) => {
                  const isActive = acc.id === user.id;
                  return (
                    <div
                      key={acc.id}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-3 py-2.5',
                        isActive
                          ? 'bg-indigo-50/90 ring-1 ring-indigo-300 dark:bg-indigo-950/40 dark:ring-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800/70'
                      )}
                    >
                      <Avatar
                        src={acc.avatar}
                        userId={acc.id}
                        name={acc.name}
                        className="h-11 w-11 shrink-0 rounded-2xl border-2 border-white dark:border-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{acc.name}</p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{acc.email}</p>
                      </div>
                      {isActive ? (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          <Check size={14} /> Tú
                        </span>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1">
                          {onSwitchAccount && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full text-xs"
                              onClick={(e) => { e.stopPropagation(); onSwitchAccount(acc.id); }}
                              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onSwitchAccount(acc.id); }}
                            >
                              Usar
                            </Button>
                          )}
                          {onRemoveSavedAccount && (
                            <button
                              type="button"
                              title="Quitar de este dispositivo"
                              onClick={() => onRemoveSavedAccount(acc.id)}
                              className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {onAddAccount && (
                  <button
                    type="button"
                    onClick={onAddAccount}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                  >
                    <Plus size={16} />
                    Añadir otra cuenta
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div ref={photoMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPhotoMenuOpen((o) => !o)}
                  className={cn(
                    'group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
                    photoMenuOpen && 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900'
                  )}
                  aria-expanded={photoMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Cambiar foto de perfil: galería o cámara"
                >
                  <Avatar
                    src={user.avatar}
                    userId={user.id}
                    name={user.name}
                    className="pointer-events-none h-[5.5rem] w-[5.5rem] rounded-full border-2 border-white shadow-lg dark:border-slate-700"
                  />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/30 group-active:bg-black/35">
                    <span className="flex flex-col items-center gap-0.5 text-[10px] font-bold uppercase tracking-tight text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100">
                      <Camera size={20} strokeWidth={2} />
                      Foto
                    </span>
                  </span>
                </button>
                {photoMenuOpen && (
                  <div
                    className="absolute left-1/2 top-full z-30 mt-2 min-w-[200px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-600 dark:bg-slate-800 sm:left-0 sm:translate-x-0"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/80"
                      onClick={() => {
                        galleryInputRef.current?.click();
                        setPhotoMenuOpen(false);
                      }}
                    >
                      <ImageIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Galería
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/80"
                      onClick={() => {
                        setAvatarCam(true);
                        setPhotoMenuOpen(false);
                      }}
                    >
                      <Camera size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Hacer foto
                    </button>
                    {hasRealAvatar(user.avatar, user.id) && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/80"
                        onClick={() => {
                          setCropImage(originalImageRef.current || user.avatar!);
                          setPhotoMenuOpen(false);
                        }}
                      >
                        <Crop size={18} className="text-indigo-600 dark:text-indigo-400" />
                        Ajustar foto actual
                      </button>
                    )}
                  </div>
                )}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif"
                  className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
                  onChange={(e) => {
                    handleAvatarFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="min-w-0 w-full flex-1 space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">Nombre</label>
                  <Input
                    value={user.name}
                    onChange={(e) => onUpdateUser({ name: e.target.value })}
                    className="font-semibold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">Correo</label>
                  <Input
                    value={user.email}
                    disabled
                    className="cursor-not-allowed bg-slate-50 font-medium text-slate-400"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t border-slate-100/80 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <Bell size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recordatorio de entreno</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Si hoy toca, te avisamos</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reminderOn}
                  onClick={() => onUpdateUser({ workoutReminderOn: !reminderOn })}
                  className={cn(
                    'relative h-8 w-14 shrink-0 rounded-full p-1',
                    reminderOn ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'
                  )}
                >
                  <span className={cn('block h-6 w-6 rounded-full bg-white transition-transform', reminderOn ? 'translate-x-6' : 'translate-x-0')} />
                </button>
              </div>
              {reminderOn && (
                <label className="block pl-[3.25rem]">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Hora</span>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={e => onUpdateUser({ workoutReminderTime: e.target.value || '10:00' })}
                    className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-3 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </label>
              )}
              <button
                type="button"
                disabled={closingSessions}
                onClick={async () => {
                  if (!window.confirm('Se cierra la sesión en los demás móviles. Este se queda abierto.')) return;
                  setClosingSessions(true);
                  try {
                    const res = await apiPost<{ token: string }>('/api/auth/logout-others', {});
                    if (res?.token) localStorage.setItem('auth_token', res.token);
                    window.alert('Listo. Los otros dispositivos tendrán que entrar de nuevo.');
                  } catch (e: any) {
                    window.alert(e?.message || 'No se ha podido hacer');
                  } finally {
                    setClosingSessions(false);
                  }
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 text-left dark:bg-slate-800/80"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm dark:bg-slate-700 dark:text-slate-300">
                  <Smartphone size={16} />
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {closingSessions ? 'Cerrando…' : 'Cerrar otras sesiones'}
                </span>
              </button>
            </div>
          </SettingsGlass>
        </section>

        <section>
          <SettingsHead
            tone="perms"
            icon={<KeyRound size={20} />}
            title="Permisos"
            hint="Instalación, avisos, cámara y galería"
          />
          <SettingsGlass className="p-4 sm:p-5">
            <PwaSettingsSection embedded />
          </SettingsGlass>
        </section>

        <section>
          <SettingsHead
            tone="look"
            icon={user.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            title="Apariencia"
            hint="Claro, oscuro y el acento rosa"
          />
          <SettingsGlass className="space-y-1 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-2xl',
                    user.theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-600'
                  )}
                >
                  {user.theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Modo {user.theme === 'dark' ? 'oscuro' : 'claro'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">El fondo de la app</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateUser({ theme: user.theme === 'light' ? 'dark' : 'light' })}
                className={cn(
                  'relative h-8 w-14 shrink-0 rounded-full p-1',
                  user.theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                )}
              >
                <motion.div
                  animate={{ x: user.theme === 'dark' ? 24 : 0 }}
                  className="h-6 w-6 rounded-full bg-white shadow-sm dark:bg-slate-200"
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100/80 py-3 dark:border-white/10">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-2xl',
                    user.mbMode
                      ? 'bg-pink-500 text-white shadow-md shadow-pink-200/50 dark:bg-pink-600'
                      : 'bg-pink-50 text-pink-400 dark:bg-pink-950/45 dark:text-pink-300/90'
                  )}
                >
                  <Sparkles size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Rosa</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Acento, da igual el modo</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user.mbMode}
                onClick={() => onUpdateUser({ mbMode: !user.mbMode })}
                className={cn(
                  'relative h-8 w-14 shrink-0 rounded-full p-1',
                  user.mbMode ? 'bg-pink-500 dark:bg-pink-600' : 'bg-slate-200 dark:bg-slate-600'
                )}
              >
                <motion.div
                  animate={{ x: user.mbMode ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="h-6 w-6 rounded-full bg-white shadow-md"
                />
              </button>
            </div>
          </SettingsGlass>
        </section>

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-[28px] border border-rose-100 bg-rose-50/80 py-4 text-sm font-semibold text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>

      {photoError && (
        <p className="mt-3 text-center text-xs font-semibold text-rose-500">{photoError}</p>
      )}

      <CloseFriendsModal open={closeFriendsOpen} onClose={() => setCloseFriendsOpen(false)} />
      <BlockedUsersModal open={blockedOpen} onClose={() => setBlockedOpen(false)} />

      <StoryCamera
        open={avatarCam}
        mode="avatar"
        onClose={() => setAvatarCam(false)}
        onPickImage={file => {
          setAvatarCam(false);
          void handleAvatarFile(file);
        }}
      />

      <AvatarCropModal
        image={cropImage}
        onCancel={() => setCropImage(null)}
        onConfirm={(dataUrl) => {
          onUpdateUser({ avatar: dataUrl });
          setCropImage(null);
        }}
      />
    </motion.div>
  );
};
