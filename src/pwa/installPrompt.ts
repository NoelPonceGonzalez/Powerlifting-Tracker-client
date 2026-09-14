import { useCallback, useSyncExternalStore } from 'react';

/** Evento propietario de Chromium; no está en lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface InstallSnapshot {
  /** El navegador ya ofreció el diálogo nativo de instalación y lo tenemos guardado. */
  canPrompt: boolean;
  /** La app se está ejecutando desde el icono instalado (standalone). */
  isInstalled: boolean;
}

/** true si la página se abrió desde el icono instalado y no desde una pestaña. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
  // Safari iOS no expone display-mode hasta iOS 17
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iOS (y iPadOS, que se identifica como Mac con pantalla táctil) no dispara `beforeinstallprompt`. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
}

/**
 * `beforeinstallprompt` se dispara una sola vez y puede llegar antes de que React monte,
 * así que se captura a nivel de módulo y los componentes leen de aquí.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let snapshot: InstallSnapshot = { canPrompt: false, isInstalled: false };
const listeners = new Set<() => void>();

function emit(next: InstallSnapshot) {
  if (next.canPrompt === snapshot.canPrompt && next.isInstalled === snapshot.isInstalled) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

function refresh() {
  emit({ canPrompt: deferredPrompt !== null, isInstalled: isStandalone() });
}

let initialized = false;

/** Empieza a escuchar los eventos de instalación. Llamar lo antes posible (main.tsx). */
export function initInstallPrompt() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  snapshot = { canPrompt: false, isInstalled: isStandalone() };

  window.addEventListener('beforeinstallprompt', (event) => {
    // Sin preventDefault el navegador enseña su propio mini-infobar y perdemos el evento.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    refresh();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refresh();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', refresh);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallSnapshot {
  return snapshot;
}

/** Lanza el diálogo nativo de instalación. El evento solo sirve una vez. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  deferredPrompt = null;
  refresh();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export interface UseInstallPromptResult extends InstallSnapshot {
  /** iOS necesita instrucciones manuales (Compartir → Añadir a pantalla de inicio). */
  needsManualInstructions: boolean;
  /** Hay algo que ofrecer al usuario: o el diálogo nativo o las instrucciones de iOS. */
  isInstallable: boolean;
  install: () => Promise<InstallOutcome>;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const install = useCallback(() => promptInstall(), []);
  const needsManualInstructions = !state.isInstalled && !state.canPrompt && isIOS();

  return {
    ...state,
    needsManualInstructions,
    isInstallable: !state.isInstalled && (state.canPrompt || needsManualInstructions),
    install,
  };
}
