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
        <PageHeader title="Khi vắng mặt" description="Chọn cách hệ thống hỗ trợ khi bạn vắng và xem tóm tắt khi quay lại." />
        <Panel title="Đang tải" borderColor="default">
          <div className="text-sm text-slate-600">Đang tải thông tin...</div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Khi vắng mặt"
        description="Chọn cách hệ thống hỗ trợ bạn trong lúc vắng (trong giới hạn cho phép), và xem lại những gì đã diễn ra khi bạn quay lại."
      />

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-slate-800">{message}</div>
      ) : null}

      {(settingsQ.isError || recapQ.isError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Không thể tải đầy đủ thông tin. Vui lòng thử tải lại trang hoặc bấm "Cập nhật tóm tắt ngay".
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Cài đặt của bạn" borderColor="emerald">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-600">Các lựa chọn bên dưới sẽ hoạt động trong phạm vi hệ thống cho phép.</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.offlineProcessingEnabled}
                onChange={(e) => setForm((f) => ({ ...f, offlineProcessingEnabled: e.target.checked }))}
              />
              Bật hỗ trợ khi tôi vắng mặt
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.catchupEnabled}
                onChange={(e) => setForm((f) => ({ ...f, catchupEnabled: e.target.checked }))}
              />
              Bù một phần thời gian đã vắng (trong giới hạn)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.autoClaimWelfare}
                onChange={(e) => setForm((f) => ({ ...f, autoClaimWelfare: e.target.checked }))}
              />
              Tự nhận hỗ trợ/phúc lợi đủ điều kiện
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.autoPay}
                onChange={(e) => setForm((f) => ({ ...f, autoPay: e.target.checked }))}
              />
              Tự thanh toán các khoản đến hạn (khi đủ tiền)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.showRecapOnLogin}
                onChange={(e) => setForm((f) => ({ ...f, showRecapOnLogin: e.target.checked }))}
              />
              Hiển thị tóm tắt khi tôi quay lại
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 space-y-1">
              <div>Lần cập nhật gần nhất: <b>{fmtDate(settingsQ.data?.lastOfflineProcessedAt)}</b></div>
              <div>Một số việc có thể không thực hiện được nếu chưa đủ điều kiện, không đủ tiền hoặc hệ thống chưa cho phép.</div>
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
                {process.isPending ? 'Đang cập nhật...' : 'Cập nhật tóm tắt ngay'}
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Tóm tắt gần đây" borderColor="default">
          {!recap ? (
            <div className="text-sm text-slate-600">Chưa có tóm tắt. Khi bạn quay lại sau thời gian vắng mặt, hệ thống sẽ ghi nhận và hiển thị tại đây (hoặc bấm "Cập nhật tóm tắt ngay").</div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <StatCard label="Thu nhập" value={formatMoney(income)} tone="positive" />
                <StatCard label="Chi phí" value={formatMoney(expense)} tone="negative" />
                <StatCard label="Dòng tiền ròng" value={formatMoney(net)} tone={net >= 0 ? 'positive' : 'negative'} />
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>Khoảng thời gian: <b>{fmtDate(recap.from)}</b> → <b>{fmtDate(recap.to)}</b></div>
                <div className="text-slate-500">Chỉ ghi nhận các việc hệ thống hỗ trợ tự động trong giới hạn cho phép.</div>
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

      <Panel title="Những thay đổi trong thời gian bạn vắng mặt" borderColor="default">
        {events.length === 0 ? (
          <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/50">
            <div>
              <div className="font-semibold text-slate-800">Chưa có thay đổi</div>
              <div className="mt-1 text-xs text-slate-500">Khi có khoản hỗ trợ được nhận tự động, thanh toán tự động hoặc thời gian được bù, thông tin sẽ hiển thị tại đây.</div>
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
        <div><b>Lưu ý:</b> Hệ thống chỉ hỗ trợ trong giới hạn cho phép và theo cài đặt của bạn.</div>
        <div>Có thể nhận hỗ trợ/phúc lợi đủ điều kiện và thanh toán các khoản đến hạn khi đủ tiền. Hệ thống không tự thực hiện mọi hoạt động thay bạn trong thời gian vắng mặt.</div>
      </div>
    </div>
  );
}
