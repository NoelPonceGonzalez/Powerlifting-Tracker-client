import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Download, Dumbbell, Share } from 'lucide-react';
import { isAndroid, isIOS, useInstallPrompt } from '@/src/pwa/installPrompt';
import { useWebNotifications } from '@/src/pwa/notifications';

const DISMISS_KEY = {
  install: 'pwa-install-dismissed-at',
  notifications: 'pwa-notifications-dismissed-at-v2',
} as const;

/** Si el usuario dice que no, no volver a molestar en una semana. */
const DISMISS_DAYS = 7;
/** Pequeño retardo para no tapar la app nada más entrar. */
const SHOW_DELAY_MS = 1500;

type PromptMode = 'install' | 'notifications';

function wasRecentlyDismissed(mode: PromptMode): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY[mode]));
    if (!Number.isFinite(at) || at <= 0) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismissal(mode: PromptMode) {
  try {
    localStorage.setItem(DISMISS_KEY[mode], String(Date.now()));
  } catch {
    /* modo incógnito sin almacenamiento */
  }
}

/**
 * Aviso que aparece al entrar desde el navegador: primero ofrece instalar la app
 * y después activar las notificaciones.
 *
 * El permiso se pide siempre desde un clic propio: encadenarlo al diálogo de instalación
 * consumiría la interacción del usuario y el navegador rechazaría la petición.
 */
export const InstallPrompt: React.FC = () => {
  const { isInstalled, needsManualInstructions, isInstallable, install } = useInstallPrompt();
  const { permission, isSupported, request: requestNotifications } = useWebNotifications();

  const [justInstalled, setJustInstalled] = useState(false);
  const [dismissed, setDismissed] = useState<Record<PromptMode, boolean>>(() => ({
    install: wasRecentlyDismissed('install'),
    notifications: wasRecentlyDismissed('notifications'),
  }));
  const [visible, setVisible] = useState(false);

  // iPhone solo permite Web Push con la app en la pantalla de inicio.
  // En Android/escritorio se puede activar desde el navegador.
  const iosNeedsInstall = isIOS() && !isInstalled && !justInstalled;
  const canAskNotifications = isSupported && permission === 'default' && !iosNeedsInstall;

  let mode: PromptMode | null = null;
  if (!isInstalled && !justInstalled && isInstallable && !dismissed.install) mode = 'install';
  else if (canAskNotifications && !dismissed.notifications) mode = 'notifications';

  useEffect(() => {
    if (!mode) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const close = useCallback(() => {
    if (!mode) return;
    setVisible(false);
    setDismissed((prev) => ({ ...prev, [mode]: true }));
    rememberDismissal(mode);
  }, [mode]);

  const handleInstall = useCallback(async () => {
    const outcome = await install();
    if (outcome === 'accepted') {
      // Pasa al segundo paso (notificaciones) en cuanto se instala.
      setVisible(false);
      setJustInstalled(true);
      return;
    }
    if (outcome === 'dismissed') close();
  }, [install, close]);

  const handleEnableNotifications = useCallback(async () => {
    setVisible(false);
    await requestNotifications();
  }, [requestNotifications]);

  const isNotificationsMode = mode === 'notifications';

  return (
    <AnimatePresence>
      {visible && mode && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          role="dialog"
          aria-label={isNotificationsMode ? 'Activar notificaciones' : 'Instalar la aplicación'}
          className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[60] mx-auto max-w-md sm:inset-x-3 sm:bottom-28"
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/92 px-3 py-2.5 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-slate-700/60 dark:bg-slate-950/90 dark:shadow-black/60 sm:rounded-3xl sm:p-5">
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white sm:size-12 sm:rounded-2xl">
                {isNotificationsMode ? <BellRing size={18} strokeWidth={2.5} /> : <Dumbbell size={18} strokeWidth={2.5} />}
              </div>
              <div className="min-w-0 flex-1 basis-[8rem]">
                <h2 className="truncate text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">
                  {isNotificationsMode ? 'Activar notificaciones' : 'Instalar en el móvil'}
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:text-xs">
                  {isNotificationsMode
                    ? 'Torneos, gym, RMs, solicitudes y mensajes. Aunque la app esté cerrada.'
                    : isIOS()
                      ? 'En iPhone Apple exige añadirla a la pantalla de inicio. Sin eso no se pueden activar los avisos.'
                      : 'Añádela a la pantalla de inicio: se abre como una app.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:px-3"
                >
                  Ahora no
                </button>
                <button
                  type="button"
                  onClick={() => void (isNotificationsMode ? handleEnableNotifications() : handleInstall())}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-white sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xs"
                >
                  {isNotificationsMode ? <BellRing size={14} /> : <Download size={14} />}
                  {isNotificationsMode ? 'Activar' : 'Instalar'}
                </button>
              </div>
            </div>

            {!isNotificationsMode && needsManualInstructions && (
              <p className="mt-2 hidden text-[11px] font-medium leading-snug text-slate-500 min-[400px]:block dark:text-slate-400">
                {isIOS() ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Share size={13} className="shrink-0 text-indigo-600" />
                    Safari → Compartir → Añadir a pantalla de inicio.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Download size={13} className="shrink-0 text-indigo-600" />
                    Menú {isAndroid() ? '⋮ de Chrome' : 'del navegador'} → Instalar app.
                  </span>
                )}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
