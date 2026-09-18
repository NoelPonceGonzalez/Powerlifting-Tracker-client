import { useEffect } from 'react';
import { useAnimationControls } from 'motion/react';

/** Replay de la entrada de pestaña al volver a ella (las pantallas se quedan montadas). */
export function usePageEnter(active: boolean, replayKey?: string | number) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (!active) return;
    controls.set('hidden');
    void controls.start('show');
  }, [active, replayKey, controls]);
  return controls;
}
