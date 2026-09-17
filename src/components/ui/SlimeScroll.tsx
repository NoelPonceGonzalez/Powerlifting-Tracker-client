import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useSlimeOverscroll } from '@/src/lib/useSlimeOverscroll';

interface SlimeScrollProps {
  active?: boolean;
  axis?: 'x' | 'y';
  /** Lista embebida: sin pantalla completa. */
  embed?: boolean;
  /** Mide el scroll de `.app-scroll` y deforma solo este bloque. */
  scrollFrom?: 'self' | 'parent';
  /** Aunque no haya overflow, el muelle actúa al tirar del tope o del fondo. */
  evenIfShort?: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
}

/** Scroll con overscroll slime (chicle al tope / al fondo). */
export function SlimeScroll({
  active = true,
  axis = 'y',
  embed = false,
  scrollFrom = 'self',
  evenIfShort = false,
  children,
  className,
  contentClassName,
  style,
}: SlimeScrollProps) {
  const { ref, slimeStyle } = useSlimeOverscroll(active, axis, scrollFrom, evenIfShort);

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        axis === 'x'
          ? 'overflow-x-auto overflow-y-hidden overscroll-x-none touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : scrollFrom === 'parent'
            ? 'overflow-visible'
            : 'overflow-y-auto overflow-x-hidden overscroll-y-none touch-pan-y',
        !embed && axis === 'y' && scrollFrom !== 'parent' && 'app-scroll h-full',
        !embed && !active && 'hidden',
        className
      )}
      aria-hidden={!embed && !active ? true : undefined}
    >
      <motion.div
        style={slimeStyle}
        className={cn(
          axis === 'x' ? 'min-w-full' : 'min-h-0',
          'will-change-transform',
          contentClassName
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}
