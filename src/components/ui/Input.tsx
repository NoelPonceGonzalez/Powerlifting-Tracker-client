import React from 'react';
import { cn } from '@/src/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 dark:text-slate-500">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors dark:text-slate-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-white border border-slate-200 rounded-2xl py-3 px-4 text-sm font-medium transition-all focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-indigo-900/40 dark:disabled:bg-slate-800',
              icon && 'pl-11',
              error && 'border-rose-500 focus:ring-rose-100 focus:border-rose-500',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-[10px] font-bold text-rose-500 ml-1 uppercase tracking-wider">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
