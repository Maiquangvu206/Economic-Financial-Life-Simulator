import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApplyLoanRequest, type BankingOverviewDto } from '@efls/contracts';
import { monthlyPayment, recommendedInterestRate } from '@efls/domain';
import { apiRequest, createIdempotencyKey } from '../shared/api/httpClient';
import { formatMoney, formatMoneyPerMonth, formatRatePerYear } from '../shared/lib/format';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { CCCDLookupInput } from '../shared/identity/CCCDLookupInput';
import { Modal } from '../shared/ui/Modal';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { useToast } from '../shared/ui/Toast';
import { TransactionConfirmModal } from '../shared/ui/TransactionConfirmModal';

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

function creditBandLabel(band?: string | null): string {
  switch (band) {
    case 'very_good':
      return 'Rất tốt';
    case 'excellent':
      return 'Xuất sắc';
    case 'good':
      return 'Tốt';
    case 'fair':
      return 'Trung bình';
    case 'poor':
      return 'Thấp';
    default:
      return band || '—';
  }
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
  cccdMasked?: string;
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

type AccountHistoryItem = {
  id: string;
  transactionId: string;
  accountKind: 'cash' | 'savings';
  delta: { amount: number; currency: string };
  kind: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
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

  const { data: historyData, isLoading: historyLoading } = useQuery<{ items: AccountHistoryItem[] }>({
    queryKey: ['banking', 'history'],
    queryFn: () => apiRequest<{ items: AccountHistoryItem[] }>('/api/v1/banking/history?limit=30'),
  });

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedTerm, setSelectedTerm] = useState(0);
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [depositWithdrawAmounts, setDepositWithdrawAmounts] = useState<Record<string, string>>({});

  const [transferCccd, setTransferCccd] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [lookupResult, setLookupResult] = useState<TransferLookup | null>(null);

  const applyLoan = useMutation({
    mutationFn: ({ req, idempotencyKey }: { req: ApplyLoanRequest; idempotencyKey: string }) =>
      apiRequest('/api/v1/banking/loans', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify(req),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'history'] });
      setConfirmTx(null);
      setLoanModal(false);
      setLoanAmount('');
      setLoanTerm('12');
      setLoanCollateral('none');
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
      queryClient.invalidateQueries({ queryKey: ['banking', 'history'] });
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
    mutationFn: ({ amount, termMonths, idempotencyKey }: { amount: number; termMonths: number; idempotencyKey: string }) =>
      apiRequest('/api/v1/banking/savings/deposit', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amount: moneyMinor(amount), termMonths }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'history'] });
      setDepositAmount('');
      setConfirmTx(null);
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
    mutationFn: ({ amount, depositId, idempotencyKey }: { amount: number; depositId?: string; idempotencyKey: string }) =>
      apiRequest('/api/v1/banking/savings/withdraw', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amount: moneyMinor(amount), depositId }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'history'] });
      setWithdrawAmount('');
      setConfirmTx(null);
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

  const withdrawSavingsInterest = useMutation({
    mutationFn: ({ depositId, idempotencyKey }: { depositId: string; idempotencyKey: string }) =>
      apiRequest('/api/v1/banking/savings/withdraw-interest', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ depositId }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['characters', 'me'] });
      setConfirmTx(null);
      toast({
        title: 'Đã rút lãi thành công',
        description: `${formatMoney(data?.interest?.amount ?? 0)} đã chuyển vào tiền mặt; gốc vẫn ở trong sổ.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Rút lãi thất bại',
        description: err.message ?? 'Không thể rút lãi.',
        variant: 'error',
      });
    },
  });

  const lookupTransfer = useMutation({
    mutationFn: (cccd: string) =>
      apiRequest<TransferLookup>(`/api/v1/banking/transfers/lookup?cccd=${encodeURIComponent(cccd.trim())}`),
    onSuccess: (data) => { setLookupResult(data); },
    onError: () => { setLookupResult(null); },
  });

  const createTransfer = useMutation({
    mutationFn: (payload: { targetCccd: string; amount: number; message?: string; idempotencyKey: string }) =>
      apiRequest('/api/v1/banking/transfers', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': payload.idempotencyKey },
        body: JSON.stringify({
          targetCccd: payload.targetCccd,
          amount: moneyMinor(payload.amount),
          message: payload.message ?? '',
        }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'transfers'] });
      queryClient.invalidateQueries({ queryKey: ['banking', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['characters', 'me'] });
      setTransferAmount('');
      setTransferMessage('');
      setConfirmTx(null);
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
  const [loanCollateral, setLoanCollateral] = useState<string>('none'); // none | property:<id> | company:<id>

  const [activeTab, setActiveTab] = useState<'overview' | 'transfer' | 'savings' | 'loans' | 'history'>('overview');

  const [confirmTx, setConfirmTx] = useState<
    | null
    | { kind: 'transfer'; targetCccd: string; amount: number; message: string; idempotencyKey: string }
    | { kind: 'deposit'; amount: number; termMonths: number; idempotencyKey: string }
    | { kind: 'withdraw'; amount: number; depositId?: string; idempotencyKey: string }
    | { kind: 'withdrawInterest'; amount: number; depositId: string; idempotencyKey: string }
    | { kind: 'loan'; req: ApplyLoanRequest; amount: number; termMonths: number; ratePct: number; idempotencyKey: string }
  >(null);

  const confirmTxBusy =
    (confirmTx?.kind === 'transfer' && createTransfer.isPending) ||
    (confirmTx?.kind === 'deposit' && depositSavings.isPending) ||
    (confirmTx?.kind === 'withdraw' && withdrawSavings.isPending) ||
    (confirmTx?.kind === 'withdrawInterest' && withdrawSavingsInterest.isPending) ||
    (confirmTx?.kind === 'loan' && applyLoan.isPending);

  async function executeConfirmTx() {
    if (!confirmTx) return;
    if (confirmTx.kind === 'transfer') {
      await createTransfer.mutateAsync({
        targetCccd: confirmTx.targetCccd,
        amount: confirmTx.amount,
        message: confirmTx.message,
        idempotencyKey: confirmTx.idempotencyKey,
      });
      return;
    }
    if (confirmTx.kind === 'deposit') {
      await depositSavings.mutateAsync({
        amount: confirmTx.amount,
        termMonths: confirmTx.termMonths,
        idempotencyKey: confirmTx.idempotencyKey,
      });
      return;
    }
    if (confirmTx.kind === 'withdraw') {
      await withdrawSavings.mutateAsync({
        amount: confirmTx.amount,
        depositId: confirmTx.depositId,
        idempotencyKey: confirmTx.idempotencyKey,
      });
      return;
    }
    if (confirmTx.kind === 'withdrawInterest') {
      await withdrawSavingsInterest.mutateAsync({
        depositId: confirmTx.depositId,
        idempotencyKey: confirmTx.idempotencyKey,
      });
      return;
    }
    if (confirmTx.kind === 'loan') {
      await applyLoan.mutateAsync({ req: confirmTx.req, idempotencyKey: confirmTx.idempotencyKey });
    }
  }

  const handleApplyLoan = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const amount = parseVnd(loanAmount);
      const term = Math.max(0, Math.floor(Number(loanTerm) || 0));
      if (!overview || amount <= 0 || term <= 0) return;
      const req: ApplyLoanRequest = { amount: moneyMinor(amount), termMonths: term };
      if (loanCollateral.startsWith('property:')) req.collateralPropertyId = loanCollateral.slice('property:'.length);
      if (loanCollateral.startsWith('company:')) req.collateralCompanyId = loanCollateral.slice('company:'.length);
      const ratePct = recommendedInterestRate(overview.creditScore, overview.baseRatePct ?? 5);
      setConfirmTx({ kind: 'loan', req, amount, termMonths: term, ratePct, idempotencyKey: createIdempotencyKey() });
    },
    [loanAmount, loanTerm, loanCollateral, overview],
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
    setConfirmTx({ kind: 'deposit', amount, termMonths: selectedTerm, idempotencyKey: createIdempotencyKey() });
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
    setConfirmTx({ kind: 'withdraw', amount, depositId, idempotencyKey: createIdempotencyKey() });
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
    const cccd = transferCccd.replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cccd)) {
      toast({ title: 'CCCD không hợp lệ', description: 'Vui lòng nhập đúng 12 số CCCD người nhận.', variant: 'error' });
      setLookupResult(null);
      return;
    }
    lookupTransfer.mutate(cccd);
  };

  const handleTransfer = () => {
    const amount = parseVnd(transferAmount);
    if (!lookupResult) {
      toast({ title: 'Chưa xác nhận người nhận', description: 'Hãy kiểm tra CCCD người nhận trước.', variant: 'error' });
      return;
    }
    if (amount <= 0) {
      toast({ title: 'Số tiền không hợp lệ', description: 'Nhập số tiền chuyển lớn hơn 0.', variant: 'error' });
      return;
    }
    if (amount > cash) {
      toast({ title: 'Không đủ tiền mặt', description: `Tiền mặt hiện có ${formatMoney(cash)}, không đủ để chuyển ${formatMoney(amount)}.`, variant: 'error' });
      return;
    }
    setConfirmTx({
      kind: 'transfer',
      targetCccd: transferCccd.replace(/\s+/g, ''),
      amount,
      message: transferMessage.trim(),
      idempotencyKey: createIdempotencyKey(),
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
  const accountHistory = historyData?.items ?? [];
  const FINANCE_TABS: Array<{ key: 'overview' | 'transfer' | 'savings' | 'loans' | 'history'; label: string }> = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'transfer', label: 'Chuyển khoản' },
    { key: 'savings', label: 'Tiết kiệm' },
    { key: 'loans', label: 'Vay & Nợ' },
    { key: 'history', label: 'Lịch sử' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight">Trung tâm Tài chính</h1>
        </div>
        <GameButton
          variant="primary"
          onClick={() => { setLoanCollateral('none'); setLoanModal(true); }}
          disabled={applyLoan.isPending}
        >
          {applyLoan.isPending ? 'Đang xử lý...' : 'Vay ngân hàng'}
        </GameButton>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {FINANCE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-5">
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
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tiền mặt"
          value={formatMoney(overview.cash.amount)}
          tone="positive"
        />
        <StatCard
          label="Tiết kiệm"
          value={formatMoney(overview.savings.amount)}
          tone="positive"
        />
        <StatCard
          label="Tổng nợ"
          value={formatMoney(overview.totalDebt.amount)}
          tone="negative"
        />
        <StatCard
          label="Tài sản ròng"
          value={formatMoney(overview.netWorth.amount)}
        />
      </div>

          <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Tín dụng & Hạn mức vay" borderColor="emerald">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Điểm tín dụng</span>
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
              {creditBandLabel(overview.creditBand)}
            </Badge>
            <div className="mt-2">
              <span className="text-[11px] text-slate-500 block">Hạn mức vay tối đa</span>
              <span className="font-mono font-semibold text-emerald-700">
                {formatMoney(overview.maxLoanAmount.amount)}
              </span>
            </div>
            {overview.loanLimit && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] text-slate-700 space-y-1">
                <div className="font-semibold text-slate-700">Cơ sở tính hạn mức</div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <span>Tiền mặt</span><span className="text-right font-mono">{formatMoney(overview.loanLimit.cash.amount)}</span>
                  <span>Tiết kiệm</span><span className="text-right font-mono">{formatMoney(overview.loanLimit.savings.amount)}</span>
                  <span>Bất động sản</span><span className="text-right font-mono">{formatMoney(overview.loanLimit.realEstate.amount)}</span>
                  <span>Công ty</span><span className="text-right font-mono">{formatMoney(overview.loanLimit.companies.amount)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span>Tổng cơ sở tài sản</span>
                  <span className="font-mono font-semibold">{formatMoney(overview.loanLimit.assetBase.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hệ số theo điểm tín dụng</span>
                  <span className="font-mono">x{overview.loanLimit.scoreFactor}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hạn mức tín dụng</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatMoney(overview.loanLimit.unsecuredLimit.amount)}</span>
                </div>
              </div>
            )}
            <div className="mt-1">
              <span className="text-[11px] text-slate-500 block">Dòng nợ/tháng</span>
              <span className="font-mono font-semibold">
                {monthlyDebt > 0 ? formatMoney(monthlyDebt) : formatMoney(0)}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Tổng quan khoản vay" borderColor="rose">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Sổ đang vay</span>
              <span className="font-mono font-semibold">{activeLoans.length} sổ</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Dư nợ hiện tại</span>
              <span className="font-mono font-semibold text-rose-700">{formatMoney(overview.totalDebt.amount)}</span>
            </div>
          </div>
        </Panel>
          </div>
        </div>
      )}

      {activeTab === 'transfer' && (
        <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Chuyển khoản nhanh qua CCCD" borderColor="emerald">
          <div className="space-y-3">
            <CCCDLookupInput
              id="transfer-recipient-cccd"
              value={transferCccd}
              onChange={(v) => { setTransferCccd(v); setLookupResult(null); }}
              onResolved={(r) => {
                if (r) { lookupTransfer.mutate(transferCccd.replace(/\s+/g, '')); } else { setLookupResult(null); }
              }}
              label="CCCD người nhận"
            />
            {lookupResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{lookupResult.fullName}</p>
                    <p className="text-[11px] text-slate-600">CCCD: <span className="font-mono">{lookupResult.cccdMasked ?? '—'}</span> · STK: <span className="font-mono">{lookupResult.accountNumber}</span></p>
                  </div>
                  <Badge variant={tierVariant(lookupResult.accountTier)}>{tierLabel(lookupResult.accountTier)}</Badge>
                </div>
              </div>
            )}

            <GameInput
              id="transfer-amount"
              label="Số tiền chuyển (đ)"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder={`Tối đa ${formatMoney(cash)}`}
            />
            <div className="flex gap-2">
              <GameButton variant="outline" size="sm" onClick={() => setTransferAmount(String(cash))} disabled={cash <= 0}>
                Tối đa
              </GameButton>
            </div>
            <GameInput
              id="transfer-message"
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
                        <p className="text-[11px] text-slate-500">Mã giao dịch: <span className="font-mono">{t.counterpartyAccountNumber}</span></p>
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
      )}

      {activeTab === 'savings' && (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gửi tiết kiệm</p>
              <div>
                <label htmlFor="savings-term-select" className="text-[11px] text-slate-500">Kỳ hạn &amp; lãi suất</label>
                <select
                  id="savings-term-select"
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
                id="savings-deposit-amount"
                label="Số tiền gửi (đ)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder={`Tối đa ${formatMoney(cash)}`}
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
                  Lãi suất áp dụng: <b>{formatRatePerYear(selectedTermInfo.annualRatePct)}</b> ({selectedTermInfo.label}).
                  {selectedTermInfo.termMonths > 0 && ' Rút trước hạn sẽ bị giảm lãi theo cấu hình.'}
                </p>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rút tiết kiệm</p>
              <GameInput
                id="savings-withdraw-amount"
                label="Số tiền rút (đ)"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={`Tối đa ${formatMoney(totalSavings)}`}
              />
              <div className="flex gap-2">
                <GameButton
                  variant="outline"
                  size="sm"
                  onClick={() => handleWithdraw()}
                  disabled={withdrawSavings.isPending || activeDeposits.length === 0}
                >
                  {withdrawSavings.isPending ? 'Đang rút...' : 'Rút'}
                </GameButton>
                <GameButton variant="outline" size="sm" onClick={() => setWithdrawAmount(String(totalSavings))} disabled={totalSavings <= 0}>
                  Tối đa
                </GameButton>
              </div>
            </div>
          </div>
        </Panel>
            <Panel title="Tổng quan tiết kiệm" borderColor="default">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-600">Tiền mặt khả dụng</span><span className="font-mono font-semibold text-emerald-700">{formatMoney(cash)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Tổng tiết kiệm</span><span className="font-mono font-semibold text-emerald-700">{formatMoney(totalSavings)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Sổ đang hoạt động</span><span className="font-mono font-semibold">{activeDeposits.length}</span></div>
                <p className="text-[11px] text-slate-500 pt-1">Quản lý gửi/rút và thao tác theo từng sổ tiết kiệm bên dưới. Một số hành động sẽ yêu cầu xác nhận trước khi thực hiện.</p>
              </div>
            </Panel>
          </div>
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
                    <span className="font-mono text-right">{formatRatePerYear(d.annualRatePct)}</span>
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
                      {d.termMonths === 0 && (
                        <GameButton
                          variant="outline"
                          size="sm"
                          disabled={withdrawSavingsInterest.isPending || d.interestEarned.amount <= 0}
                          onClick={() => setConfirmTx({
                            kind: 'withdrawInterest',
                            amount: d.interestEarned.amount,
                            depositId: d.id,
                            idempotencyKey: createIdempotencyKey(),
                          })}
                        >
                          Rút lãi
                        </GameButton>
                      )}
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
                          setConfirmTx({ kind: 'withdraw', amount: amt, depositId: d.id, idempotencyKey: createIdempotencyKey() });
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
        </div>
      )}

      {activeTab === 'loans' && (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Tổng quan khoản vay" borderColor="rose">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Sổ đang vay</span>
              <span className="font-mono font-semibold">{activeLoans.length} sổ</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Dư nợ hiện tại</span>
              <span className="font-mono font-semibold text-rose-700">{formatMoney(overview.totalDebt.amount)}</span>
            </div>
          </div>
        </Panel>
            <Panel title="Tín dụng & Hạn mức vay" borderColor="emerald">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-600">Điểm tín dụng</span><span className="font-mono font-bold text-emerald-700">{overview.creditScore}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Hạn mức vay tối đa</span><span className="font-mono font-semibold text-emerald-700">{formatMoney(overview.maxLoanAmount.amount)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Dòng nợ/tháng</span><span className="font-mono font-semibold">{monthlyDebt > 0 ? formatMoney(monthlyDebt) : formatMoney(0)}</span></div>
                <div className="pt-1"><GameButton variant="primary" size="sm" onClick={() => { setLoanCollateral('none'); setLoanModal(true); }} disabled={applyLoan.isPending}>Vay ngân hàng</GameButton></div>
              </div>
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
                        Sổ vay {loan.collateral ? (loan.collateral.kind === 'company' || loan.collateralType === 'company' ? '(thế chấp công ty)' : '(thế chấp BĐS)') : '(tín chấp)'}
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
                    <span className="font-mono text-right">{formatRatePerYear(loan.interestRatePct)}</span>
                    <span className="text-slate-500">Trả hàng tháng</span>
                    <span className="font-mono text-right">{formatMoneyPerMonth(loan.monthlyPayment.amount)}</span>
                    <span className="text-slate-500">Kỳ trả tiếp</span>
                    <span className="font-mono text-right">{fmtDate(loan.nextDueAt)}</span>
                  </div>

                  {loan.collateral ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-900">
                      <p className="font-semibold">
                        {loan.collateral.kind === 'company' || loan.collateralType === 'company'
                          ? 'Thế chấp công ty'
                          : 'Thế chấp bất động sản'}
                      </p>
                      {loan.collateral.kind === 'company' || loan.collateralType === 'company' ? (
                        <>
                          <p>Công ty: {loan.collateral.companyName ?? '—'}</p>
                          {loan.collateral.companyIndustry && <p>Ngành: {loan.collateral.companyIndustry}</p>}
                          <p>Định giá tham chiếu: {formatMoney(loan.collateral.currentValue.amount)}</p>
                          <p className="text-amber-800">Mã công ty: {loan.collateral.companyId ?? loan.collateralCompanyId ?? '—'}</p>
                        </>
                      ) : (
                        <>
                          <p>Loại: {loan.collateral.propertyType ?? '—'}</p>
                          <p>Vị trí: {loan.collateral.nodeName ?? '—'}</p>
                          <p>Giá trị tham chiếu: {formatMoney(loan.collateral.currentValue.amount)}</p>
                          <p className="text-amber-800">Mã BĐS: {loan.collateral.propertyId ?? loan.collateralPropertyId ?? '—'}</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">Không có tài sản thế chấp (vay tín chấp).</p>
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
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-5">
      <Panel title="Lịch sử biến động tài khoản (30 bản ghi gần nhất)" borderColor="emerald">
        {historyLoading ? (
          <p className="text-sm text-slate-500">Đang tải lịch sử biến động...</p>
        ) : accountHistory.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có biến động tài khoản.</p>
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
            {accountHistory.map((h) => {
              const delta = Number(h.delta?.amount ?? 0);
              const incoming = delta >= 0;
              const desc = String(h.description || '').trim();
              const historyTitle = (() => {
                if (/^Savings withdrawal/i.test(desc)) return 'Rút tiền tiết kiệm';
                if (/^Savings deposit/i.test(desc)) {
                  const m = desc.match(/\bterm\s+(\d+)m\b/i);
                  const term = m ? Number(m[1] || 0) : NaN;
                  if (!Number.isNaN(term)) return `Gửi tiết kiệm (${term > 0 ? `Kỳ hạn ${term} tháng` : 'Không kỳ hạn'})`;
                  return 'Gửi tiết kiệm';
                }
                if (h.kind === 'auction_bid') return 'Đấu giá đất';
                if (h.kind === 'mayor_salary') return 'Phụ cấp Thị trưởng';
                // fallback: strip UUID-like tokens from raw description
                return desc.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '').replace(/\s{2,}/g, ' ').trim() || (h.kind === 'savings_deposit' ? 'Gửi tiết kiệm' : h.kind === 'savings_withdrawal' ? 'Rút tiền tiết kiệm' : 'Biến động tài khoản');
              })();
              const kindRefLabel = (() => {
                if (h.kind === 'auction_bid' || h.referenceType === 'province_land_auction') return 'Loại: Đấu giá đất · Nguồn: Đấu giá đất tỉnh/thành';
                if (h.kind === 'savings_withdrawal' || h.kind === 'savings_deposit' || h.referenceType === 'savings_deposit') return h.kind === 'savings_withdrawal' ? 'Loại: Rút tiết kiệm · Nguồn: Sổ tiết kiệm' : 'Loại: Gửi tiết kiệm · Nguồn: Sổ tiết kiệm';
                if (h.kind === 'mayor_salary' || h.referenceType === 'election') return 'Loại: Phụ cấp Thị trưởng · Nguồn: Nhiệm kỳ Thị trưởng';
                return `Loại: ${h.kind}${h.referenceType ? ` · Nguồn: ${h.referenceType}` : ''}`;
              })();
              return (
                <div key={h.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-slate-800 truncate">{historyTitle}</p>
                        <Badge variant={h.accountKind === 'savings' ? 'warning' : 'default'}>
                          {h.accountKind === 'savings' ? 'Tiết kiệm' : 'Tiền mặt'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{kindRefLabel}</p>
                      <p className="text-[11px] text-slate-500">{fmtDateTime(h.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-mono font-semibold ${incoming ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {incoming ? '+' : ''}{formatMoney(delta)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
        </div>
      )}

      <Modal open={loanModal} onClose={() => setLoanModal(false)} title="Đơn vay ngân hàng" size="2xl">
        <form onSubmit={handleApplyLoan} className="space-y-4">
          {(() => {
            const opts = overview.collateralOptions ?? [];
            const selectedOpt = loanCollateral === 'none'
              ? null
              : opts.find((o) => `${o.kind}:${o.id}` === loanCollateral) ?? null;
            const unsecuredMax = overview.loanLimit?.unsecuredLimit.amount ?? overview.maxLoanAmount.amount;
            const effectiveMax = selectedOpt
              ? Math.min(overview.maxLoanAmount.amount, selectedOpt.maxLoanAmount.amount)
              : unsecuredMax;
            return (
              <>
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Hạn mức vay</div>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-slate-700 sm:grid-cols-2">
                    <span>Điểm tín dụng</span><span className="text-right font-mono">{overview.creditScore} ({creditBandLabel(overview.creditBand)})</span>
                    <span>Tiền mặt</span><span className="text-right font-mono">{formatMoney(overview.loanLimit?.cash.amount ?? overview.cash.amount)}</span>
                    <span>Tiết kiệm</span><span className="text-right font-mono">{formatMoney(overview.loanLimit?.savings.amount ?? overview.savings.amount)}</span>
                    <span>Bất động sản</span><span className="text-right font-mono">{formatMoney(overview.loanLimit?.realEstate.amount ?? 0)}</span>
                    <span>Công ty</span><span className="text-right font-mono">{formatMoney(overview.loanLimit?.companies.amount ?? 0)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs pt-1 border-t border-slate-200">
                    <span>Hạn mức tín dụng</span>
                    <span className="font-mono font-semibold text-emerald-700 text-right">{formatMoney(unsecuredMax)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs">
                    <span>Hạn mức áp dụng</span>
                    <span className="font-mono font-semibold text-emerald-700 text-right">{formatMoney(effectiveMax)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="loan-collateral-select" className="text-[11px] text-slate-600">Tài sản thế chấp</label>
                  <select
                    id="loan-collateral-select"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={loanCollateral}
                    onChange={(e) => setLoanCollateral(e.target.value)}
                  >
                    <option value="none">Không thế chấp</option>
                    {opts.map((o) => (
                      <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`} disabled={o.encumbered}>
                        {o.kind === 'company' ? 'Công ty' : 'Bất động sản'}: {o.name} — giá trị {formatMoney(o.value.amount)} — vay tối đa {formatMoney(o.maxLoanAmount.amount)} (LTV {o.ltvPct}%){o.encumbered ? ' [đang thế chấp]' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedOpt && (
                    <p className="text-[11px] text-slate-500">
                      Đã chọn thế chấp {selectedOpt.kind === 'company' ? 'công ty' : 'bất động sản'} <b>{selectedOpt.name}</b>. Hạn mức theo tài sản: {formatMoney(selectedOpt.maxLoanAmount.amount)} (LTV {selectedOpt.ltvPct}%).
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <GameInput
                      id="loan-amount"
                      label="Số tiền vay (đ)"
                      value={loanAmount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoanAmount(e.target.value)}
                      placeholder="Nhập số tiền..."
                      required
                    />
                    <GameButton type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setLoanAmount(String(effectiveMax))}>
                      Điền hạn mức tối đa
                    </GameButton>
                  </div>
                  <GameInput
                    id="loan-term-months"
                    label="Kỳ hạn (tháng)"
                    type="number"
                    value={loanTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoanTerm(e.target.value)}
                    placeholder="12"
                    required
                  />
                </div>

                {/* Bỏ giải thích ước tính lãi suất/hạn mức theo yêu cầu */}
              </>
            );
          })()}

          {loanPreview ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Ước tính khoản vay</p>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
              {(() => {
                const opts = overview.collateralOptions ?? [];
                const selectedOpt = loanCollateral === 'none' ? null : opts.find((o) => `${o.kind}:${o.id}` === loanCollateral) ?? null;
                const unsecuredMax = overview.loanLimit?.unsecuredLimit.amount ?? overview.maxLoanAmount.amount;
                const effectiveMax = selectedOpt ? Math.min(overview.maxLoanAmount.amount, selectedOpt.maxLoanAmount.amount) : unsecuredMax;
                return loanPreview.amount > effectiveMax ? (
                  <p className="text-[11px] text-rose-600">
                    Số tiền vượt hạn mức áp dụng {formatMoney(effectiveMax)} (đơn có thể bị từ chối).
                  </p>
                ) : null;
              })()}
              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-1">Lịch trả nợ dự kiến từng tháng</p>
                <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-[560px] w-full text-[11px]">
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
                {/* Bỏ chú thích lịch trả nợ ước tính theo yêu cầu */}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Nhập số tiền và kỳ hạn để xem lãi suất, lịch trả góp và tổng gốc lãi.</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <GameButton type="button" variant="outline" onClick={() => setLoanModal(false)}>
              Hủy
            </GameButton>
            <GameButton variant="primary" type="submit" disabled={applyLoan.isPending}>
              {applyLoan.isPending ? 'Đang gửi...' : 'Gửi đơn'}
            </GameButton>
          </div>
        </form>
      </Modal>


      <TransactionConfirmModal
        open={confirmTx?.kind === 'transfer'}
        onClose={() => { if (!confirmTxBusy) setConfirmTx(null); }}
        onConfirm={executeConfirmTx}
        loading={!!(confirmTx?.kind === 'transfer' && createTransfer.isPending)}
        title="Xác nhận chuyển khoản"
        transactionType="Chuyển khoản CCCD"
        targetLabel="Người nhận (CCCD/STK)"
        targetValue={confirmTx?.kind === 'transfer' ? `${lookupResult?.fullName ?? '—'} · CCCD ${confirmTx.targetCccd} · STK ${lookupResult?.accountNumber ?? '—'}` : ''}
        amountMinor={confirmTx?.kind === 'transfer' ? confirmTx.amount : 0}
        feeOrRateValue="Phí: 0 đ"
        projectedBalanceMinor={confirmTx?.kind === 'transfer' ? Math.max(0, cash - confirmTx.amount) : undefined}
        details={confirmTx?.kind === 'transfer' && confirmTx.message ? [{ label: 'Nội dung', value: confirmTx.message }] : []}
        warning="Vui lòng kiểm tra kỹ người nhận và số tiền trước khi xác nhận."
      />

      <TransactionConfirmModal
        open={confirmTx?.kind === 'deposit'}
        onClose={() => { if (!confirmTxBusy) setConfirmTx(null); }}
        onConfirm={executeConfirmTx}
        loading={!!(confirmTx?.kind === 'deposit' && depositSavings.isPending)}
        title="Xác nhận gửi tiết kiệm"
        transactionType="Gửi tiết kiệm"
        targetLabel="Tài khoản/Sổ"
        targetValue={confirmTx?.kind === 'deposit' ? `Sổ tiết kiệm ${confirmTx.termMonths > 0 ? `kỳ hạn ${confirmTx.termMonths} tháng` : 'không kỳ hạn'} — ${terms.find(t => t.termMonths === confirmTx.termMonths)?.annualRatePct ?? 0}%/năm` : ''}
        amountMinor={confirmTx?.kind === 'deposit' ? confirmTx.amount : 0}
        feeOrRateValue={confirmTx?.kind === 'deposit' ? `Lãi suất: ${terms.find(t => t.termMonths === confirmTx.termMonths)?.annualRatePct ?? 0}%/năm` : '—'}
        projectedBalanceLabel="Tiền mặt dự kiến sau giao dịch"
        projectedBalanceMinor={confirmTx?.kind === 'deposit' ? Math.max(0, cash - confirmTx.amount) : undefined}
        details={confirmTx?.kind === 'deposit' ? [{ label: 'Tổng tiết kiệm dự kiến', value: formatMoney(totalSavings + confirmTx.amount) }] : []}
      />

      <TransactionConfirmModal
        open={confirmTx?.kind === 'withdraw'}
        onClose={() => { if (!confirmTxBusy) setConfirmTx(null); }}
        onConfirm={executeConfirmTx}
        loading={!!(confirmTx?.kind === 'withdraw' && withdrawSavings.isPending)}
        title="Xác nhận rút tiết kiệm"
        transactionType="Rút tiết kiệm"
        targetLabel="Nguồn rút"
        targetValue={confirmTx?.kind === 'withdraw' ? (confirmTx.depositId ? `Từ sổ tiết kiệm đã chọn` : 'Từ tổng sổ tiết kiệm') : ''}
        amountMinor={confirmTx?.kind === 'withdraw' ? confirmTx.amount : 0}
        feeOrRateValue={confirmTx?.kind === 'withdraw' && confirmTx.depositId ? 'Lãi/phạt (nếu có) sẽ được hệ thống tính khi rút' : 'Không có phí cố định (lãi/phạt theo sổ nếu áp dụng)'}
        projectedBalanceLabel="Tiền mặt dự kiến sau giao dịch"
        projectedBalanceMinor={confirmTx?.kind === 'withdraw' ? cash + confirmTx.amount : undefined}
        details={confirmTx?.kind === 'withdraw' ? [{ label: 'Tổng tiết kiệm dự kiến', value: formatMoney(Math.max(0, totalSavings - confirmTx.amount)) }] : []}
        warning="Số tiền thực nhận có thể khác nếu phát sinh lãi/phạt theo kỳ hạn và quy tắc rút."
      />

      <TransactionConfirmModal
        open={confirmTx?.kind === 'withdrawInterest'}
        onClose={() => { if (!confirmTxBusy) setConfirmTx(null); }}
        onConfirm={executeConfirmTx}
        loading={!!(confirmTx?.kind === 'withdrawInterest' && withdrawSavingsInterest.isPending)}
        title="Xác nhận rút lãi"
        transactionType="Rút lãi tiết kiệm"
        targetLabel="Nguồn nhận"
        targetValue="Tiền mặt · Gốc vẫn giữ trong sổ không kỳ hạn"
        amountMinor={confirmTx?.kind === 'withdrawInterest' ? confirmTx.amount : 0}
        feeOrRateValue="Không mất phí"
        projectedBalanceLabel="Tiền mặt dự kiến sau giao dịch"
        projectedBalanceMinor={confirmTx?.kind === 'withdrawInterest' ? cash + confirmTx.amount : undefined}
        details={confirmTx?.kind === 'withdrawInterest' ? [{ label: 'Tiết kiệm giữ nguyên', value: formatMoney(totalSavings) }] : []}
        warning="Lãi đã rút sẽ bắt đầu một kỳ tích lũy mới; phần gốc trong sổ không thay đổi."
      />

      <TransactionConfirmModal
        open={confirmTx?.kind === 'loan'}
        onClose={() => { if (!confirmTxBusy) setConfirmTx(null); }}
        onConfirm={executeConfirmTx}
        loading={!!(confirmTx?.kind === 'loan' && applyLoan.isPending)}
        title="Xác nhận vay ngân hàng"
        transactionType="Vay ngân hàng"
        targetLabel="Khoản vay"
        targetValue={confirmTx?.kind === 'loan' ? `Vay ${formatMoney(confirmTx.amount)} · Kỳ hạn ${confirmTx.termMonths} tháng` : ''}
        amountMinor={confirmTx?.kind === 'loan' ? confirmTx.amount : 0}
        feeOrRateValue={confirmTx?.kind === 'loan' ? `${formatRatePerYear(confirmTx.ratePct)} (lãi suất dự kiến)` : '—'}
        projectedBalanceLabel="Tiền mặt dự kiến sau giải ngân"
        projectedBalanceMinor={confirmTx?.kind === 'loan' ? cash + confirmTx.amount : undefined}
        details={confirmTx?.kind === 'loan' ? [
          { label: 'Trả dự kiến', value: `${formatMoney(monthlyPayment({ principalMinor: confirmTx.amount, annualRatePct: confirmTx.ratePct, termMonths: confirmTx.termMonths }))}/tháng` },
        ] : []}
        warning="Khoản vay sẽ tạo nghĩa vụ trả nợ định kỳ. Vui lòng kiểm tra lãi suất, kỳ hạn và tài sản thế chấp (nếu có)."
      />
    </div>
  );
}

