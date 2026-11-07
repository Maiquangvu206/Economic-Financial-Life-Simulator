import { useState } from 'react';
import { cn } from '../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  const [mounted, setMounted] = useState(false);
  setMounted(true);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'rounded-2xl border border-slate-700 bg-surface-900/95 p-6 backdrop-blur-md shadow-2xl shadow-emerald-500/10 max-w-md w-full animate-[fade-in_0.3s_ease-out]',
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          )}
        >
          {title && (
            <div className="mb-4">
              <h3 className="text-sm font-heading font-semibold text-slate-100">{title}</h3>
            </div>
          )}
          <div className="space-y-4">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
