import { Modal } from './Modal';
import { GameButton } from './GameButton';
import { formatMoney } from '../lib/format';

export interface TransactionConfirmDetail {
  label: string;
  value: string;
  emphasize?: boolean;
}

interface TransactionConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  transactionType: string;
  targetLabel?: string;
  targetValue?: string;
  amountLabel?: string;
  amountValue?: string;
  amountMinor?: number;
  feeOrRateLabel?: string;
  feeOrRateValue?: string;
  projectedBalanceLabel?: string;
  projectedBalanceMinor?: number;
  details?: TransactionConfirmDetail[];
  warning?: string;
  confirmText?: string;
  cancelText?: string;
}

export function TransactionConfirmModal({
  open,
  onClose,
  onConfirm,
  loading = false,
  disabled = false,
  title = 'Xác nhận giao dịch',
  transactionType,
  targetLabel = 'Đối tượng/Bên nhận',
  targetValue,
  amountLabel = 'Số tiền giao dịch',
  amountValue,
  amountMinor,
  feeOrRateLabel = 'Phí/Lãi suất (nếu có)',
  feeOrRateValue,
  projectedBalanceLabel = 'Số dư dự kiến sau giao dịch',
  projectedBalanceMinor,
  details = [],
  warning,
  confirmText = 'Xác nhận thực hiện',
  cancelText = 'Hủy',
}: TransactionConfirmModalProps) {
  const amountDisplay = amountValue ?? (typeof amountMinor === 'number' ? formatMoney(amountMinor) : '—');
  const projectedDisplay =
    typeof projectedBalanceMinor === 'number' ? formatMoney(projectedBalanceMinor) : '—';
  const feeDisplay = feeOrRateValue && feeOrRateValue.trim() ? feeOrRateValue : 'Không có';

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[170px_1fr]">
            <div className="text-slate-500">Loại giao dịch</div>
            <div className="font-semibold text-slate-900">{transactionType}</div>

            <div className="text-slate-500">{targetLabel}</div>
            <div className="font-medium text-slate-800 break-words">{targetValue || '—'}</div>

            <div className="text-slate-500">{amountLabel}</div>
            <div className="font-mono font-semibold text-emerald-700">{amountDisplay}</div>

            <div className="text-slate-500">{feeOrRateLabel}</div>
            <div className="font-medium text-slate-800">{feeDisplay}</div>

            <div className="text-slate-500">{projectedBalanceLabel}</div>
            <div className="font-mono font-semibold text-slate-900">{projectedDisplay}</div>

            {details.map((d) => (
              <div key={`${d.label}-${d.value}`} className="contents">
                <div className="text-slate-500">{d.label}</div>
                <div className={d.emphasize ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}>
                  {d.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {warning ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {warning}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <GameButton variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </GameButton>
          <GameButton variant="primary" onClick={() => void onConfirm()} loading={loading} disabled={loading || disabled}>
            {confirmText}
          </GameButton>
        </div>
      </div>
    </Modal>
  );
}