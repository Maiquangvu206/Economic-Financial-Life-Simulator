import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApplyLoanRequest, type BankingOverviewDto } from '@efls/contracts';
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
    mutationFn: (amount: number) =>
      apiRequest('/api/v1/banking/savings/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: moneyMinor(amount) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      toast({
        title: 'Gửi tiết kiệm thành công',
        description: 'Số tiền đã chuyển từ ví vào tài khoản tiết kiệm.',
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
    mutationFn: (amount: number) =>
      apiRequest('/api/v1/banking/savings/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: moneyMinor(amount) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banking', 'overview'] });
      toast({
        title: 'Rút tiết kiệm thành công',
        description: 'Số tiền đã chuyển về ví cá nhân.',
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

  const [loanModal, setLoanModal] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanTerm, setLoanTerm] = useState('12');

  const handleApplyLoan = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const amount = Number(loanAmount);
      const term = Number(loanTerm);
      if (!amount || amount <= 0 || !term || term <= 0) return;
      applyLoan.mutate({ amount: moneyMinor(amount), termMonths: term });
      setLoanModal(false);
      setLoanAmount('');
      setLoanTerm('12');
    },
    [loanAmount, loanTerm, applyLoan],
  );

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

  const monthlyDebt = overview.loans.reduce((acc, l) => acc + l.monthlyPayment.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight">Trung tâm Tài chính</h1>
          <p className="mt-1 text-sm text-slate-600">
            Bảng cân đối tài sản / nợ, gửi tiết kiệm, vay ngân hàng. Tất cả do server xác thực.
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tiền mặt (ví)"
          value={formatMoney(overview.cash.amount)}
          hint="Tiền dùng hàng ngày"
          tone="positive"
        />
        <StatCard
          label="Tiết kiệm"
          value={formatMoney(overview.savings.amount)}
          hint="Lãi suất hàng năm"
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
        {/* Credit panel */}
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

        {/* Savings panel */}
        <Panel title="Tài khoản Tiết kiệm" borderColor="default">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Số dư</span>
              <span className="font-mono font-bold text-emerald-700">
                {formatMoney(overview.savingsAccount.balance.amount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Lãi suất/năm</span>
              <span className="font-mono text-slate-700">
                {overview.savingsAccount.annualRatePct}%
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <GameButton variant="outline" size="sm" onClick={() => depositSavings.mutate(50000)}>
                Gửi 500.000
              </GameButton>
              <GameButton variant="outline" size="sm" onClick={() => withdrawSavings.mutate(50000)}>
                Rút 500.000
              </GameButton>
            </div>
          </div>
        </Panel>

        {/* Active loans panel */}
        <Panel title="Khoản vay đang nợ" borderColor="rose">
          <div className="space-y-2">
            {overview.loans.length === 0 ? (
              <p className="text-[11px] text-slate-500">Chưa có khoản vay nào.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {overview.loans.map((loan) => (
                  <li
                    key={loan.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/80"
                  >
                    <div>
                      <div className="font-mono text-sm text-slate-800">
                        {loan.outstanding.amount.toLocaleString('vi-VN')} /{' '}
                        {loan.principal.amount.toLocaleString('vi-VN')}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {loan.status} • {loan.interestRatePct}%/năm
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <GameInput
                        value={String(Math.min(loan.outstanding.amount, 50000))}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        className="w-24"
                      />
                      <GameButton
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          repayLoan.mutate({
                            loanId: loan.id,
                            amount: Math.min(loan.outstanding.amount, 50000),
                          })
                        }
                        disabled={repayLoan.isPending}
                      >
                        Trả
                      </GameButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      <Modal open={loanModal} onClose={() => setLoanModal(false)} title="Đơn vay ngân hàng">
        <form onSubmit={handleApplyLoan} className="space-y-4">
          <GameInput
            label="Số tiền vay (VNĐ)"
            value={loanAmount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoanAmount(e.target.value)}
            placeholder="Nhập số tiền..."
            required
          />
          <GameInput
            label="Khoản hạn (tháng)"
            type="number"
            value={loanTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoanTerm(e.target.value)}
            placeholder="12"
            required
          />
          <p className="text-[11px] text-slate-500">
            Lãi suất sẽ được tính theo Credit Score của bạn. Hạn mức tối đa:{' '}
            {formatMoney(overview.maxLoanAmount.amount)}.
          </p>
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
