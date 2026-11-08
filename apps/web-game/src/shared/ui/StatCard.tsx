import { clsx } from 'clsx';

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

const TONE_CLASS: Record<string, string> = {
  default: 'text-slate-900',
  positive: 'text-emerald-600',
  negative: 'text-rose-600',
  warning: 'text-amber-600',
};

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md',
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
