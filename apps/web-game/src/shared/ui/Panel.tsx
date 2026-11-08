import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PanelProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  borderColor?: 'default' | 'emerald' | 'amber' | 'rose';
}

const BORDER: Record<string, string> = {
  default: 'border-slate-200',
  emerald: 'border-emerald-200',
  amber: 'border-amber-200',
  rose: 'border-rose-200',
};

export function Panel({ children, title, subtitle, borderColor = 'default' }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/90 p-5 shadow-sm backdrop-blur-sm',
        BORDER[borderColor ?? 'default'],
      )}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-heading font-semibold text-slate-800 tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[10px] uppercase tracking-wider text-slate-400">{subtitle}</span>
          )}
        </div>
      )}
      <div className="pt-1">{children}</div>
    </div>
  );
}
