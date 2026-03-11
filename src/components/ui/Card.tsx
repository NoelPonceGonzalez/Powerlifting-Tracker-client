import React from 'react';
import { cn } from '@/src/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'white' | 'dark' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'white', padding = 'md', rounded = '3xl', ...props }, ref) => {
    const variants = {
      white: 'bg-white border border-slate-100 shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100',
      dark: 'bg-slate-900 text-white shadow-2xl shadow-indigo-200',
      glass: 'bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl shadow-indigo-200/50 dark:bg-slate-900/80 dark:border-slate-700/50 dark:text-slate-100',
    };

    const paddings = {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
      xl: 'p-10',
    };

    const roundings = {
      none: 'rounded-none',
      sm: 'rounded-xl',
      md: 'rounded-2xl',
      lg: 'rounded-3xl',
      xl: 'rounded-[2rem]',
      '2xl': 'rounded-[2.5rem]',
      '3xl': 'rounded-[3rem]',
      '4xl': 'rounded-[3.5rem]',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'transition-all duration-300',
          variants[variant],
          paddings[padding],
          roundings[rounded],
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';
