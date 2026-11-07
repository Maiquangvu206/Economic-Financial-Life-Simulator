export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-slate-800 text-slate-300 ring-slate-700',
  success: 'bg-emerald-950 text-emerald-300 ring-emerald-800',
  warning: 'bg-amber-950 text-amber-300 ring-amber-800',
  danger: 'bg-rose-950 text-rose-300 ring-rose-800',
  info: 'bg-sky-950 text-sky-300 ring-sky-800',
};

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}
