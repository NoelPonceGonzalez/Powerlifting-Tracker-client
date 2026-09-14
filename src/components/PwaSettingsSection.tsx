import React, { useCallback, useState } from 'react';
import { Bell, BellRing, Check, Download, Plus, Share, Smartphone } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { isIOS, useInstallPrompt } from '@/src/pwa/installPrompt';
import { useWebNotifications } from '@/src/pwa/notifications';
import { cn } from '@/src/lib/utils';

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
  const { isInstalled, canPrompt, needsManualInstructions, install } = useInstallPrompt();
  const { permission, isSupported, isBlocked, requesting, request, sendTestNotification } = useWebNotifications();
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const handleInstall = useCallback(async () => {
    if (needsManualInstructions) {
      setShowIosSteps((v) => !v);
      return;
    }
    await install();
  }, [needsManualInstructions, install]);

  const handleTest = useCallback(async () => {
    const ok = await sendTestNotification();
    if (!ok) return;
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }, [sendTestNotification]);

  const canOfferInstall = canPrompt || needsManualInstructions;

  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-sky-600 p-2">
          <Smartphone className="text-white" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">Aplicación</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Instálala en tu dispositivo y activa los avisos.
          </p>
        </div>
      </div>

      <Card padding="md" rounded="2xl" className="space-y-5">
        {/* Instalación */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
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
                  : canOfferInstall
                    ? 'Ábrela a pantalla completa desde tu pantalla de inicio.'
                    : 'Usa el menú de tu navegador → «Instalar app» o «Añadir a pantalla de inicio».'}
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
              variant={canOfferInstall ? 'primary' : 'outline'}
              disabled={!canOfferInstall}
              onClick={() => void handleInstall()}
              className="shrink-0 uppercase tracking-widest"
            >
              {needsManualInstructions ? 'Cómo' : 'Instalar'}
            </Button>
          )}
        </div>

        {showIosSteps && needsManualInstructions && (
          <ol className="space-y-2 rounded-2xl bg-slate-50 p-4 text-xs font-medium text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
            <li className="flex items-center gap-2">
              <Share size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                1. Pulsa <strong className="font-black">Compartir</strong> en la barra de Safari.
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                2. Elige <strong className="font-black">Añadir a pantalla de inicio</strong>.
              </span>
            </li>
          </ol>
        )}

        {/* Notificaciones */}
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5 dark:border-slate-700">
          <div className="flex min-w-0 flex-1 items-center gap-4">
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
              <p className="font-bold text-slate-900 dark:text-slate-100">Notificaciones</p>
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                {!isSupported
                  ? 'Tu navegador no soporta notificaciones web.'
                  : isBlocked
                    ? 'Bloqueadas. Actívalas en los ajustes del sitio en tu navegador.'
                    : permission === 'granted'
                      ? testSent
                        ? '¡Enviada! Revisa tus avisos.'
                        : 'Recibirás avisos de entrenos y actividad de amigos.'
                      : isIOS() && !isInstalled
                        ? 'En iPhone hay que instalar la app antes de poder activarlas.'
                        : 'Da permiso para recibir avisos aunque la app esté cerrada.'}
              </p>
            </div>
          </div>
          {permission === 'granted' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleTest()}
              className="shrink-0 uppercase tracking-widest"
            >
              Probar
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!isSupported || isBlocked || requesting || (isIOS() && !isInstalled)}
              onClick={() => void request()}
              className="shrink-0 uppercase tracking-widest"
            >
              {requesting ? 'Pidiendo…' : 'Activar'}
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
};
