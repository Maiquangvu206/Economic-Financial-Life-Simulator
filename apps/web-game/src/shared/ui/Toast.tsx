import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
  durationMs?: number;
}

const VARIANT: Record<string, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
};

type Listener = (toasts: Toast[]) => void;
let toastState: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toastState);
}

export function toast(t: Omit<Toast, 'id'>) {
  const id = crypto.randomUUID();
  toastState = [...toastState, { ...t, id }];
  emit();
  const duration = typeof t.durationMs === 'number' ? t.durationMs : 5000;
  setTimeout(() => {
    toastState = toastState.filter((x) => x.id !== id);
    emit();
  }, duration);
}

export function dismissToast(id: string) {
  toastState = toastState.filter((x) => x.id !== id);
  emit();
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastState);
  useEffect(() => {
    const l: Listener = (next) => setToasts(next);
    listeners.add(l);
    setToasts(toastState);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { toasts, toast, dismiss: dismissToast };
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto max-w-sm flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-[slide-in_0.2s_ease-out]',
            VARIANT[t.variant ?? 'info'],
          )}
          onClick={() => dismiss(t.id)}
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold">
            {t.variant === 'success' ? '✓' : t.variant === 'error' ? '✕' : t.variant === 'warning' ? '!' : 'i'}
          </span>
          <div className="min-w-0">
            <div>{t.title}</div>
            {t.description && <div className="mt-0.5 text-[11px] font-normal opacity-90 break-words">{t.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
