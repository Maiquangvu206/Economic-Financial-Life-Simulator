import { PageHeader } from '@efls/ui';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminStat } from '../shared/ui/AdminStat';
import { formatCompact } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
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
  const [eventType, setEventType] = useState<(typeof EVENTS)[number]['value']>('banking_crisis');
  const [severity, setSeverity] = useState(0.5);
  const [duration, setDuration] = useState(1);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

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

  function handleTrigger() {
    setNotice(
      `Chưa gửi server. Payload hợp lệ: ${eventType}, severity=${severity.toFixed(2)}, ${duration} năm.`,
    );
  }

  async function handleGmAdjust() {
    try {
      await adminRequest('/api/v1/gm/adjust', { method: 'POST' });
      setNotice('Đã yêu cầu GM AI điều chỉnh vĩ mô.');
    } catch {
      setNotice('Yêu cầu GM thất bại (AI có thể chưa sẵn sàng).');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trình điều khiển AI & Sự kiện"
        description="Kích hoạt sự kiện vĩ mô và cấu hình tham số prompt LLM. AI chỉ đề xuất, core quyết định."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label="Tổng gọi AI"
          value={String(aiMetrics?.generate.totalCalls ?? 0)}
          hint="Tất cả task AI"
        />
        <AdminStat
          label="Chi phí AI"
          value={`$${Number(aiMetrics?.generate.totalCostUsd ?? 0).toFixed(4)}`}
          hint="Ước lượng theo tokens"
        />
        <AdminStat
          label="Độ trễ trung bình"
          value={`${Math.round(aiMetrics?.generate.avgLatencyMs ?? 0)} ms`}
          hint="Latency gọi AI service"
        />
        <AdminStat
          label="Tỷ lệ lỗi AI"
          value={`${((aiMetrics?.generate.errorRate ?? 0) * 100).toFixed(1)}%`}
          hint="Calls lỗi / tổng"
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
            Thời lượng (năm in-game)
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
            Lý do (audit log)
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
          <h2 className="panel-title">GM AI — Điều chỉnh vĩ mô</h2>
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
            Yêu cầu GM AI điều chỉnh
          </button>
          <div className="space-y-1">
            {(gmDirectives ?? []).slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                <span className="font-medium">{d.action}</span>
                <span className="text-slate-500">
                  {d.applied ? 'Đã áp dụng' : 'Giữ nguyên'} · {d.createdAt?.slice(0, 16)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel-title">AI Metrics — Chi phí & Độ trễ (50 gọi gần nhất)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-left">Task</th>
                <th className="py-2 text-left">Model</th>
                <th className="py-2 text-right">Latency</th>
                <th className="py-2 text-right">Tokens</th>
                <th className="py-2 text-right">Cost</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(aiMetrics?.recent ?? []).map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1.5">{m.task}</td>
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

      <section className="panel space-y-3">
        <h2 className="panel-title">Tham số AI</h2>
        <p className="text-xs text-slate-500">
          Prompt được version hóa trong <code className="font-mono">ai/app/prompts/</code>. Thay đổi
          prompt phải qua review và chạy eval trước khi bật production.
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 p-2">
            <dt className="text-slate-500">Provider</dt>
            <dd className="mt-0.5 font-mono text-slate-800">fake</dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-2">
            <dt className="text-slate-500">Timeout</dt>
            <dd className="mt-0.5 font-mono text-slate-800">15s</dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-2">
            <dt className="text-slate-500">Judge model</dt>
            <dd className="mt-0.5 font-mono text-slate-800">—</dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-2">
            <dt className="text-slate-500">News model</dt>
            <dd className="mt-0.5 font-mono text-slate-800">—</dd>
          </div>
        </dl>
        <p className="rounded-lg border border-amber-200/60 bg-amber-50 p-2 text-[11px] text-amber-800/90">
          Không cấp quyền ghi trực tiếp cho AI. Mọi output phải qua schema validation và rule engine
          của game-core.
        </p>
      </section>
    </div>
  );
}
