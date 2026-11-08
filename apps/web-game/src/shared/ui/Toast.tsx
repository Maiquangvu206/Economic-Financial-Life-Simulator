import { useCallback, useState } from 'react';
import { cn } from '../lib/cn';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
}

const VARIANT: Record<string, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
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
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-soft animate-[slide-in_0.2s_ease-out]',
            VARIANT[t.variant ?? 'info'],
          )}
          onClick={() => dismiss(t.id)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold">
            {t.variant === 'success'
              ? '✓'
              : t.variant === 'error'
                ? '✕'
                : t.variant === 'warning'
                  ? '!'
                  : 'i'}
          </span>
          <div>
            <div>{t.title}</div>
            {t.description && (
              <div className="mt-0.5 text-[11px] font-normal opacity-80">{t.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
