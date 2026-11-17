import { PageHeader } from '@efls/ui';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminStat } from '../shared/ui/AdminStat';
import { formatCompact } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
import { useDialog } from '../shared/ui/DialogContext';
import {
  type AiMetricsOverviewDto,
  type GmSnapshotDto,
  type GmDirectiveDto,
} from '@efls/contracts';

const EVENTS = [
  { value: 'banking_crisis', label: 'Khủng hoảng ngân hàng' },
  { value: 'pandemic', label: 'Dịch bệnh' },
  { value: 'crime_sweep', label: 'Càn quét tội phạm' },
  { value: 'market_boom', label: 'Bùng nổ thị trường' },
  { value: 'market_crash', label: 'Sụp đổ thị trường' },
] as const;

export function AiEventConsolePage() {
  const { confirm } = useDialog();
  const [eventType, setEventType] = useState<(typeof EVENTS)[number]['value']>('banking_crisis');
  const [severity, setSeverity] = useState(0.5);
  const [duration, setDuration] = useState(1);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [sweepTarget, setSweepTarget] = useState('');
  const [sweepNote, setSweepNote] = useState('');
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);

  const { data: aiMetrics } = useQuery<AiMetricsOverviewDto>({
    queryKey: ['observability', 'ai'],
    queryFn: () => adminRequest<AiMetricsOverviewDto>('/api/v1/observability/ai'),
  });
  const { data: gmSnapshot } = useQuery<GmSnapshotDto>({
    queryKey: ['gm', 'snapshot'],
    queryFn: () => adminRequest<GmSnapshotDto>('/api/v1/gm/snapshot'),
  });
  const { data: gmDirectives } = useQuery<GmDirectiveDto[]>({
    queryKey: ['gm', 'directives'],
    queryFn: () => adminRequest<GmDirectiveDto[]>('/api/v1/gm/directives'),
  });

  async function handleTrigger() {
    if (!reason.trim()) {
      setNotice('Vui lòng nhập lý do (audit log) trước khi kích hoạt.');
      return;
    }
    try {
      await adminRequest('/api/v1/admin/macro/events', {
        method: 'POST',
        body: JSON.stringify({
          type: eventType,
          severity,
          durationInGameYears: duration,
          reason: reason.trim(),
        }),
      });
      setNotice(`Đã kích hoạt sự kiện ${eventType}. Hệ thống đã lưu cấu hình, tạo bản tin/thông báo cho người dùng và ghi audit log.`);
      setReason('');
    } catch (err: any) {
      setNotice(err?.problem?.detail || err?.message || 'Kích hoạt sự kiện thất bại.');
    }
  }

  async function handleGmAdjust() {
    try {
      await adminRequest('/api/v1/gm/adjust', { method: 'POST' });
      setNotice('Đã yêu cầu GM AI điều chỉnh vĩ mô.');
    } catch {
      setNotice('Yêu cầu GM thất bại (AI có thể chưa sẵn sàng).');
    }
  }

  async function handleTriggerSweep(scope: 'character' | 'all') {
    const note = sweepNote.trim() || undefined;
    if (scope === 'all') {
      const ok = await confirm({
        title: 'Kích hoạt ĐẠI ÁN cho TẤT CẢ mọi nhân vật trong hệ thống?',
        type: 'danger',
        confirmText: 'Kích hoạt Đại án',
        message: [
          'Phạt 10% tiền mặt của từng nhân vật.',
          'Ghi án tích cho từng nhân vật.',
          'Hạ Heat về 40 cho từng nhân vật.',
        ],
      });
      if (!ok) return;
    } else {
      const target = sweepTarget.trim();
      if (!target) return;
      const ok = await confirm({
        title: `Kích hoạt Đại án cho mục tiêu "${target}"?`,
        type: 'danger',
        confirmText: 'Kích hoạt Đại án',
        message: 'Sẽ ép thực thi án kể cả khi Heat < 80.',
      });
      if (!ok) return;
    }
    setSweepBusy(true);
    setSweepResult(null);
    try {
      const body: any = scope === 'all' ? { scope: 'all', note } : (() => {
        const t = sweepTarget.trim();
        if (/^\d{12}$/.test(t.replace(/\s+/g, ''))) return { scope: 'character', cccd: t.replace(/\s+/g, ''), note };
        return { scope: 'character', characterId: t, note };
      })();
      const res = await adminRequest<any>('/api/v1/admin/sweeps/trigger', { method: 'POST', body: JSON.stringify(body) });
      if (res?.scope === 'all') {
        setSweepResult(`Đã kích hoạt Đại án toàn hệ thống: ảnh hưởng ${res.affected ?? 0} nhân vật, tổng phạt ${(res.totalFineMinor ?? 0).toLocaleString('vi-VN')} ₫.`);
      } else {
        setSweepResult(`Đã kích hoạt Đại án cho nhân vật ${res.characterId}: phạt ${(res.fineMinor ?? 0).toLocaleString('vi-VN')} ₫, giam ${res.prisonDays ?? 30} ngày (Heat tại thời điểm: ${res.triggerHeat ?? '—'}).`);
      }
      setSweepNote('');
      if (scope === 'character') setSweepTarget('');
    } catch (err: any) {
      setSweepResult(err?.problem?.detail || err?.message || 'Kích hoạt Đại án thất bại.');
    } finally {
      setSweepBusy(false);
    }
  }

  async function handleAiEvaluateSweep() {
    setSweepBusy(true);
    setSweepResult(null);
    try {
      const res = await adminRequest<any>('/api/v1/admin/sweeps/ai-evaluate', { method: 'POST' });
      const scopeLabel = res.scope === 'all' ? 'toàn hệ thống' : res.scope === 'targets' ? 'theo mục tiêu' : 'không thực thi';
      setSweepResult(`AI đánh giá xong (${res.source || 'ai'}): ${scopeLabel}, ảnh hưởng ${res.affected ?? 0} nhân vật, tổng phạt ${(res.totalFineMinor ?? 0).toLocaleString('vi-VN')} ₫.${res.rationale ? ` Lý do: ${res.rationale}` : ''}`);
    } catch (err: any) {
      setSweepResult(err?.problem?.detail || err?.message || 'AI đánh giá Đại án thất bại.');
    } finally {
      setSweepBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trình điều khiển AI & Sự kiện"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label="Tổng gọi AI"
          value={String(aiMetrics?.generate.totalCalls ?? 0)}
        />
        <AdminStat
          label="Chi phí AI"
          value={`$${Number(aiMetrics?.generate.totalCostUsd ?? 0).toFixed(4)}`}
        />
        <AdminStat
          label="Độ trễ trung bình"
          value={`${Math.round(aiMetrics?.generate.avgLatencyMs ?? 0)} ms`}
        />
        <AdminStat
          label="Tỷ lệ lỗi AI"
          value={`${((aiMetrics?.generate.errorRate ?? 0) * 100).toFixed(1)}%`}
          tone={(aiMetrics?.generate.errorRate ?? 0) > 0.1 ? 'negative' : 'default'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel space-y-3">
          <h2 className="panel-title">Kích hoạt sự kiện</h2>

          <label className="block text-xs text-slate-600">
            Loại sự kiện
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value as typeof eventType)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            >
              {EVENTS.map((event) => (
                <option key={event.value} value={event.value}>
                  {event.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-600">
            Mức độ: <span className="font-mono text-slate-800">{severity.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={severity}
              onChange={(event) => setSeverity(Number(event.target.value))}
              className="mt-1 w-full accent-amber-500"
            />
          </label>

          <label className="block text-xs text-slate-600">
            Thời lượng (năm)
            <input
              type="number"
              min={1}
              max={20}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs text-slate-600">
            Lý do
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={handleTrigger}
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
          >
            Kích hoạt
          </button>

          {notice ? <p className="text-xs text-amber-700">{notice}</p> : null}
        </section>

        <section className="panel space-y-3">
          <h2 className="panel-title">AI Điều Hành Kinh Tế — Điều chỉnh vĩ mô</h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 p-2">
              <dt className="text-slate-500">Lạm phát</dt>
              <dd className="mt-0.5 font-mono text-slate-800">
                {(gmSnapshot?.inflationPct ?? 0).toFixed(2)}%
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <dt className="text-slate-500">Lãi suất cơ bản</dt>
              <dd className="mt-0.5 font-mono text-slate-800">
                {(gmSnapshot?.baseRatePct ?? 0).toFixed(2)}%
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <dt className="text-slate-500">Cung tiền M2</dt>
              <dd className="mt-0.5 font-mono text-slate-800">
                {formatCompact(Number(gmSnapshot?.moneySupply?.amount ?? 0))}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <dt className="text-slate-500">Vốn hóa thị trường</dt>
              <dd className="mt-0.5 font-mono text-slate-800">
                {formatCompact(Number(gmSnapshot?.marketCap?.amount ?? 0))}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => void handleGmAdjust()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Yêu cầu AI Điều Hành phân tích
          </button>
          <div className="space-y-1">
            {(gmDirectives ?? []).slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                <span className="font-medium">{d.action === 'do_nothing' ? 'Giữ nguyên chính sách hiện tại' : d.action}</span>
                <span className="text-slate-500">
                  {d.applied ? 'Đã áp dụng' : 'Giữ nguyên'} · {d.createdAt?.slice(11, 16)} - {d.createdAt?.slice(8, 10)}/{d.createdAt?.slice(5, 7)}/{d.createdAt?.slice(0, 4)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel-title">Thống kê hiệu suất AI — Chi phí & Độ trễ</h2>
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-left">Tác vụ</th>
                <th className="py-2 text-left">Mô hình AI</th>
                <th className="py-2 text-right">Độ trễ</th>
                <th className="py-2 text-right">Lượng xử lý (Tokens)</th>
                <th className="py-2 text-right">Chi phí</th>
                <th className="py-2 text-left">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {(aiMetrics?.recent ?? []).map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1.5">{m.task === 'gm_economy' ? 'Điều tiết kinh tế vĩ mô' : m.task}</td>
                  <td className="py-1.5 font-mono">{m.model}</td>
                  <td className="py-1.5 text-right font-mono">{m.latencyMs} ms</td>
                  <td className="py-1.5 text-right font-mono">
                    {m.inputTokens} → {m.outputTokens}
                  </td>
                  <td className="py-1.5 text-right font-mono">${Number(m.costUsd).toFixed(6)}</td>
                  <td className="py-1.5">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(aiMetrics?.recent ?? []).length === 0 && (
            <p className="py-4 text-center text-xs text-slate-500">
              Chưa có metric nào — hãy để AI news cron hoặc GM chạy một vòng.
            </p>
          )}
        </div>
      </section>

      <section className="panel space-y-3 border-rose-200 bg-rose-50/30">
        <h2 className="panel-title text-rose-800">Đại án Công an</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Kích hoạt theo mục tiêu</div>
            
            <input
              value={sweepTarget}
              onChange={(e) => setSweepTarget(e.target.value)}
              placeholder="Mã nhân vật hoặc số CCCD (12 số)"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
            <textarea
              value={sweepNote}
              onChange={(e) => setSweepNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ghi chú/lý do (không bắt buộc)"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={sweepBusy || !sweepTarget.trim()}
              onClick={() => void handleTriggerSweep('character')}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {sweepBusy ? 'Đang xử lý…' : 'Kích hoạt Đại án cho mục tiêu'}
            </button>
          </div>
          <div className="rounded-xl border border-rose-300 bg-white p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Quét toàn hệ thống</div>
            
            <textarea
              value={sweepNote}
              onChange={(e) => setSweepNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ghi chú/lý do (không bắt buộc)"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={sweepBusy}
              onClick={() => void handleTriggerSweep('all')}
              className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              {sweepBusy ? 'Đang quét…' : 'Kích hoạt Đại án toàn hệ thống'}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-900">AI tự động đánh giá & xử lý</div>
          
          <button
            type="button"
            disabled={sweepBusy}
            onClick={() => void handleAiEvaluateSweep()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {sweepBusy ? 'Đang đánh giá…' : 'Chạy AI đánh giá Đại án ngay'}
          </button>
        </div>
        {sweepResult ? <p className="text-xs font-medium text-rose-800">{sweepResult}</p> : null}
      </section>
    </div>
  );
}
