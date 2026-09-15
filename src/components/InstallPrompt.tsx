import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Download, Dumbbell, Plus, Share, X } from 'lucide-react';
import { isAndroid, isIOS, useInstallPrompt } from '@/src/pwa/installPrompt';
import { useWebNotifications } from '@/src/pwa/notifications';

const DISMISS_KEY = {
  install: 'pwa-install-dismissed-at',
  notifications: 'pwa-notifications-dismissed-at',
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
  const { isInstalled, canPrompt, needsManualInstructions, isInstallable, install } = useInstallPrompt();
  const { permission, isSupported, request: requestNotifications } = useWebNotifications();

  const [justInstalled, setJustInstalled] = useState(false);
  const [dismissed, setDismissed] = useState<Record<PromptMode, boolean>>(() => ({
    install: wasRecentlyDismissed('install'),
    notifications: wasRecentlyDismissed('notifications'),
  }));
  const [visible, setVisible] = useState(false);

  // Las notificaciones solo se ofrecen con la app ya instalada: en iOS es un requisito
  // del sistema y en el resto evita pedir permisos a quien solo pasaba por la web.
  const notificationsPending = isSupported && permission === 'default' && (isInstalled || justInstalled);

  let mode: PromptMode | null = null;
  if (isInstallable && !dismissed.install) mode = 'install';
  else if (notificationsPending && !dismissed.notifications) mode = 'notifications';

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
          className="fixed inset-x-3 bottom-24 z-[120050] mx-auto max-w-md sm:bottom-28"
        >
          <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/90 p-5 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-slate-700/60 dark:bg-slate-950/90 dark:shadow-black/60">
            <button
              type="button"
              onClick={close}
              aria-label="Ahora no"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-4 pr-6">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-300/50 dark:shadow-indigo-900/50">
                {isNotificationsMode ? <BellRing size={24} strokeWidth={2.5} /> : <Dumbbell size={24} strokeWidth={2.5} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">
                  {isNotificationsMode ? 'Activar notificaciones' : 'Instalar en el móvil'}
                </h2>
                <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">
                  {isNotificationsMode
                    ? 'Recibe avisos de tus entrenos y de la actividad de tus amigos aunque la app esté cerrada.'
                    : 'Añádela a la pantalla de inicio: se abre como una app, sin barra del navegador.'}
                </p>
              </div>
            </div>

            {!isNotificationsMode && needsManualInstructions ? (
              <div className="mt-4 space-y-3">
                <ol className="space-y-2 rounded-2xl bg-slate-50 p-4 text-xs font-medium text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                  {isIOS() ? (
                    <>
                      <li className="flex items-center gap-2">
                        <Share size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          1. Pulsa <strong className="font-black">Compartir</strong> en Safari.
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Plus size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          2. Elige <strong className="font-black">Añadir a pantalla de inicio</strong>.
                        </span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center gap-2">
                        <Download size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          1. Abre el menú {isAndroid() ? '⋮ de Chrome' : 'del navegador'}.
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Plus size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          2. Pulsa <strong className="font-black">Instalar app</strong> o <strong className="font-black">Añadir a pantalla de inicio</strong>.
                        </span>
                      </li>
                    </>
                  )}
                </ol>
                <button
                  type="button"
                  onClick={close}
                  className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 dark:border-slate-700 dark:text-slate-300"
                >
                  Ahora no
                </button>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 rounded-2xl border-2 border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Ahora no
                </button>
                <button
                  type="button"
                  onClick={() => void (isNotificationsMode ? handleEnableNotifications() : handleInstall())}
                  className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-300/50 transition-all active:scale-[0.98] dark:bg-indigo-500 dark:shadow-indigo-900/50"
                >
                  {isNotificationsMode ? (
                    <>
                      <BellRing size={16} />
                      Activar
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Instalar
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
