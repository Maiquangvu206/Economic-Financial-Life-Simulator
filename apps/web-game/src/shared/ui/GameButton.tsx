import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const VARIANT: Record<string, string> = {
  primary:
    'bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 shadow-sm shadow-emerald-500/30',
  outline:
    'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700',
  danger:
    'bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 shadow-sm shadow-rose-500/25',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-emerald-700',
};

const SIZE: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const GameButton = forwardRef<HTMLButtonElement, GameButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none',
        VARIANT[variant ?? 'primary'],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="mr-2 block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      )}
      {children}
    </button>
  ),
);

GameButton.displayName = 'GameButton';
