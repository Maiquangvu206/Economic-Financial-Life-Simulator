import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DialogType = 'danger' | 'warning' | 'info' | 'success';

/** Nội dung hộp thoại: chuỗi đơn, mảng chuỗi (render thành danh sách gạch đầu dòng) hoặc JSX tuỳ ý. */
export type DialogMessage = string | string[] | ReactNode;

export interface ConfirmOptions {
  /** Tiêu đề đậm của hộp thoại. */
  title: string;
  /** Nội dung chi tiết. Truyền mảng chuỗi để hiển thị danh sách gạch đầu dòng. */
  message?: DialogMessage;
  /** Ngữ cảnh: danger (đỏ - bỏ học/xóa/phá sản), warning (hổ phách), info (xanh ngọc), success (xanh lá). */
  type?: DialogType;
  /** Nhãn nút xác nhận (bên phải). Mặc định: "Xác nhận". */
  confirmText?: string;
  /** Nhãn nút hủy (bên trái). Mặc định: "Hủy bỏ". */
  cancelText?: string;
}

export interface AlertOptions extends Omit<ConfirmOptions, 'confirmText'> {
  /** Nhãn nút duy nhất. Mặc định: "Đã hiểu". */
  confirmText?: string;
}

export interface PromptOptions extends ConfirmOptions {
  /** Giá trị mặc định của ô nhập. */
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'number' | 'password';
  /** Cho phép nhập nhiều dòng (textarea, Enter xuống dòng, Ctrl/Cmd+Enter xác nhận). */
  multiline?: boolean;
  /** Bắt buộc nhập nội dung mới được xác nhận. */
  required?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context & Provider
// ─────────────────────────────────────────────────────────────────────────────

interface DialogRequestBase {
  kind: 'confirm' | 'alert' | 'prompt';
  resolve: (value: never) => void;
  options: PromptOptions; // union lớn nhất, render theo kind
}

interface DialogContextValue {
  /** Thay thế window.confirm(): trả về true nếu người chơi xác nhận. */
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
  /** Thay thế window.alert(): modal thông báo quan trọng nằm giữa màn hình, chỉ có 1 nút "Đã hiểu". */
  alert: (options: string | AlertOptions) => Promise<boolean>;
  /** Thay thế window.prompt(): trả về chuỗi nhập, hoặc null nếu hủy. */
  prompt: (options: string | PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function normalizeTitle(options: string | object): PromptOptions {
  return typeof options === 'string' ? { title: options } : (options as PromptOptions);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequestBase[]>([]);

  const push = useCallback(
    <V,>(kind: DialogRequestBase['kind'], options: string | object, resolve: (value: V) => void) => {
      const request: DialogRequestBase = { kind, resolve: resolve as (value: never) => void, options: normalizeTitle(options) };
      setQueue((prev) => [...prev, request]);
    },
    [],
  );

  const confirm = useCallback<DialogContextValue['confirm']>(
    (options) => new Promise<boolean>((resolve) => push('confirm', options, resolve)),
    [push],
  );

  const alert = useCallback<DialogContextValue['alert']>(
    (options) => new Promise<boolean>((resolve) => push('alert', options, resolve)),
    [push],
  );

  const prompt = useCallback<DialogContextValue['prompt']>(
    (options) => new Promise<string | null>((resolve) => push('prompt', options, resolve)),
    [push],
  );

  const close = useCallback(
    <V,>(request: DialogRequestBase, value: V) => {
      setQueue((prev) => prev.filter((r) => r !== request));
      request.resolve(value as never);
    },
    [],
  );

  const value = useMemo<DialogContextValue>(() => ({ confirm, alert, prompt }), [confirm, alert, prompt]);

  const current = queue[0] ?? null;

  return (
    <DialogContext.Provider value={value}>
      {children}
      {current && <DialogRenderer request={current} close={close} />}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog() phải được dùng bên trong <DialogProvider>.');
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styling helpers (theo bảng màu game sáng pastel)
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<DialogType, { iconClass: string; buttonClass: string }> = {
  danger: { iconClass: 'bg-rose-100 text-rose-600', buttonClass: 'bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white shadow-sm shadow-rose-500/30' },
  warning: { iconClass: 'bg-amber-100 text-amber-600', buttonClass: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-sm shadow-amber-500/30' },
  info: { iconClass: 'bg-teal-100 text-teal-600', buttonClass: 'bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white shadow-sm shadow-teal-500/30' },
  success: { iconClass: 'bg-emerald-100 text-emerald-600', buttonClass: 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-sm shadow-emerald-500/30' },
};

function TypeIcon({ type }: { type: DialogType }) {
  const cls = 'h-6 w-6';
  switch (type) {
    case 'danger':
    case 'warning':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'success':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

function MessageBody({ message }: { message?: DialogMessage }) {
  if (message == null || message === '') return null;
  if (Array.isArray(message)) {
    return (
      <ul className="list-disc space-y-1.5 pl-5 marker:text-slate-400">
        {message.map((line, i) => (
          <li key={i} className="leading-relaxed">
            {line}
          </li>
        ))}
      </ul>
    );
  }
  return <div className="whitespace-pre-line leading-relaxed">{message}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer: ConfirmDialog / AlertModal / PromptModal (chính giữa màn hình)
// ─────────────────────────────────────────────────────────────────────────────

function DialogRenderer({
  request,
  close,
}: {
  request: DialogRequestBase;
  close: <V,>(request: DialogRequestBase, value: V) => void;
}) {
  const { kind, options } = request;
  const type: DialogType = options.type ?? (kind === 'confirm' ? 'warning' : kind === 'alert' ? 'info' : 'info');
  const styles = TYPE_STYLES[type];
  const isAlert = kind === 'alert';
  const isPrompt = kind === 'prompt';

  const [draft, setDraft] = useState(options.defaultValue ?? '');
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const closeWith = useCallback(
    (confirmed: boolean) => {
      if (isPrompt) {
        close(request, (confirmed ? draftRef.current : null) as never);
      } else {
        close(request, confirmed as never);
      }
    },
    [close, isPrompt, request],
  );

  // ESC = đóng/hủy, Enter = xác nhận (prompt 1 dòng); prompt multiline dùng Ctrl+Enter.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWith(false);
        return;
      }
      if (e.key === 'Enter' && !(isPrompt && options.multiline && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        if (isPrompt && options.required && !draftRef.current.trim()) return;
        closeWith(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeWith, isPrompt, options.multiline, options.required]);

  const confirmLabel = options.confirmText ?? (isAlert ? 'Đã hiểu' : isPrompt ? 'Xác nhận' : 'Xác nhận');
  const cancelLabel = options.cancelText ?? 'Hủy bỏ';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-[dialog-fade_0.15s_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeWith(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={options.title}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-[dialog-zoom_0.15s_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconClass}`}>
            <TypeIcon type={type} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">{options.title}</h3>
            {options.message != null && (
              <div className="mt-1.5 text-sm text-slate-600">
                <MessageBody message={options.message} />
              </div>
            )}
          </div>
        </div>

        {isPrompt && (
          <div className="mt-4">
            {options.multiline ? (
              <textarea
                autoFocus
                rows={3}
                value={draft}
                placeholder={options.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            ) : (
              <input
                autoFocus
                type={options.inputType ?? 'text'}
                value={draft}
                placeholder={options.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            )}
            {options.multiline && (
              <p className="mt-1 text-[11px] text-slate-400">Nhấn Ctrl/Cmd + Enter để xác nhận, ESC để hủy.</p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          {!isAlert && (
            <button
              type="button"
              onClick={() => closeWith(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isPrompt && options.required && !draftRef.current.trim()) return;
              closeWith(true);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${styles.buttonClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
