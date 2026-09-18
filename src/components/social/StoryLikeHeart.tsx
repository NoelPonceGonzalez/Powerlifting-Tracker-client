import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Heart } from 'lucide-react';

/** Salta, da una vuelta en el aire, cae y al aterrizar se pone rojo. */
export function StoryLikeHeart({
  filled,
  size = 18,
  burst = 0,
  className,
}: {
  filled: boolean;
  size?: number;
  burst?: number;
  className?: string;
}) {
  const [flying, setFlying] = useState(false);
  const [landed, setLanded] = useState(filled);

  useEffect(() => {
    if (!filled && !flying) setLanded(false);
  }, [filled, flying]);

  useEffect(() => {
    if (burst <= 0) return;
    setLanded(false);
    setFlying(true);
  }, [burst]);

  const red = filled && !flying && landed;

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-visible ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <Heart
        size={size}
        className={red ? 'fill-rose-500 text-rose-500' : 'text-current'}
      />
      <AnimatePresence>
        {flying && (
          <motion.span
            key={burst}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            initial={{ y: 0, scale: 0.28, rotate: -20, opacity: 0 }}
            animate={{
              y: [0, -96, -108, 10, 0],
              scale: [0.28, 1.32, 1.2, 0.84, 1],
              rotate: [0, 210, 360, 375, 360],
              opacity: [0, 1, 1, 1, 1],
            }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.1 } }}
            transition={{
              duration: 0.94,
              times: [0, 0.3, 0.48, 0.82, 1],
              ease: ['easeOut', 'easeOut', 'easeIn', [0.22, 1.45, 0.36, 1]],
            }}
            onAnimationComplete={() => {
              setLanded(true);
              window.setTimeout(() => setFlying(false), 50);
            }}
          >
            <Heart
              size={Math.round(size * 1.4)}
              className="fill-rose-500 text-rose-500 drop-shadow-[0_8px_14px_rgba(244,63,94,0.55)]"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
