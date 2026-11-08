export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-800',
  danger: 'bg-rose-50 text-rose-600 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
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
