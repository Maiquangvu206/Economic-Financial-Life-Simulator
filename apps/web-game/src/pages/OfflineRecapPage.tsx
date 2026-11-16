import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfflinePlayerSettingsDto, OfflineProcessResponse, OfflineRecapDto, UpdateOfflinePlayerSettingsRequest } from '@efls/contracts';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

export function OfflineRecapPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdateOfflinePlayerSettingsRequest>({});
  const [message, setMessage] = useState<string | null>(null);

  const settingsQ = useQuery<OfflinePlayerSettingsDto>({
    queryKey: ['offline', 'settings'],
    queryFn: () => apiRequest<OfflinePlayerSettingsDto>('/api/v1/offline/settings'),
  });

  const recapQ = useQuery<OfflineRecapDto | null>({
    queryKey: ['offline', 'recap'],
    queryFn: () => apiRequest<OfflineRecapDto | null>('/api/v1/offline/recap'),
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        offlineProcessingEnabled: settingsQ.data.offlineProcessingEnabled,
        autoClaimWelfare: settingsQ.data.autoClaimWelfare,
        autoPay: settingsQ.data.autoPay,
        catchupEnabled: settingsQ.data.catchupEnabled,
        showRecapOnLogin: settingsQ.data.showRecapOnLogin,
      });
    }
  }, [settingsQ.data]);

  const saveSettings = useMutation({
    mutationFn: (body: UpdateOfflinePlayerSettingsRequest) =>
      apiRequest<OfflinePlayerSettingsDto>('/api/v1/offline/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['offline', 'settings'], data);
      setMessage('Đã lưu cài đặt offline.');
    },
    onError: () => setMessage('Không thể lưu cài đặt offline.'),
  });

  const process = useMutation({
    mutationFn: () => apiRequest<OfflineProcessResponse>('/api/v1/offline/process', { method: 'POST' }),
    onSuccess: (res) => {
      setMessage(res.message || (res.processed ? 'Đã xử lý offline.' : 'Không có thay đổi mới.'));
      void qc.invalidateQueries({ queryKey: ['offline', 'recap'] });
      void qc.invalidateQueries({ queryKey: ['offline', 'settings'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: () => setMessage('Xử lý offline thất bại. Vui lòng thử lại.'),
  });

  const recap = recapQ.data;
  const events = recap?.events ?? [];
  const income = recap?.income?.amount ?? 0;
  const expense = recap?.expenses?.amount ?? 0;
  const net = recap?.netCashFlow?.amount ?? (income - expense);

  const summaryBadges = useMemo(() => {
    const s = (recap?.summary ?? {}) as Record<string, any>;
    const elapsed = Number(s.elapsedMinutes ?? recap?.processedMinutes ?? 0);
    const processed = Number(recap?.processedMinutes ?? s.processedMinutes ?? 0);
    return [
      { label: 'Thời gian offline', value: `${elapsed} phút` },
      { label: 'Đã xử lý/bù', value: `${processed} phút` },
      { label: 'Phúc lợi đã nhận', value: String(s.welfareClaimedCount ?? 0) },
      { label: 'Thuế đã tự nộp', value: String(s.taxesPaid ?? 0) },
      { label: 'Khoản vay đã trả', value: String(s.loansPaid ?? 0) },
    ];
  }, [recap]);

  if (settingsQ.isLoading || recapQ.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Offline & Báo cáo" description="Cấu hình xử lý khi vắng mặt và xem tóm tắt sau khi quay lại." />
        <Panel title="Đang tải" borderColor="default">
          <div className="text-sm text-slate-600">Đang tải dữ liệu offline...</div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offline & Báo cáo"
        description="Cấu hình xử lý khi bạn vắng mặt (bù tiến trình có giới hạn, tự nhận phúc lợi, tự trả hóa đơn/nợ) và xem recap khi quay lại."
      />

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-slate-800">{message}</div>
      ) : null}

      {(settingsQ.isError || recapQ.isError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Không thể tải đầy đủ dữ liệu offline. Vui lòng thử tải lại trang hoặc bấm "Xử lý offline ngay &amp; cập nhật recap".
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Cài đặt offline của bạn" borderColor="emerald">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-600">Các tùy chọn này áp dụng theo chính sách hệ thống do admin cấu hình (giới hạn thời gian bù, cho phép tác vụ tự động).</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.offlineProcessingEnabled}
                onChange={(e) => setForm((f) => ({ ...f, offlineProcessingEnabled: e.target.checked }))}
              />
              Bật xử lý khi tôi offline
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.catchupEnabled}
                onChange={(e) => setForm((f) => ({ ...f, catchupEnabled: e.target.checked }))}
              />
              Bù tiến trình/mô phỏng thời gian offline (trong giới hạn)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.autoClaimWelfare}
                onChange={(e) => setForm((f) => ({ ...f, autoClaimWelfare: e.target.checked }))}
              />
              Tự nhận phúc lợi/lợi ích định kỳ đủ điều kiện
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.autoPay}
                onChange={(e) => setForm((f) => ({ ...f, autoPay: e.target.checked }))}
              />
              Tự trả hóa đơn/thuế/khoản vay đến hạn (khi đủ tiền)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.showRecapOnLogin}
                onChange={(e) => setForm((f) => ({ ...f, showRecapOnLogin: e.target.checked }))}
              />
              Hiển thị/ghi nhận recap khi quay lại
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 space-y-1">
              <div>Mốc xử lý gần nhất: <b>{fmtDate(settingsQ.data?.lastOfflineProcessedAt)}</b></div>
              <div>Một số tác vụ có thể bị bỏ qua nếu chính sách admin tắt hoặc không đủ điều kiện/tiền.</div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => saveSettings.mutate(form)}
                disabled={saveSettings.isPending}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saveSettings.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
              </button>
              <button
                type="button"
                onClick={() => process.mutate()}
                disabled={process.isPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {process.isPending ? 'Đang xử lý...' : 'Xử lý offline ngay & cập nhật recap'}
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Tóm tắt lần xử lý gần nhất" borderColor="default">
          {!recap ? (
            <div className="text-sm text-slate-600">Chưa có bản recap. Khi bạn quay lại sau thời gian offline, hệ thống sẽ tạo tóm tắt tại đây (hoặc bấm "Xử lý offline ngay").</div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <StatCard label="Thu nhập" value={formatMoney(income)} tone="positive" />
                <StatCard label="Chi phí" value={formatMoney(expense)} tone="negative" />
                <StatCard label="Dòng tiền ròng" value={formatMoney(net)} tone={net >= 0 ? 'positive' : 'negative'} />
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>Khoảng thời gian: <b>{fmtDate(recap.from)}</b> → <b>{fmtDate(recap.to)}</b></div>
                <div className="text-slate-500">Chỉ ghi nhận tác vụ tự động và bù tiến trình trong giới hạn chính sách/cài đặt của bạn.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {summaryBadges.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
                    <span className="text-slate-500">{b.label}:</span> <b>{b.value}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Sự kiện & thay đổi trong thời gian offline" borderColor="default">
        {events.length === 0 ? (
          <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/50">
            <div>
              <div className="font-semibold text-slate-800">Chưa có sự kiện</div>
              <div className="mt-1 text-xs text-slate-500">Các khoản tự nhận phúc lợi, tự trả hóa đơn/nợ và ghi nhận bù tiến trình sẽ hiển thị tại đây.</div>
            </div>
            <Badge variant="default">Bình thường</Badge>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev, i) => (
              <div key={`${ev.type}-${i}`} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ev.type}</div>
                  <div className="text-sm text-slate-800">{ev.message}</div>
                </div>
                <Badge variant={ev.type === 'tax' || ev.type === 'loan' ? 'warning' : ev.type === 'welfare' ? 'success' : 'default'}>
                  {ev.type === 'tax' ? 'Thuế' : ev.type === 'loan' ? 'Khoản vay' : ev.type === 'welfare' ? 'Phúc lợi' : 'Thông tin'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
        <div><b>Lưu ý:</b> Hệ thống xử lý offline theo <b>chính sách admin</b> và cài đặt cá nhân (giới hạn thời gian bù, cho phép tác vụ tự động).</div>
        <div>Hiện hỗ trợ: ghi nhận khoảng offline có giới hạn, tự nhận phúc lợi đủ điều kiện (idempotent), và tự trả thuế/khoản vay đến hạn (best-effort, khi đủ tiền). Không mô phỏng lại toàn bộ tick thế giới.</div>
      </div>
    </div>
  );
}
