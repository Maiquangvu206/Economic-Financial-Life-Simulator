import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PanelProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  borderColor?: 'default' | 'emerald' | 'amber' | 'rose';
}

const BORDER: Record<string, string> = {
  default: 'border-slate-800',
  emerald: 'border-emerald-500/30',
  amber: 'border-amber-500/30',
  rose: 'border-rose-500/30',
};

export function Panel({ children, title, subtitle, borderColor = 'default' }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface-900/80 p-5 backdrop-blur-sm shadow-game-glow',
        BORDER[borderColor ?? 'default'],
      )}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-heading font-semibold text-slate-100 tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{subtitle}</span>
          )}
        </div>
      )}
      <div className="pt-1">{children}</div>
    </div>
  );
}
