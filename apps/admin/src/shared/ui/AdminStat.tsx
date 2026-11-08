export interface AdminStatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

const TONE: Record<NonNullable<AdminStatProps['tone']>, string> = {
  default: 'text-slate-900',
  positive: 'text-emerald-700',
  negative: 'text-rose-600',
  warning: 'text-amber-700',
};

export function AdminStat({ label, value, hint, tone = 'default' }: AdminStatProps) {
  return (
    <div className="panel">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${TONE[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
