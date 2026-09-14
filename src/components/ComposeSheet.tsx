import React from 'react';
import { createPortal } from 'react-dom';
import { Camera, Clock, MapPin } from 'lucide-react';

interface ComposeSheetProps {
  open: boolean;
  onClose: () => void;
  onPublish: () => void;
  onGymNow: () => void;
  onGymLater: () => void;
}

const ACTIONS = [
  {
    id: 'publish' as const,
    icon: Camera,
    title: 'Foto o vídeo',
    hint: 'Súbelo para que te feliciten',
    tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300',
  },
  {
    id: 'now' as const,
    icon: MapPin,
    title: 'Estoy en el gym',
    hint: 'Aviso ahora a tus amigos',
    tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    id: 'later' as const,
    icon: Clock,
    title: 'Llego a las…',
    hint: 'Gym y hora de llegada',
    tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  },
];

export function ComposeSheet({ open, onClose, onPublish, onGymNow, onGymLater }: ComposeSheetProps) {
  if (!open || typeof document === 'undefined') return null;

  const run = (id: 'publish' | 'now' | 'later') => {
    if (id === 'publish') onPublish();
    else if (id === 'now') onGymNow();
    else onGymLater();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120000] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full max-w-lg px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="overflow-hidden rounded-[28px] bg-white/95 shadow-2xl ring-1 ring-black/5 dark:bg-slate-900/95 dark:ring-white/10">
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <p className="px-5 pb-1 pt-3 text-sm font-medium text-slate-400">Nuevo</p>
          <div className="px-2 pb-2">
            {ACTIONS.map(action => (
              <button
                key={action.id}
                type="button"
                onClick={() => run(action.id)}
                className="flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80"
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${action.tone}`}>
                  <action.icon size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-semibold text-slate-900 dark:text-white">{action.title}</span>
                  <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400">{action.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-[22px] bg-white py-3.5 text-[16px] font-semibold text-slate-900 shadow-lg ring-1 ring-black/5 dark:bg-slate-900 dark:text-white dark:ring-white/10"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body
  );
}
