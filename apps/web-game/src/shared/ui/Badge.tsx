export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  const variants: Record<string, string> = {
    default: 'bg-slate-800 text-slate-300 border border-slate-700',
    success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    error: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
  };
  return <span className={`${base} ${variants[variant]}`}>{children}</span>;
}
