import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { subscribeAppNotices, type AppNotice } from '@/src/lib/appNotice';
import { cn } from '@/src/lib/utils';

const HOLD_MS = 4200;

export function AppNoticeHost() {
  const [items, setItems] = useState<AppNotice[]>([]);

  useEffect(() => {
    return subscribeAppNotices((n) => {
      setItems((prev) => [...prev.slice(-2), n]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== n.id));
      }, HOLD_MS);
    });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[120000] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map((n) => (
          <motion.p
            key={n.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              'pointer-events-auto max-w-sm rounded-2xl px-4 py-2.5 text-center text-[13px] font-semibold shadow-lg',
              n.tone === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
            )}
          >
            {n.message}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
