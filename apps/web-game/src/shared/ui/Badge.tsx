export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  const variants: Record<string, string> = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-100 text-amber-700 border border-amber-200',
    error: 'bg-rose-100 text-rose-700 border border-rose-200',
  };
  return <span className={`${base} ${variants[variant]}`}>{children}</span>;
}
