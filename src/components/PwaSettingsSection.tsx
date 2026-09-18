import React, { useCallback, useState } from 'react';
import { Bell, BellRing, Camera, Check, Download, Image as ImageIcon, Plus, Share, Smartphone } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { isAndroid, isIOS, useInstallPrompt } from '@/src/pwa/installPrompt';
import { useWebNotifications } from '@/src/pwa/notifications';
import { useMediaAccess } from '@/src/pwa/mediaAccess';
import { cn } from '@/src/lib/utils';
import { showAppError, showAppOk } from '@/src/lib/appNotice';

const StatusChip: React.FC<{ tone: 'ok' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={cn(
      'flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider',
      tone === 'ok'
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
        : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
    )}
  >
    {children}
  </span>
);

/** Instalación de la app (PWA) y permiso de notificaciones del navegador. */
export const PwaSettingsSection: React.FC = () => {
  const { isInstalled, needsManualInstructions, install } = useInstallPrompt();
  const { permission, isSupported, isBlocked, requesting, request, sendTestNotification } = useWebNotifications();
  const { camera, galleryReady, requestingCamera, requestCamera, openGallery } = useMediaAccess();
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [galleryOk, setGalleryOk] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [testPushMsg, setTestPushMsg] = useState('');

  const handleInstall = useCallback(async () => {
    if (needsManualInstructions) {
      setShowIosSteps((v) => !v);
      return;
    }
    await install();
  }, [needsManualInstructions, install]);

  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-sky-600 p-2">
          <Smartphone className="text-white" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">Aplicación</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Instálala en tu dispositivo y activa notificaciones, cámara y galería.
          </p>
        </div>
      </div>

      <Card padding="md" rounded="2xl" className="space-y-5">
        {/* Instalación */}
        <div className="app-row">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                isInstalled
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200/60 dark:shadow-emerald-950/40'
                  : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/45 dark:text-indigo-300'
              )}
            >
              <Download size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100">Instalar en el dispositivo</p>
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                {isInstalled
                  ? 'Ya la estás usando como app instalada.'
                  : isIOS()
                    ? 'En iPhone Apple exige añadirla a la pantalla de inicio. Sin eso no se pueden activar los avisos.'
                    : 'Ábrela a pantalla completa desde tu pantalla de inicio.'}
              </p>
            </div>
          </div>
          {isInstalled ? (
            <StatusChip tone="ok">
              <Check size={14} /> Instalada
            </StatusChip>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => void handleInstall()}
              className="w-full shrink-0 uppercase tracking-widest min-[360px]:w-auto"
            >
              {needsManualInstructions ? (showIosSteps ? 'Ocultar' : 'Instalar') : 'Instalar'}
            </Button>
          )}
        </div>

        {showIosSteps && needsManualInstructions && (
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
                <li className="flex items-start gap-2">
                  <Bell size={16} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    3. Ábrela desde el icono y activa los avisos. Lo pide Apple, no la app.
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
        )}

        {/* Notificaciones */}
        <div className="app-row border-t border-slate-100 pt-5 dark:border-slate-700">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                permission === 'granted'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200/60 dark:shadow-emerald-950/40'
                  : isBlocked
                    ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
              )}
            >
              {permission === 'granted' ? <BellRing size={20} /> : <Bell size={20} />}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100">Activar notificaciones</p>
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                {!isSupported
                  ? 'Tu navegador no soporta notificaciones web.'
                  : isBlocked
                    ? 'Bloqueadas. Actívalas en los ajustes del sitio en tu navegador.'
                    : permission === 'granted'
                      ? 'Recibirás avisos de entrenos y actividad de amigos.'
                      : isIOS() && !isInstalled
                        ? 'En iPhone hay que añadirla a la pantalla de inicio y dar permiso. Lo exige Apple, no la app.'
                        : 'Da permiso para recibir avisos aunque la app esté cerrada.'}
              </p>
            </div>
          </div>
          {permission === 'granted' ? (
            <div className="flex w-full shrink-0 flex-col items-stretch gap-2 min-[360px]:w-auto">
              <StatusChip tone="ok">
                <Check size={14} /> Activas
              </StatusChip>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={testingPush}
                onClick={() => {
                  setTestingPush(true);
                  setTestPushMsg('');
                  void sendTestNotification()
                    .then((ok) => {
                      if (ok) {
                        setTestPushMsg('Aviso enviado. Míralo en las notificaciones.');
                        showAppOk('Aviso enviado.');
                      } else {
                        setTestPushMsg('No se ha podido mostrar el aviso.');
                        showAppError('No se ha podido mostrar el aviso.');
                      }
                    })
                    .finally(() => setTestingPush(false));
                }}
                className="uppercase tracking-widest"
              >
                {testingPush ? 'Enviando…' : 'Probar aviso'}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!isSupported || isBlocked || requesting || (isIOS() && !isInstalled)}
              onClick={() => void request()}
              className="w-full shrink-0 uppercase tracking-widest min-[360px]:w-auto"
            >
              {requesting ? 'Pidiendo…' : 'Activar'}
            </Button>
          )}
        </div>
        {testPushMsg && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{testPushMsg}</p>
        )}

        {/* Cámara */}
        <div className="app-row border-t border-slate-100 pt-5 dark:border-slate-700">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                camera === 'granted'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200/60 dark:shadow-emerald-950/40'
                  : camera === 'denied'
                    ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400'
                    : 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300'
              )}
            >
              <Camera size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100">Activar cámara</p>
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                {camera === 'unsupported'
                  ? 'Este dispositivo no puede abrir la cámara desde el navegador.'
                  : camera === 'denied'
                    ? 'Bloqueada. Actívala en los ajustes del sitio.'
                    : camera === 'granted'
                      ? 'Lista para historias y fotos de perfil.'
                      : 'Haz falta para grabar o hacer foto desde la app.'}
              </p>
            </div>
          </div>
          {camera === 'granted' ? (
            <StatusChip tone="ok">
              <Check size={14} /> Activa
            </StatusChip>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={camera === 'unsupported' || camera === 'denied' || requestingCamera}
              onClick={() => void requestCamera()}
              className="w-full shrink-0 uppercase tracking-widest min-[360px]:w-auto"
            >
              {requestingCamera ? 'Pidiendo…' : 'Activar'}
            </Button>
          )}
        </div>

        {/* Galería */}
        <div className="app-row border-t border-slate-100 pt-5 dark:border-slate-700">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                galleryOk
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200/60 dark:shadow-emerald-950/40'
                  : 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300'
              )}
            >
              <ImageIcon size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100">Activar galería</p>
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                {galleryOk
                  ? 'Puedes elegir fotos y vídeos de tu móvil.'
                  : 'Da permiso para subir una historia o cambiar la foto de perfil.'}
              </p>
            </div>
          </div>
          {galleryOk ? (
            <StatusChip tone="ok">
              <Check size={14} /> Activa
            </StatusChip>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!galleryReady}
              onClick={() => {
                void openGallery().then((file) => {
                  if (file) setGalleryOk(true);
                });
              }}
              className="w-full shrink-0 uppercase tracking-widest min-[360px]:w-auto"
            >
              Activar
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
};
