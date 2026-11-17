import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../shared/api/httpClient';
import { formatMoney } from '../shared/lib/format';
import { toast } from '../shared/ui/Toast';

type RedeemResponse = {
  ok: boolean;
  redeemed: boolean;
  amount: { amount: number; currency: 'VND' };
  balanceAfter?: { amount: number; currency: 'VND' };
  giftCode?: { id: string; code: string; title: string };
  message?: string;
};

type MyRedemption = {
  id: string;
  code: string;
  title: string;
  amount: { amount: number; currency: 'VND' };
  redeemedAt: string;
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

export function GiftCodesPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [lastResult, setLastResult] = useState<RedeemResponse | null>(null);

  const { data: redemptions = [], isLoading, error, refetch } = useQuery<MyRedemption[]>({
    queryKey: ['gift-codes', 'my'],
    queryFn: () => apiRequest<MyRedemption[]>('/api/v1/gift-codes/my'),
  });

  const redeem = useMutation({
    mutationFn: async (inputCode: string) =>
      apiRequest<RedeemResponse>('/api/v1/gift-codes/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: inputCode.trim() }),
      }),
    onSuccess: async (res) => {
      setLastResult(res);
      setCode('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gift-codes', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['characters'] }),
        queryClient.invalidateQueries({ queryKey: ['banking'] }),
      ]);
      toast({
        title: res.redeemed ? 'Nhập mã thành công' : 'Thông báo',
        description: res.message || (res.redeemed ? 'Đã nhận quà từ mã.' : 'Mã đã được xử lý.'),
        variant: res.redeemed ? 'success' : 'info',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Không thể nhập mã',
        description: err?.problem?.detail || err?.message || 'Mã quà tặng không hợp lệ hoặc đã hết lượt.',
        variant: 'error',
      });
    },
  });

  const totalReceived = useMemo(
    () => redemptions.reduce((sum, r) => sum + (r.amount?.amount ?? 0), 0),
    [redemptions],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-black text-slate-900">Mã quà tặng</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white/90 p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600">Nhập mã quà tặng</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const v = code.trim();
              if (!v) return;
              redeem.mutate(v);
            }}
          >
            <div>
              <label htmlFor="gift-code-input" className="block text-xs font-medium text-slate-700 mb-1">Mã code</label>
              <input
                id="gift-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Nhập mã (VD: WELCOME2026)"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-mono tracking-wide text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                autoCapitalize="characters"
                autoCorrect="off"
              />
            </div>
            <button
              type="submit"
              disabled={redeem.isPending || code.trim().length === 0}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {redeem.isPending ? 'Đang kiểm tra...' : '🎁 Nhận quà'}
            </button>
          </form>

          {lastResult && (
            <div className={`rounded-xl border p-3 text-xs ${lastResult.redeemed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <div className="font-semibold">{lastResult.giftCode ? `${lastResult.giftCode.title} (${lastResult.giftCode.code})` : 'Kết quả'}</div>
              <div className="mt-0.5">{lastResult.message || (lastResult.redeemed ? 'Đã nhận thưởng.' : 'Đã xử lý.')}</div>
              <div className="mt-1">Giá trị: <b>{formatMoney(lastResult.amount?.amount ?? 0)}</b></div>
              {lastResult.balanceAfter && <div>Số dư hiện tại: <b>{formatMoney(lastResult.balanceAfter.amount)}</b></div>}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white/90 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600">Mã đã sử dụng ({redemptions.length})</h2>
            <div className="text-xs text-slate-600">Tổng đã nhận: <b className="text-emerald-700">{formatMoney(totalReceived)}</b></div>
          </div>
          <div className="flex justify-end -mt-2">
            <button type="button" onClick={() => refetch()} className="text-[11px] text-slate-600 hover:text-slate-900">Tải lại</button>
          </div>
          {isLoading ? (
            <div className="text-sm text-slate-600">Đang tải...</div>
          ) : error ? (
            <div className="text-sm text-rose-600">Không thể tải lịch sử mã đã sử dụng.</div>
          ) : redemptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Bạn chưa sử dụng mã quà tặng nào.
            </div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-2">Mã</th>
                    <th className="py-2 pr-2">Tên quà</th>
                    <th className="py-2 pr-2">Đã nhận</th>
                    <th className="py-2 pr-2">Thời gian sử dụng</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-mono font-semibold text-slate-900">{r.code}</td>
                      <td className="py-2 pr-2 text-slate-800">{r.title}</td>
                      <td className="py-2 pr-2 font-semibold text-emerald-700">+{formatMoney(r.amount.amount)}</td>
                      <td className="py-2 pr-2 text-slate-600">{fmtDate(r.redeemedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
