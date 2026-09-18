import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Camera, Image as ImageIcon, Weight, Moon, Sun, LogOut, Users, Plus, Check, X, Crop, Sparkles } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { PwaSettingsSection } from '@/src/components/PwaSettingsSection';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { AvatarCropModal } from '@/src/components/AvatarCropModal';
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
  /** Cuentas guardadas en el dispositivo (sin token). */
  savedAccountSummaries?: AccountSummary[];
  onSwitchAccount?: (userId: string) => void;
  onAddAccount?: () => void;
  /** Quitar sesión guardada de este dispositivo (no borra la cuenta en el servidor). */
  onRemoveSavedAccount?: (userId: string) => void;
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
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
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
      className="mx-auto max-w-2xl pt-4 text-slate-900 dark:text-slate-100"
    >
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Ajustes</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Cuenta, aspecto y avisos</p>
      </header>

      <div className="mb-8">
        <PwaSettingsSection />
      </div>

      <div className="space-y-8">
        {/* Profile Section: cuenta(s) en este dispositivo + foto (tocar imagen) + datos */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <UserIcon className="text-white" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cuenta</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Cambia de cuenta o edita tu foto y nombre.
              </p>
            </div>
          </div>

          <Card padding="lg" rounded="2xl" className="space-y-6">
            {(onSwitchAccount || onAddAccount) && (
              <div className="space-y-3 pb-6 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Users className="text-violet-600 dark:text-violet-400" size={18} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Cuentas en este dispositivo
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cambia de perfil sin volver a escribir la contraseña.
                </p>
                <div className="space-y-2">
                  {savedAccountSummaries.map((acc) => {
                    const isActive = acc.id === user.id;
                    return (
                      <div
                        key={acc.id}
                        className={cn(
                          'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
                          isActive
                            ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 dark:border-indigo-600'
                            : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        )}
                      >
                        <Avatar
                          src={acc.avatar}
                          name={acc.name}
                          className="w-11 h-11 rounded-xl border-2 border-white dark:border-slate-700 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm">{acc.name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{acc.email}</p>
                        </div>
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                            <Check size={14} /> Activa
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {onSwitchAccount && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-xs font-black uppercase"
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
                                className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <X size={18} />
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
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-sm hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 transition-colors"
                    >
                      <Plus size={18} />
                      Añadir otra cuenta
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              <div ref={photoMenuRef} className="relative flex-shrink-0 mx-auto sm:mx-0">
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
                    name={user.name}
                    className="w-24 h-24 rounded-full border-2 border-slate-100 dark:border-slate-700 shadow-xl pointer-events-none"
                  />
                  <span
                    className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/25 group-active:bg-black/35 transition-colors flex items-center justify-center"
                    aria-hidden
                  >
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-0.5 text-white text-[10px] font-black uppercase tracking-tight drop-shadow">
                      <Camera size={22} strokeWidth={2} />
                      Tocar
                    </span>
                  </span>
                </button>
                {photoMenuOpen && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-full mt-2 z-30 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
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
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
                      onClick={() => {
                        cameraInputRef.current?.click();
                        setPhotoMenuOpen(false);
                      }}
                    >
                      <Camera size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Hacer foto
                    </button>
                    {hasRealAvatar(user.avatar) && (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
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
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleAvatarFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    handleAvatarFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="flex-1 space-y-4 min-w-0">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Foto de perfil</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Toca la imagen para elegir galería o cámara.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de Usuario</label>
                  <Input 
                    value={user.name} 
                    onChange={(e) => onUpdateUser({ name: e.target.value })}
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                  <Input 
                    value={user.email} 
                    disabled
                    className="bg-slate-50 text-slate-400 font-medium cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Physical Stats */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-600 p-2 rounded-xl">
              <Weight className="text-white" size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Datos Físicos</h2>
          </div>

          <Card padding="lg" rounded="2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peso Corporal</label>
                <div className="flex items-baseline gap-2">
                  <input 
                    type="number"
                    value={user.bodyWeight}
                    onChange={(e) => onUpdateUser({ bodyWeight: parseFloat(e.target.value) || 0 })}
                    className="text-3xl font-black text-slate-900 dark:text-slate-100 bg-transparent w-24 focus:outline-none"
                  />
                  <span className="text-slate-400 font-bold uppercase text-sm">kg</span>
                </div>
              </div>
              <p className="max-w-[200px] text-xs text-slate-400 sm:text-right">
                Tu peso y tu género se usan para los puntos justos de los torneos.
              </p>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Género</label>
              <div className="mt-2 flex gap-2">
                {(['hombre', 'mujer'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onUpdateUser({ gender: g })}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-sm font-bold capitalize',
                      user.gender === g
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    )}
                  >
                    {g === 'hombre' ? 'Hombre' : 'Mujer'}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </section>

        {/* Appearance */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-500 p-2 rounded-xl">
              <Sun className="text-white" size={20} />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Apariencia</h2>
          </div>

          <Card padding="md" rounded="2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  user.theme === 'dark' ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-600"
                )}>
                  {user.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">Modo {user.theme === 'dark' ? 'Oscuro' : 'Claro'}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Cambia el aspecto visual de la app</p>
                </div>
              </div>
              <button 
                onClick={() => onUpdateUser({ theme: user.theme === 'light' ? 'dark' : 'light' })}
                className={cn(
                  "w-14 h-8 rounded-full p-1 transition-colors relative",
                  user.theme === 'dark' ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <motion.div 
                  animate={{ x: user.theme === 'dark' ? 24 : 0 }}
                  className="w-6 h-6 bg-white dark:bg-slate-200 rounded-full shadow-sm dark:shadow-slate-950/80"
                />
              </button>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 shadow-sm transition-colors border-slate-200/90 bg-white dark:border-slate-600/80 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                    user.mbMode
                      ? 'bg-pink-500 text-white shadow-md shadow-pink-200/60 dark:bg-pink-600 dark:shadow-pink-950/40'
                      : 'bg-pink-50 text-pink-400 dark:bg-pink-950/45 dark:text-pink-300/90'
                  )}
                >
                  <Sparkles size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100">Rosa</p>
                  <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                    Un acento más suave. Independiente de claro u oscuro.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user.mbMode}
                onClick={() => onUpdateUser({ mbMode: !user.mbMode })}
                className={cn(
                  'relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors',
                  user.mbMode ? 'bg-pink-500 dark:bg-pink-600' : 'bg-slate-200 dark:bg-slate-600'
                )}
              >
                <motion.div
                  animate={{ x: user.mbMode ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="h-6 w-6 rounded-full bg-white shadow-md ring-1 ring-black/5 dark:bg-slate-100 dark:shadow-slate-950/60 dark:ring-white/15"
                />
              </button>
            </div>
          </Card>
        </section>

        {/* Danger Zone */}
        <section className="pt-8 border-t border-slate-100 dark:border-slate-700">
          <Button 
            type="button"
            variant="outline" 
            className="w-full py-6 rounded-2xl border-2 border-rose-100 text-rose-500 hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center gap-2"
            onClick={onLogout}
          >
            <LogOut size={20} />
            <span className="font-black uppercase tracking-widest text-xs">Cerrar Sesión</span>
          </Button>
        </section>
      </div>

      {photoError && (
        <p className="mt-3 text-center text-xs font-semibold text-rose-500">{photoError}</p>
      )}

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
