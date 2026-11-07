import { clsx, type ClassValue } from 'clsx';

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

const TONE_CLASS: Record<string, string> = {
  default: 'text-slate-100',
  positive: 'text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
  negative: 'text-rose-400 shadow-[0_0_12px_rgba(239,68,68,0.25)]',
  warning: 'text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
};

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-800 bg-surface-900/80 p-5 backdrop-blur-sm shadow-sm transition-all hover:border-slate-600',
        TONE_CLASS[tone ?? 'default'],
      )}
    >
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1">
        <span className="font-mono text-lg font-bold">{value}</span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
