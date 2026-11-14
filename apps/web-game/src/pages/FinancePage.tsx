import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApplyLoanRequest, type BankingOverviewDto } from '@efls/contracts';
import { monthlyPayment, recommendedInterestRate } from '@efls/domain';
import { apiRequest } from '../shared/api/httpClient';
import { formatMoney } from '../shared/lib/format';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { Modal } from '../shared/ui/Modal';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { useToast } from '../shared/ui/Toast';

function moneyMinor(amount: number) {
  return { amount, currency: 'VND' as const };
}

function parseVnd(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Number(digits);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
}

const TIER_LABELS: Record<string, string> = {
  standard: 'Thường',
  silver: 'Bạc',
  gold: 'Vàng',
  platinum: 'Bạch Kim',
  diamond: 'Kim Cương',
};

function tierLabel(tier?: string | null): string {
  if (!tier) return 'Thường';
  return TIER_LABELS[tier] ?? tier;
}

function tierVariant(tier?: string | null): 'default' | 'success' | 'warning' | 'error' {
  if (tier === 'diamond') return 'success';
  if (tier === 'platinum' || tier === 'gold') return 'warning';
  return 'default';
}

type CharacterMe = {
  id: string;
  fullName: string;
  accountNumber: string;
  accountTier: string;
  netWorth?: { amount: number; currency: string };
};

type TransferLookup = {
  accountNumber: string;
  characterId: string;
  fullName: string;
  accountTier: string;
};

type TransferItem = {
  id: string;
  direction: 'in' | 'out';
  counterpartyAccountNumber: string;
  counterpartyName: string;
  amount: { amount: number; currency: string };
  message: string;
  status: 'completed' | 'failed';
  createdAt: string;
};

export function FinancePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: overview,
    isLoading,
    error,
  } = useQuery<BankingOverviewDto>({
    queryKey: ['banking', 'overview'],
    queryFn: () => apiRequest<BankingOverviewDto>('/api/v1/banking/overview'),
  });

  const { data: me } = useQuery<CharacterMe>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest<CharacterMe>('/api/v1/characters/me'),
  });

  const { data: transfersData, isLoading: transfersLoading } = useQuery<{ transfers: TransferItem[] }>({
    queryKey: ['banking', 'transfers'],
    queryFn: () => apiRequest<{ transfers: TransferItem[] }>('/api/v1/banking/transfers'),
  });

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedTerm, setSelectedTerm] = useState(0);
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [depositWithdrawAmounts, setDepositWithdrawAmounts] = useState<Record<string, string>>({});

  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [lookupResult, setLookupResult] = useState<TransferLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const applyLoan = useMutation({
    mutationFn: (req: ApplyLoanRequest) =>
      apiRequest('/api/v1/banking/loans', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      toast({
        title: 'Vay thành công',
        description: 'Khoản vay đã được giải ngân vào tài khoản.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Vay thất bại',
        description: err.message ?? 'Không thể vay tiền.',
        variant: 'error',
      });
    },
  });

  const repayLoan = useMutation({
    mutationFn: ({ loanId, amount }: { loanId: string; amount: number }) =>
      apiRequest(`/api/v1/banking/loans/${loanId}/repay`, {
        method: 'POST',
        body: JSON.stringify({ amount: moneyMinor(amount) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      toast({
        title: 'Trả nợ thành công',
        description: 'Khoản vay đã được cập nhật.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Trả nợ thất bại',
        description: err.message ?? 'Không thể trả nợ.',
        variant: 'error',
      });
    },
  });

  const depositSavings = useMutation({
    mutationFn: ({ amount, termMonths }: { amount: number; termMonths: number }) =>
      apiRequest('/api/v1/banking/savings/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: moneyMinor(amount), termMonths }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      setDepositAmount('');
      toast({
        title: 'Gửi tiết kiệm thành công',
        description: 'Số tiền đã chuyển từ ví vào sổ tiết kiệm.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Gửi tiết kiệm thất bại',
        description: err.message ?? 'Không thể gửi tiền.',
        variant: 'error',
      });
    },
  });

  const withdrawSavings = useMutation({
    mutationFn: ({ amount, depositId }: { amount: number; depositId?: string }) =>
      apiRequest('/api/v1/banking/savings/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: moneyMinor(amount), depositId }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      setWithdrawAmount('');
      const interest = data?.interest?.amount ?? 0;
      toast({
        title: 'Rút tiết kiệm thành công',
        description:
          interest > 0
            ? `Đã rút về ví (gồm lãi ${formatMoney(interest)}).`
            : 'Số tiền đã chuyển về ví cá nhân.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Rút tiết kiệm thất bại',
        description: err.message ?? 'Không thể rút tiền.',
        variant: 'error',
      });
    },
  });

  const lookupTransfer = useMutation({
    mutationFn: (accountNumber: string) =>
      apiRequest<TransferLookup>(
        `/api/v1/banking/transfers/lookup?accountNumber=${encodeURIComponent(accountNumber.trim())}`,
      ),
    onSuccess: (data) => {
      setLookupResult(data);
      setLookupError(null);
    },
    onError: (err: Error) => {
      setLookupResult(null);
      setLookupError(err.message || 'Không tìm thấy tài khoản.');
    },
  });

  const createTransfer = useMutation({
    mutationFn: (payload: { toAccountNumber: string; amount: number; message?: string }) =>
      apiRequest('/api/v1/banking/transfers', {
        method: 'POST',
        body: JSON.stringify({
          toAccountNumber: payload.toAccountNumber,
          amount: moneyMinor(payload.amount),
          message: payload.message ?? '',
        }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'transfers'] });
      queryClient.invalidateQueries({ queryKey: ['characters', 'me'] });
      setTransferAmount('');
      setTransferMessage('');
      toast({
        title: 'Chuyển khoản thành công',
        description: `Đã chuyển ${formatMoney(res?.amount?.amount ?? 0)} tới ${res?.toName ?? lookupResult?.fullName ?? 'người nhận'}.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Chuyển khoản thất bại',
        description: err.message ?? 'Không thể chuyển khoản.',
        variant: 'error',
      });
    },
  });

  const [loanModal, setLoanModal] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanTerm, setLoanTerm] = useState('12');

  const handleApplyLoan = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const amount = parseVnd(loanAmount);
      const term = Number(loanTerm);
      if (!amount || amount <= 0 || !term || term <= 0) return;
      applyLoan.mutate({ amount: moneyMinor(amount), termMonths: term });
      setLoanModal(false);
      setLoanAmount('');
      setLoanTerm('12');
    },
    [loanAmount, loanTerm, applyLoan],
  );

  const loanPreview = useMemo(() => {
    const amount = parseVnd(loanAmount);
    const term = Math.max(0, Math.floor(Number(loanTerm) || 0));
    if (!overview || amount <= 0 || term <= 0) return null;
    const rate = recommendedInterestRate(overview.creditScore, overview.baseRatePct ?? 5);
    const payment = monthlyPayment({ principalMinor: amount, annualRatePct: rate, termMonths: term });
    const monthlyRate = rate / 100 / 12;
    let remaining = amount;
    const schedule: { month: number; payment: number; principal: number; interest: number; remaining: number }[] = [];
    for (let m = 1; m <= term; m++) {
      const interest = monthlyRate === 0 ? 0 : Math.round(remaining * monthlyRate);
      let principal = payment - interest;
      let pay = payment;
      if (m === term || principal >= remaining) {
        principal = remaining;
        pay = principal + interest;
      }
      remaining = Math.max(0, remaining - principal);
      schedule.push({ month: m, payment: pay, principal, interest, remaining });
    }
    const totalPayment = schedule.reduce((s, r) => s + r.payment, 0);
    const totalInterest = Math.max(0, totalPayment - amount);
    return { amount, term, rate, payment, totalPayment, totalInterest, schedule };
  }, [loanAmount, loanTerm, overview]);

  const deposits = overview?.savingsDeposits ?? [];
  const activeDeposits = deposits;
  const terms = overview?.savingsTerms ?? [];
  const totalSavings = overview?.savings.amount ?? 0;
  const cash = overview?.cash.amount ?? 0;

  const selectedTermInfo = useMemo(
    () => terms.find((t) => t.termMonths === selectedTerm) ?? terms[0],
    [terms, selectedTerm],
  );

  const handleDeposit = () => {
    const amount = parseVnd(depositAmount);
    if (amount <= 0) {
      toast({ title: 'Số tiền không hợp lệ', description: 'Nhập số tiền gửi lớn hơn 0.', variant: 'error' });
      return;
    }
    if (amount > cash) {
      toast({
        title: 'Không đủ tiền mặt',
        description: `Tiền mặt hiện có ${formatMoney(cash)}, không đủ để gửi ${formatMoney(amount)}.`,
        variant: 'error',
      });
      return;
    }
    depositSavings.mutate({ amount, termMonths: selectedTerm });
  };

  const handleWithdraw = (depositId?: string, maxForDeposit?: number) => {
    const amount = parseVnd(withdrawAmount);
    if (amount <= 0) {
      toast({ title: 'Số tiền không hợp lệ', description: 'Nhập số tiền rút lớn hơn 0.', variant: 'error' });
      return;
    }
    const limit = depositId ? (maxForDeposit ?? 0) : totalSavings;
    if (amount > limit) {
      toast({
        title: 'Không đủ số dư tiết kiệm',
        description: `Số dư khả dụng ${formatMoney(limit)}, không đủ để rút ${formatMoney(amount)}.${depositId ? ' (theo sổ đã chọn)' : ''}`,
        variant: 'error',
      });
      return;
    }
    withdrawSavings.mutate({ amount, depositId });
  };

  const handleRepay = (loanId: string, maxAmount: number) => {
    const raw = repayAmounts[loanId] ?? '';
    const amount = parseVnd(raw);
    if (amount <= 0) {
      toast({ title: 'Số tiền không hợp lệ', description: 'Nhập số tiền trả lớn hơn 0.', variant: 'error' });
      return;
    }
    if (amount > cash) {
      toast({
        title: 'Không đủ tiền mặt',
        description: `Tiền mặt hiện có ${formatMoney(cash)}, không đủ để trả ${formatMoney(amount)}.`,
        variant: 'error',
      });
      return;
    }
    const pay = Math.min(amount, maxAmount);
    repayLoan.mutate({ loanId, amount: pay });
  };

  const handleLookup = () => {
    const acc = transferTo.trim();
    if (!acc) {
      setLookupError('Vui lòng nhập số tài khoản (STK) người nhận.');
      setLookupResult(null);
      return;
    }
    lookupTransfer.mutate(acc);
  };

  const handleTransfer = () => {
    const amount = parseVnd(transferAmount);
    if (!lookupResult) {
      toast({ title: 'Chưa xác nhận người nhận', description: 'Hãy tra cứu STK người nhận trước.', variant: 'error' });
      return;
    }
    if (amount <= 0) {
      toast({ title: 'Số tiền không hợp lệ', description: 'Nhập số tiền chuyển lớn hơn 0.', variant: 'error' });
      return;
    }
    if (amount > cash) {
      toast({
        title: 'Không đủ tiền mặt',
        description: `Tiền mặt hiện có ${formatMoney(cash)}, không đủ để chuyển ${formatMoney(amount)}.`,
        variant: 'error',
      });
      return;
    }
    createTransfer.mutate({
      toAccountNumber: lookupResult.accountNumber,
      amount,
      message: transferMessage.trim(),
    });
  };

  const copyStk = async () => {
    if (!me?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(me.accountNumber);
      toast({ title: 'Đã sao chép', description: `Số tài khoản ${me.accountNumber} đã được sao chép.` });
    } catch {
      toast({ title: 'Không thể sao chép', description: me.accountNumber, variant: 'error' });
    }
  };

  if (isLoading) {
    return (
      <Panel title="Đang tải..." borderColor="default">
        <p className="text-sm text-slate-600">Đang tải bảng cân đối từ server...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Lỗi tải dữ liệu" borderColor="rose">
        <p className="text-sm text-rose-600">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <GameButton
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] })}
        >
          Thử lại
        </GameButton>
      </Panel>
    );
  }

  if (!overview) {
    return (
      <Panel title="Chưa có dữ liệu" borderColor="default">
        <p className="text-sm text-slate-600">Vui lòng đăng nhập lại.</p>
      </Panel>
    );
  }

  const activeLoans = overview.loans;
  const monthlyDebt = activeLoans.reduce((acc, l) => acc + l.monthlyPayment.amount, 0);

  const loanStatusLabel = (status: string) => {
    if (status === 'repaid') return 'Đã tất toán';
    if (status === 'active') return 'Đang vay';
    if (status === 'grace') return 'Ân hạn';
    if (status === 'defaulted') return 'Quá hạn';
    if (status === 'foreclosed') return 'Thu hồi/Thanh lý';
    return status;
  };

  const loanStatusVariant = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    if (status === 'repaid') return 'success';
    if (status === 'active') return 'default';
    if (status === 'grace') return 'warning';
    return 'error';
  };

  const transfers = transfersData?.transfers ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight">Trung tâm Tài chính</h1>
          <p className="mt-1 text-sm text-slate-600">
            Bảng cân đối, sổ tiết kiệm theo kỳ hạn, khoản vay, chuyển khoản liên người dùng (thời gian thực) và cấp bậc tài khoản.
          </p>
        </div>
        <GameButton
          variant="primary"
          onClick={() => setLoanModal(true)}
          disabled={applyLoan.isPending}
        >
          {applyLoan.isPending ? 'Đang xử lý...' : 'Vay ngân hàng'}
        </GameButton>
      </div>

      <Panel title="Tài khoản của tôi" borderColor="emerald">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Số tài khoản (STK)</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-slate-900">{me?.accountNumber ?? '—'}</span>
              <GameButton variant="outline" size="sm" onClick={copyStk} disabled={!me?.accountNumber}>
                Sao chép
              </GameButton>
            </div>
            <p className="text-xs text-slate-600">Chủ tài khoản: <b>{me?.fullName ?? '—'}</b></p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Cấp bậc tài khoản</p>
            <div className="flex items-center justify-end gap-2">
              <Badge variant={tierVariant(me?.accountTier)}>{tierLabel(me?.accountTier)}</Badge>
            </div>
            <p className="text-[11px] text-slate-500">Dựa trên tài sản ròng (tiền mặt + tiết kiệm − nợ)</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tiền mặt (ví)"
          value={formatMoney(overview.cash.amount)}
          hint="Dùng để gửi tiết kiệm / trả nợ / chuyển khoản"
          tone="positive"
        />
        <StatCard
          label="Tiết kiệm (tổng)"
          value={formatMoney(overview.savings.amount)}
          hint={`${activeDeposits.length} sổ đang hoạt động`}
          tone="positive"
        />
        <StatCard
          label="Tổng nợ"
          value={formatMoney(overview.totalDebt.amount)}
          hint="Khoản vay đang nợ"
          tone="negative"
        />
        <StatCard
          label="Tài sản ròng"
          value={formatMoney(overview.netWorth.amount)}
          hint="Tiền mặt + tiết kiệm − nợ"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Tín dụng & Hạn mức vay" borderColor="emerald">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Credit Score</span>
              <span className="font-mono font-bold text-emerald-700">{overview.creditScore}</span>
            </div>
            <Badge
              variant={
                overview.creditScore >= 740
                  ? 'success'
                  : overview.creditScore >= 650
                    ? 'warning'
                    : 'error'
              }
            >
              {overview.creditBand}
            </Badge>
            <div className="mt-2">
              <span className="text-[11px] text-slate-500 block">Hạn mức vay tối đa</span>
              <span className="font-mono font-semibold text-emerald-700">
                {formatMoney(overview.maxLoanAmount.amount)}
              </span>
            </div>
            <div className="mt-2">
              <span className="text-[11px] text-slate-500 block">Dòng nợ/tháng</span>
              <span className="font-mono font-semibold">
                {monthlyDebt > 0 ? formatMoney(monthlyDebt) : formatMoney(0)}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Gửi / Rút tiết kiệm" borderColor="default">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Tiền mặt khả dụng</span>
              <span className="font-mono font-semibold text-emerald-700">{formatMoney(cash)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Tổng tiết kiệm</span>
              <span className="font-mono font-semibold text-emerald-700">{formatMoney(totalSavings)}</span>
            </div>

            <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gửi tiết kiệm (mở sổ mới)</p>
              <div>
                <label className="text-[11px] text-slate-500">Kỳ hạn & lãi suất (theo cấu hình)</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(Number(e.target.value))}
                >
                  {(terms.length ? terms : [{ termMonths: 0, annualRatePct: 0, earlyWithdrawPenaltyPct: 0, label: 'Không kỳ hạn' }]).map((t) => (
                    <option key={t.termMonths} value={t.termMonths}>
                      {t.label} — {t.annualRatePct}%/năm{t.termMonths > 0 ? ` (phạt rút trước hạn ${t.earlyWithdrawPenaltyPct}%)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <GameInput
                label="Số tiền gửi (VND)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder={`Tối đa ${cash.toLocaleString('vi-VN')}`}
              />
              <div className="flex gap-2">
                <GameButton
                  variant="primary"
                  size="sm"
                  onClick={handleDeposit}
                  disabled={depositSavings.isPending}
                >
                  {depositSavings.isPending ? 'Đang gửi...' : 'Gửi tiết kiệm'}
                </GameButton>
                <GameButton variant="outline" size="sm" onClick={() => setDepositAmount(String(cash))}>
                  Tối đa
                </GameButton>
              </div>
              {selectedTermInfo && (
                <p className="text-[11px] text-slate-500">
                  Lãi suất áp dụng: <b>{selectedTermInfo.annualRatePct}%/năm</b> ({selectedTermInfo.label}).
                  {selectedTermInfo.termMonths > 0 && ' Rút trước hạn sẽ bị giảm lãi theo cấu hình.'}
                </p>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rút tiết kiệm</p>
              <GameInput
                label="Số tiền rút (VND)"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={`Tối đa ${totalSavings.toLocaleString('vi-VN')}`}
              />
              <div className="flex gap-2">
                <GameButton
                  variant="outline"
                  size="sm"
                  onClick={() => handleWithdraw()}
                  disabled={withdrawSavings.isPending || activeDeposits.length === 0}
                >
                  {withdrawSavings.isPending ? 'Đang rút...' : 'Rút (tự chọn sổ)'}
                </GameButton>
                <GameButton variant="outline" size="sm" onClick={() => setWithdrawAmount(String(totalSavings))} disabled={totalSavings <= 0}>
                  Tối đa
                </GameButton>
              </div>
              <p className="text-[11px] text-slate-500">
                Rút tự chọn sổ đủ số dư, hoặc dùng nút “Rút từ sổ này” bên dưới để rút từ sổ cụ thể.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Sổ khoản vay (tóm tắt)" borderColor="rose">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Sổ đang vay</span>
              <span className="font-mono font-semibold">{activeLoans.length} sổ</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Dư nợ hiện tại</span>
              <span className="font-mono font-semibold text-rose-700">{formatMoney(overview.totalDebt.amount)}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Chỉ hiển thị sổ chưa tất toán. Khoản vay quá hạn áp dụng quay vòng lãi: lãi nhập gốc và hạ mức uy tín.
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Chuyển khoản (theo STK, thời gian thực)" borderColor="emerald">
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500">
              Nhập số tài khoản (STK) người nhận để tra cứu, xác nhận tên & cấp bậc, sau đó chuyển tiền từ ví. Người nhận được thông báo ngay (realtime).
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
              <GameInput
                label="Số tài khoản (STK) người nhận"
                value={transferTo}
                onChange={(e) => {
                  setTransferTo(e.target.value);
                  setLookupResult(null);
                  setLookupError(null);
                }}
                placeholder="Nhập STK (10 chữ số)"
              />
              <GameButton variant="outline" onClick={handleLookup} disabled={lookupTransfer.isPending}>
                {lookupTransfer.isPending ? 'Đang tra cứu...' : 'Tra cứu'}
              </GameButton>
            </div>
            {lookupError && <p className="text-[11px] text-rose-600">{lookupError}</p>}
            {lookupResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{lookupResult.fullName}</p>
                    <p className="text-[11px] text-slate-600">STK: <span className="font-mono">{lookupResult.accountNumber}</span></p>
                  </div>
                  <Badge variant={tierVariant(lookupResult.accountTier)}>{tierLabel(lookupResult.accountTier)}</Badge>
                </div>
              </div>
            )}

            <GameInput
              label="Số tiền chuyển (VND)"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder={`Tối đa ${cash.toLocaleString('vi-VN')}`}
            />
            <div className="flex gap-2">
              <GameButton variant="outline" size="sm" onClick={() => setTransferAmount(String(cash))} disabled={cash <= 0}>
                Tối đa
              </GameButton>
            </div>
            <GameInput
              label="Nội dung chuyển khoản"
              value={transferMessage}
              onChange={(e) => setTransferMessage(e.target.value)}
              placeholder="Lời nhắn (tùy chọn)"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">Số dư ví hiện tại: <b>{formatMoney(cash)}</b></p>
              <GameButton
                variant="primary"
                onClick={handleTransfer}
                disabled={createTransfer.isPending || !lookupResult}
              >
                {createTransfer.isPending ? 'Đang chuyển...' : 'Chuyển khoản'}
              </GameButton>
            </div>
          </div>
        </Panel>

        <Panel title="Lịch sử chuyển khoản" borderColor="default">
          {transfersLoading ? (
            <p className="text-sm text-slate-500">Đang tải lịch sử...</p>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có giao dịch chuyển khoản.</p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {transfers.map((t) => {
                const incoming = t.direction === 'in';
                return (
                  <div key={t.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">
                          {incoming ? 'Nhận từ' : 'Chuyển tới'} {t.counterpartyName}
                        </p>
                        <p className="text-[11px] text-slate-500">STK: <span className="font-mono">{t.counterpartyAccountNumber}</span></p>
                        {t.message ? <p className="text-[11px] text-slate-600 mt-0.5">ND: {t.message}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className={`font-mono font-semibold ${incoming ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {incoming ? '+' : '-'}{formatMoney(t.amount.amount)}
                        </p>
                        <p className="text-[11px] text-slate-500">{fmtDateTime(t.createdAt)}</p>
                        <Badge variant={t.status === 'completed' ? 'success' : 'error'}>
                          {t.status === 'completed' ? 'Thành công' : 'Thất bại'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Sổ khoản vay của bạn" borderColor="rose">
        {overview.loans.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có sổ khoản vay nào (chỉ hiển thị sổ chưa tất toán).</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overview.loans.map((loan) => {
              const repayVal = repayAmounts[loan.id] ?? '';
              return (
                <div key={loan.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Sổ vay {loan.collateral ? '(thế chấp BĐS)' : '(tín chấp)'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Mở: {fmtDate(loan.createdAt ?? null)} • Kỳ hạn: {loan.termMonths} tháng
                      </p>
                    </div>
                    <Badge variant={loanStatusVariant(loan.status)}>{loanStatusLabel(loan.status)}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <span className="text-slate-500">Dư nợ</span>
                    <span className="font-mono font-semibold text-right">{formatMoney(loan.outstanding.amount)}</span>
                    <span className="text-slate-500">Gốc vay</span>
                    <span className="font-mono text-right">{formatMoney(loan.principal.amount)}</span>
                    <span className="text-slate-500">Lãi suất</span>
                    <span className="font-mono text-right">{loan.interestRatePct}%/năm</span>
                    <span className="text-slate-500">Trả hàng tháng</span>
                    <span className="font-mono text-right">{formatMoney(loan.monthlyPayment.amount)}</span>
                    <span className="text-slate-500">Kỳ trả tiếp</span>
                    <span className="font-mono text-right">{fmtDate(loan.nextDueAt)}</span>
                  </div>

                  {loan.collateral ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-900">
                      <p className="font-semibold">Thế chấp bất động sản</p>
                      <p>Loại: {loan.collateral.propertyType}</p>
                      <p>Vị trí: {loan.collateral.nodeName ?? '—'}</p>
                      <p>Giá trị tham chiếu: {formatMoney(loan.collateral.currentValue.amount)}</p>
                      <p className="text-amber-800">Mã BĐS: {loan.collateral.propertyId}</p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">Không có tài sản thế chấp.</p>
                  )}

                  <div className="space-y-1.5 pt-1 border-t border-slate-200">
                    <GameInput
                      label="Số tiền trả (VND)"
                      value={repayVal}
                      onChange={(e) =>
                        setRepayAmounts((prev) => ({ ...prev, [loan.id]: e.target.value }))
                      }
                      placeholder={String(Math.min(loan.outstanding.amount, cash))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <GameButton
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setRepayAmounts((prev) => ({
                            ...prev,
                            [loan.id]: String(Math.min(loan.outstanding.amount, cash)),
                          }))
                        }
                      >
                        Tối đa
                      </GameButton>
                      <GameButton
                        variant="danger"
                        size="sm"
                        onClick={() => handleRepay(loan.id, loan.outstanding.amount)}
                        disabled={repayLoan.isPending}
                      >
                        {repayLoan.isPending ? '...' : 'Trả nợ'}
                      </GameButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Sổ tiết kiệm của bạn" borderColor="default">
        {deposits.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có sổ tiết kiệm đang hoạt động. Hãy gửi tiền để mở sổ theo kỳ hạn.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {deposits.map((d) => {
              const termInfo = terms.find((t) => t.termMonths === d.termMonths);
              const matured = d.maturesAt ? new Date(d.maturesAt).getTime() <= Date.now() : true;
              const depW = depositWithdrawAmounts[d.id] ?? '';
              return (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {termInfo?.label ?? (d.termMonths === 0 ? 'Không kỳ hạn' : `${d.termMonths} tháng`)}
                      </p>
                      <p className="text-[11px] text-slate-500">Mở: {fmtDate(d.openedAt)} • Đáo hạn: {fmtDate(d.maturesAt)}</p>
                    </div>
                    <Badge variant={matured ? 'success' : 'warning'}>{matured ? 'Đã đáo hạn' : 'Trong kỳ hạn'}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <span className="text-slate-500">Số dư</span>
                    <span className="font-mono font-semibold text-right">{formatMoney(d.balance.amount)}</span>
                    <span className="text-slate-500">Gốc</span>
                    <span className="font-mono text-right">{formatMoney(d.principal.amount)}</span>
                    <span className="text-slate-500">Lãi suất</span>
                    <span className="font-mono text-right">{d.annualRatePct}%/năm</span>
                    <span className="text-slate-500">Lãi ước tính</span>
                    <span className="font-mono text-right text-emerald-700">{formatMoney(d.interestEarned.amount)}</span>
                  </div>
                  {d.termMonths > 0 && (
                    <p className="text-[11px] text-emerald-700">
                      Đến hạn không rút: tự động gia hạn, lãi nhập gốc (quay vòng gốc lãi).
                    </p>
                  )}
                  {!matured && termInfo && termInfo.earlyWithdrawPenaltyPct > 0 && (
                    <p className="text-[11px] text-amber-700">
                      Rút trước hạn: giảm {termInfo.earlyWithdrawPenaltyPct}% phần lãi (theo cấu hình).
                    </p>
                  )}
                  <div className="space-y-1.5 pt-1 border-t border-slate-200">
                    <GameInput
                      label="Số tiền rút từ sổ này (VND)"
                      value={depW}
                      onChange={(e) =>
                        setDepositWithdrawAmounts((prev) => ({ ...prev, [d.id]: e.target.value }))
                      }
                      placeholder={String(d.balance.amount)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <GameButton
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDepositWithdrawAmounts((prev) => ({
                            ...prev,
                            [d.id]: String(d.balance.amount),
                          }))
                        }
                      >
                        Toàn bộ
                      </GameButton>
                      <GameButton
                        variant="primary"
                        size="sm"
                        disabled={withdrawSavings.isPending || d.balance.amount <= 0}
                        onClick={() => {
                          const amt = parseVnd(depositWithdrawAmounts[d.id] ?? '');
                          if (amt <= 0) {
                            toast({
                              title: 'Chưa nhập số tiền',
                              description: 'Nhập số tiền cần rút từ sổ này.',
                              variant: 'error',
                            });
                            return;
                          }
                          if (amt > d.balance.amount) {
                            toast({
                              title: 'Không đủ số dư sổ',
                              description: `Sổ này còn ${formatMoney(d.balance.amount)}, không đủ để rút ${formatMoney(amt)}.`,
                              variant: 'error',
                            });
                            return;
                          }
                          withdrawSavings.mutate({ amount: amt, depositId: d.id });
                        }}
                      >
                        Rút từ sổ này
                      </GameButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Modal open={loanModal} onClose={() => setLoanModal(false)} title="Đơn vay ngân hàng">
        <form onSubmit={handleApplyLoan} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <GameInput
                label="Số tiền vay (VND)"
                value={loanAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoanAmount(e.target.value)}
                placeholder="Nhập số tiền..."
                required
              />
              <GameButton type="button" variant="outline" size="sm" onClick={() => setLoanAmount(String(overview.maxLoanAmount.amount))}>
                Điền hạn mức tối đa
              </GameButton>
            </div>
            <GameInput
              label="Kỳ hạn (tháng)"
              type="number"
              value={loanTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoanTerm(e.target.value)}
              placeholder="12"
              required
            />
          </div>

          <p className="text-[11px] text-slate-500">
            Lãi suất ước tính theo Credit Score ({overview.creditScore}) và lãi suất cơ sở {overview.baseRatePct ?? 5}%/năm. Hạn mức tối đa:{' '}
            {formatMoney(overview.maxLoanAmount.amount)}.
          </p>

          {loanPreview ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Ước tính khoản vay (như thực tế)</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-[11px] text-slate-500">Lãi suất dự kiến</div>
                  <div className="font-mono font-semibold text-emerald-700">{loanPreview.rate}%/năm</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Trả hàng tháng</div>
                  <div className="font-mono font-semibold">{formatMoney(loanPreview.payment)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Tổng gốc</div>
                  <div className="font-mono font-semibold">{formatMoney(loanPreview.amount)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Tổng lãi (ước tính)</div>
                  <div className="font-mono font-semibold text-amber-700">{formatMoney(loanPreview.totalInterest)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Tổng gốc + lãi</div>
                  <div className="font-mono font-semibold">{formatMoney(loanPreview.totalPayment)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Kỳ hạn</div>
                  <div className="font-mono font-semibold">{loanPreview.term} tháng</div>
                </div>
              </div>
              {loanPreview.amount > overview.maxLoanAmount.amount && (
                <p className="text-[11px] text-rose-600">
                  Số tiền vượt hạn mức tối đa {formatMoney(overview.maxLoanAmount.amount)} (đơn có thể bị từ chối).
                </p>
              )}
              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-1">Lịch trả nợ dự kiến từng tháng</p>
                <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">Kỳ</th>
                        <th className="px-2 py-1 text-right font-medium">Phải trả</th>
                        <th className="px-2 py-1 text-right font-medium">Gốc</th>
                        <th className="px-2 py-1 text-right font-medium">Lãi</th>
                        <th className="px-2 py-1 text-right font-medium">Dư nợ còn lại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanPreview.schedule.map((row) => (
                        <tr key={row.month} className="border-t border-slate-100">
                          <td className="px-2 py-1">Tháng {row.month}</td>
                          <td className="px-2 py-1 text-right font-mono">{formatMoney(row.payment)}</td>
                          <td className="px-2 py-1 text-right font-mono">{formatMoney(row.principal)}</td>
                          <td className="px-2 py-1 text-right font-mono">{formatMoney(row.interest)}</td>
                          <td className="px-2 py-1 text-right font-mono">{formatMoney(row.remaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  * Ước tính theo công thức trả góp đều (annuity). Lãi suất/khoản trả thực tế do server xác định tại thời điểm giải ngân.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Nhập số tiền và kỳ hạn để xem lãi suất, lịch trả góp và tổng gốc lãi.</p>
          )}

          <div className="flex justify-end">
            <GameButton variant="primary" type="submit" disabled={applyLoan.isPending}>
              {applyLoan.isPending ? 'Đang gửi...' : 'Gửi đơn'}
            </GameButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
