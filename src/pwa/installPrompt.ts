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

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';

/** En iPhone cada navegador tiene el botón de compartir en otro sitio. */
export function iosBrowser(): IosBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/FxiOS/i.test(ua)) return 'firefox';
  if (/EdgiOS/i.test(ua)) return 'edge';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

/** Versión de iOS/iPadOS como número (17.4 → 17.4). null si no se puede leer. */
export function iosVersion(): number | null {
  if (typeof navigator === 'undefined') return null;
  const m = /OS (\d+)[._](\d+)/i.exec(navigator.userAgent);
  if (!m) return null;
  const v = Number(`${m[1]}.${m[2]}`);
  return Number.isFinite(v) ? v : null;
}

/**
 * WebKit: «Añadir a pantalla de inicio» desde otros navegadores llegó en iOS 16.4.
 * Por debajo de eso solo vale Safari, y ahí es donde se atascaba la instalación.
 */
export function iosCanAddToHomeScreen(): boolean {
  if (!isIOS()) return false;
  if (iosBrowser() === 'safari') return true;
  const v = iosVersion();
  return v === null || v >= 16.4;
}

/**
 * Android: el permiso es del origen y Chrome usa el mismo perfil para la pestaña y para
 * la app instalada, así que lo que aceptes antes de instalar ya vale dentro (web.dev/webapks).
 * iPhone: la app de la pantalla de inicio tiene su propio almacén, así que no se hereda.
 */
export function permissionsCarryOverToInstalledApp(): boolean {
  return !isIOS();
}

/** Dónde está «Añadir a pantalla de inicio» según el navegador del iPhone. */
export function iosInstallSteps(): string {
  if (!iosCanAddToHomeScreen()) {
    return 'Tu iPhone necesita Safari para esto: abre esta web en Safari y usa Compartir → Añadir a pantalla de inicio.';
  }
  switch (iosBrowser()) {
    case 'chrome':
      return 'En Chrome: botón Compartir (arriba a la derecha) → Añadir a pantalla de inicio → Añadir.';
    case 'firefox':
      return 'En Firefox: menú ⋮ → Compartir → Añadir a pantalla de inicio → Añadir.';
    case 'edge':
      return 'En Edge: menú ⋯ → Compartir → Añadir a pantalla de inicio → Añadir.';
    default:
      return 'En Safari: botón Compartir (el cuadrado con la flecha, abajo en el centro) → baja y pulsa Añadir a pantalla de inicio → Añadir.';
  }
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
  /** El navegador no tiene diálogo nativo: hay que instalar desde el menú o Safari. */
  needsManualInstructions: boolean;
  /** Aún no está instalada: se puede ofrecer el aviso o el botón. */
  isInstallable: boolean;
  install: () => Promise<InstallOutcome>;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const install = useCallback(() => promptInstall(), []);
  const needsManualInstructions = !state.isInstalled && !state.canPrompt;

  return {
    ...state,
    needsManualInstructions,
    isInstallable: !state.isInstalled,
    install,
  };
}
