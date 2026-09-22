import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Camera, Download, Dumbbell, Share } from 'lucide-react';
import { iosInstallSteps, isAndroid, isIOS, useInstallPrompt } from '@/src/pwa/installPrompt';
import { useWebNotifications } from '@/src/pwa/notifications';
import {
  cameraBlockedHint,
  cameraPromptExhausted,
  isCameraSupported,
  readCameraPermission,
  requestCameraAccess,
} from '@/src/pwa/mediaAccess';

const DISMISS_KEY = {
  install: 'pwa-install-dismissed-at',
  notifications: 'pwa-notifications-dismissed-at-v2',
  camera: 'pwa-camera-dismissed-at-v1',
  cameraHelp: 'pwa-camera-help-dismissed-at-v1',
} as const;

/** Si el usuario dice que no, no volver a molestar en una semana. */
const DISMISS_DAYS = 7;
/** Retardo para no tapar la app nada más entrar. Los permisos van casi al momento. */
const SHOW_DELAY_MS = 1500;
const PERMISSION_DELAY_MS = 400;

type PromptMode = 'install' | 'notifications' | 'camera' | 'cameraHelp';

/**
 * Los permisos se vuelven a ofrecer en cada visita (solo se callan en esa sesión): son
 * nuestro cartel, no el diálogo de Chrome, así que no cuentan como descarte ni provocan
 * el bloqueo automático del navegador.
 */
function isSessionOnly(mode: PromptMode): boolean {
  return mode === 'notifications' || mode === 'camera';
}

function wasRecentlyDismissed(mode: PromptMode): boolean {
  try {
    if (isSessionOnly(mode)) return sessionStorage.getItem(DISMISS_KEY[mode]) === '1';
    const at = Number(localStorage.getItem(DISMISS_KEY[mode]));
    if (!Number.isFinite(at) || at <= 0) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismissal(mode: PromptMode) {
  try {
    if (isSessionOnly(mode)) sessionStorage.setItem(DISMISS_KEY[mode], '1');
    else localStorage.setItem(DISMISS_KEY[mode], String(Date.now()));
  } catch {
    /* modo incógnito sin almacenamiento */
  }
}

/**
 * Orden del aviso al entrar.
 *
 * Android: notificaciones y cámara ANTES de instalar. Chrome guarda el permiso por
 * origen en el mismo perfil, así que lo aceptado en la pestaña ya vale en la app
 * instalada (web.dev/articles/webapks).
 *
 * iPhone: primero instalar. La app de la pantalla de inicio tiene su propio almacén y
 * los avisos solo existen ahí, así que pedirlo antes en Safari no serviría de nada.
 */
export const InstallPrompt: React.FC = () => {
  const { isInstalled, needsManualInstructions, isInstallable, install } = useInstallPrompt();
  const { permission, isSupported, request: requestNotifications } = useWebNotifications();
  const [cameraState, setCameraState] = useState<'unknown' | 'prompt' | 'ready' | 'blocked'>('unknown');

  const [justInstalled, setJustInstalled] = useState(false);
  const [dismissed, setDismissed] = useState<Record<PromptMode, boolean>>(() => ({
    install: wasRecentlyDismissed('install'),
    notifications: wasRecentlyDismissed('notifications'),
    camera: wasRecentlyDismissed('camera'),
    cameraHelp: wasRecentlyDismissed('cameraHelp'),
  }));
  const [visible, setVisible] = useState(false);

  /** Al volver a la web se relee: si el permiso se cambió fuera, el cartel desaparece. */
  useEffect(() => {
    let live = true;
    const sync = () => {
      if (!isCameraSupported()) {
        setCameraState('ready');
        return;
      }
      void readCameraPermission().then(state => {
        if (!live) return;
        if (state === 'granted' || state === 'unsupported') setCameraState('ready');
        else if (state === 'denied' || cameraPromptExhausted()) setCameraState('blocked');
        else setCameraState('prompt');
      });
    };
    sync();
    const onVis = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', sync);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const installed = isInstalled || justInstalled;
  // iPhone: Apple solo da Web Push a la app de la pantalla de inicio.
  const iosNeedsInstall = isIOS() && !installed;
  const canAskNotifications = isSupported && permission === 'default' && !iosNeedsInstall;
  const canAskCamera = cameraState === 'prompt' && !iosNeedsInstall;
  const canShowCameraHelp = cameraState === 'blocked' && installed;
  const canInstall = !installed && (isInstallable || isIOS());

  let mode: PromptMode | null = null;
  if (isIOS() && canInstall && !dismissed.install) mode = 'install';
  else if (canAskNotifications && !dismissed.notifications) mode = 'notifications';
  else if (canAskCamera && !dismissed.camera) mode = 'camera';
  else if (canInstall && !dismissed.install) mode = 'install';
  else if (canShowCameraHelp && !dismissed.cameraHelp) mode = 'cameraHelp';

  useEffect(() => {
    if (!mode) {
      setVisible(false);
      return;
    }
    const t = setTimeout(
      () => setVisible(true),
      isSessionOnly(mode) ? PERMISSION_DELAY_MS : SHOW_DELAY_MS
    );
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
      setVisible(false);
      setJustInstalled(true);
      return;
    }
    // En iPhone no hay diálogo: se queda el cartel con los pasos a mano.
    if (outcome === 'dismissed') close();
  }, [install, close]);

  const handleEnableNotifications = useCallback(async () => {
    setVisible(false);
    await requestNotifications();
  }, [requestNotifications]);

  const handleEnableCamera = useCallback(async () => {
    setVisible(false);
    const attempt = await requestCameraAccess();
    if (attempt.state === 'granted') setCameraState('ready');
    else if (attempt.denial === 'silent' || attempt.state === 'denied') setCameraState('blocked');
  }, []);

  const copy =
    mode === 'notifications'
      ? {
          label: 'Activar notificaciones',
          title: 'Activar notificaciones',
          body: installed
            ? 'Torneos, gym, RMs, solicitudes y mensajes. Aunque la app esté cerrada.'
            : 'Acéptalas ahora y la app ya las tendrá cuando la instales.',
          action: 'Activar',
          icon: <BellRing size={18} strokeWidth={2.5} />,
          actionIcon: <BellRing size={14} />,
          onAction: () => void handleEnableNotifications(),
        }
      : mode === 'camera'
        ? {
            label: 'Activar cámara',
            title: 'Activar cámara',
            body: installed
              ? 'Historias y foto de perfil dentro de la app. Se pide una vez.'
              : 'Para historias y foto de perfil. Dando permiso aquí, la app instalada ya la tendrá.',
            action: 'Activar',
            icon: <Camera size={18} strokeWidth={2.5} />,
            actionIcon: <Camera size={14} />,
            onAction: () => void handleEnableCamera(),
          }
        : mode === 'cameraHelp'
          ? {
              label: 'Cámara bloqueada',
              title: 'Cámara bloqueada',
              body: cameraBlockedHint(),
              action: 'Entendido',
              icon: <Camera size={18} strokeWidth={2.5} />,
              actionIcon: <Camera size={14} />,
              onAction: close,
            }
          : {
              label: 'Instalar la aplicación',
              title: 'Instalar en el móvil',
              body: isIOS() ? iosInstallSteps() : 'Añádela a la pantalla de inicio: se abre como una app.',
              // iPhone no tiene diálogo de instalación: el cartel solo explica los pasos.
              action: isIOS() ? 'Entendido' : 'Instalar',
              icon: <Dumbbell size={18} strokeWidth={2.5} />,
              actionIcon: isIOS() ? <Share size={14} /> : <Download size={14} />,
              onAction: isIOS() ? close : () => void handleInstall(),
            };

  return (
    <AnimatePresence>
      {visible && mode && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          role="dialog"
          aria-label={copy.label}
          className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[60] mx-auto max-w-md sm:inset-x-3 sm:bottom-28"
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/92 px-3 py-2.5 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-slate-700/60 dark:bg-slate-950/90 dark:shadow-black/60 sm:rounded-3xl sm:p-5">
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white sm:size-12 sm:rounded-2xl">
                {copy.icon}
              </div>
              <div className="min-w-0 flex-1 basis-[8rem]">
                <h2 className="truncate text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">
                  {copy.title}
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:text-xs">
                  {copy.body}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {mode !== 'cameraHelp' && (
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:px-3"
                  >
                    Ahora no
                  </button>
                )}
                <button
                  type="button"
                  onClick={copy.onAction}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-white sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xs"
                >
                  {copy.actionIcon}
                  {copy.action}
                </button>
              </div>
            </div>

            {mode === 'install' && (isIOS() || needsManualInstructions) && (
              <p className="mt-2 text-[11px] font-medium leading-snug text-slate-500 dark:text-slate-400">
                {isIOS() ? (
                  <span className="inline-flex items-start gap-1.5">
                    <Share size={13} className="mt-0.5 shrink-0 text-indigo-600" />
                    Después ábrela desde el icono: los avisos y la cámara solo se pueden
                    activar ahí. Lo exige Apple.
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
