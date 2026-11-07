import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface GameInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const GameInput = forwardRef<HTMLInputElement, GameInputProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="space-y-1">
      {label && (
        <label className="text-[11px] uppercase tracking-wider text-slate-500">{label}</label>
      )}
      <input
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-xl border border-slate-700 bg-surface-850/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50',
          error && 'border-rose-500/50 focus:ring-rose-500',
          className,
        )}
        {...props}
      />
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  ),
);

GameInput.displayName = 'GameInput';
