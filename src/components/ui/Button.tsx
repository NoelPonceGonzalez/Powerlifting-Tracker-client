import React from 'react';
import { cn } from '@/src/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200/50 dark:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-600',
      secondary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 dark:bg-slate-800 dark:hover:bg-slate-700',
      outline: 'bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-md shadow-slate-200/50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:shadow-none',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
      danger: 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-200/50 dark:shadow-rose-500/20',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs rounded-xl',
      md: 'px-6 py-3 text-sm rounded-2xl',
      lg: 'px-8 py-4 text-base rounded-[2rem]',
      xl: 'px-10 py-6 text-xl rounded-[2.5rem]',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none gap-2',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
