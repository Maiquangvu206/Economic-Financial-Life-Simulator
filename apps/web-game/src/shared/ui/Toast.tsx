import { useCallback, useState } from 'react';
import { cn } from '../lib/cn';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
}

const VARIANT: Record<string, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  info: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
};

interface UseToastReturn {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return { toasts, toast, dismiss };
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl shadow-black/40 animate-[slide-in_0.3s_ease-out]',
            VARIANT[t.variant ?? 'info'],
          )}
          onClick={() => dismiss(t.id)}
        >
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold">
            {t.variant === 'success'
              ? '✓'
              : t.variant === 'error'
                ? '✕'
                : t.variant === 'warning'
                  ? '!'
                  : 'i'}
          </span>
          <div>
            <div className="text-slate-100">{t.title}</div>
            {t.description && (
              <div className="text-[11px] text-slate-400 mt-0.5">{t.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
