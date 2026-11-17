import { cn } from '../lib/cn';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: ModalSize;
  /** Extra classes for the modal panel */
  className?: string;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-[96vw]',
};

export function Modal({ open, onClose, title, children, size = 'md', className }: ModalProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            'flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-soft',
            'animate-[fade-in_0.2s_ease-out]',
            SIZE_CLASS[size],
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="mb-3 sm:mb-4 shrink-0 pr-2">
              <h3 className="text-sm font-heading font-semibold text-slate-800 break-words">{title}</h3>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
          <div className="mt-4 sm:mt-6 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-3">
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
