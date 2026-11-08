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
          'flex h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-50',
          error && 'border-rose-300 focus:border-rose-400 focus:ring-rose-100',
          className,
        )}
        {...props}
      />
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  ),
);

GameInput.displayName = 'GameInput';
