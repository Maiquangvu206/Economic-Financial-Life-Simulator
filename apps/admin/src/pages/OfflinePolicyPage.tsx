import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfflinePolicyDto, UpdateOfflinePolicyRequest } from '@efls/contracts';
import { adminRequest } from '../shared/api/httpClient';

export function OfflinePolicyPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<OfflinePolicyDto>({
    queryKey: ['admin', 'offline', 'policy'],
    queryFn: () => adminRequest<OfflinePolicyDto>('/api/v1/admin/offline/policy'),
  });

  const [form, setForm] = useState<UpdateOfflinePolicyRequest>({});

  useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        maxOfflineMinutes: data.maxOfflineMinutes,
        allowAutoClaimWelfare: data.allowAutoClaimWelfare,
        allowAutoPay: data.allowAutoPay,
        allowCatchup: data.allowCatchup,
        defaultAutoClaimWelfare: data.defaultAutoClaimWelfare,
        defaultAutoPay: data.defaultAutoPay,
        defaultCatchup: data.defaultCatchup,
        defaultShowRecap: data.defaultShowRecap,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (body: UpdateOfflinePolicyRequest) =>
      adminRequest<OfflinePolicyDto>('/api/v1/admin/offline/policy', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'offline', 'policy'] });
    },
  });

  if (isLoading) return <div className="p-4 text-sm text-slate-600">Đang tải chính sách offline...</div>;
  if (error) return <div className="p-4 text-sm text-rose-600">Không tải được chính sách offline.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cấu hình Xử lý Vắng mặt (Offline)</h1>
        </div>
        <button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {save.isPending ? 'Đang lưu...' : 'Lưu chính sách'}
        </button>
      </div>

      {save.isError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Lưu thất bại. Vui lòng thử lại.</div> : null}
      {save.isSuccess ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Đã lưu chính sách offline.</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Bật/tắt & giới hạn</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          Bật xử lý offline toàn hệ thống
        </label>
        <label className="block text-sm text-slate-700">
          Giới hạn thời gian bù tối đa
          <input
            type="number"
            min={0}
            max={10080}
            value={form.maxOfflineMinutes ?? 1440}
            onChange={(e) => setForm((f) => ({ ...f, maxOfflineMinutes: Number(e.target.value) }))}
            className="mt-1 w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          />

        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Cho phép tác vụ tự động</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.allowCatchup} onChange={(e) => setForm((f) => ({ ...f, allowCatchup: e.target.checked }))} />
          Cho phép bù tiến trình/mô phỏng thời gian offline
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.allowAutoClaimWelfare} onChange={(e) => setForm((f) => ({ ...f, allowAutoClaimWelfare: e.target.checked }))} />
          Cho phép tự động nhận/claim phúc lợi định kỳ
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.allowAutoPay} onChange={(e) => setForm((f) => ({ ...f, allowAutoPay: e.target.checked }))} />
          Cho phép tự động trả hóa đơn/thuế/khoản vay đến hạn
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Cài đặt mặc định cho tài khoản mới</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.defaultCatchup} onChange={(e) => setForm((f) => ({ ...f, defaultCatchup: e.target.checked }))} />
          Mặc định bật bù tiến trình offline
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.defaultAutoClaimWelfare} onChange={(e) => setForm((f) => ({ ...f, defaultAutoClaimWelfare: e.target.checked }))} />
          Mặc định tự nhận phúc lợi
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.defaultAutoPay} onChange={(e) => setForm((f) => ({ ...f, defaultAutoPay: e.target.checked }))} />
          Mặc định tự trả hóa đơn/nợ
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.defaultShowRecap} onChange={(e) => setForm((f) => ({ ...f, defaultShowRecap: e.target.checked }))} />
          Mặc định hiển thị Báo cáo tổng kết vắng mặt khi đăng nhập lại
        </label>
      </section>

</div>
  );
}
