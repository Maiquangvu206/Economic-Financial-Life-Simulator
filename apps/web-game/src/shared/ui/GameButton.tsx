import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const VARIANT: Record<string, string> = {
  primary:
    'bg-emerald-500 text-white hover:bg-emerald-400 active:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.4)]',
  outline: 'border border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-emerald-300',
  danger:
    'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
  ghost: 'text-slate-400 hover:bg-slate-800 hover:text-emerald-300',
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
        <span className="mr-2 animate-spin block h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
      )}
      {children}
    </button>
  ),
);

GameButton.displayName = 'GameButton';
