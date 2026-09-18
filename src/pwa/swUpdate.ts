import { useCallback, useEffect, useState } from 'react';

export const SW_UPDATE_EVENT = 'pwa:sw-update-available';

export function isServiceWorkerUpdateSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Activa la versión ya descargada y recarga cuando el SW nuevo toma el control. */
export function applyServiceWorkerUpdate(): void {
  if (!isServiceWorkerUpdateSupported()) {
    window.location.reload();
    return;
  }
  void navigator.serviceWorker.ready.then((registration) => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
}

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!isServiceWorkerUpdateSupported()) return;

    const onUpdate = () => setUpdateAvailable(true);
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);

    void navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    });

    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);

  const applyUpdate = useCallback(() => {
    applyServiceWorkerUpdate();
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, applyUpdate, dismissUpdate };
}
