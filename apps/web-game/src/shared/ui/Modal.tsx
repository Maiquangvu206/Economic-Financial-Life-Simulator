import { cn } from '../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-soft',
            'animate-[fade-in_0.2s_ease-out]',
          )}
        >
          {title && (
            <div className="mb-4">
              <h3 className="text-sm font-heading font-semibold text-slate-800">{title}</h3>
            </div>
          )}
          <div className="space-y-4">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
