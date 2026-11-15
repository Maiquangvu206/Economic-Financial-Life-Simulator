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
      if (!confirm('Xác nhận kích hoạt ĐẠI ÁN cho TẤT CẢ mọi nhân vật trong hệ thống? (Phạt 10% tiền mặt, ghi án tích, hạ Heat về 40 cho từng người)')) return;
    } else {
      const target = sweepTarget.trim();
      if (!target) return;
      if (!confirm(`Xác nhận kích hoạt Đại án cho mục tiêu "${target}"? (Ép thực thi kể cả khi Heat < 80)`)) return;
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
        <div className="overflow-auto max-h-[60vh]">
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

      <section className="panel space-y-3 border-rose-200 bg-rose-50/30">
        <h2 className="panel-title text-rose-800">Đại án Công an (do quản trị viên kích hoạt)</h2>
        <p className="text-xs text-slate-700 leading-relaxed">
          Đại án được <b>AI tự động xử lý</b>: khi Heat đạt ngưỡng trong lúc phạm tội và theo đánh giá định kỳ, AI đề xuất (mục tiêu/toàn hệ thống/không hành động) và core kiểm tra, áp dụng an toàn (có fallback). <b>Admin/moderator</b> vẫn có thể can thiệp thủ công hoặc chạy AI đánh giá ngay.
          Quy tắc xử lý: phạt <b>10% tiền mặt</b>, ghi <b>án tích</b> (30 ngày tù), hạ Heat về <b>40</b>.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Kích hoạt theo mục tiêu</div>
            <div className="text-[11px] text-slate-600">Chỉ định một nhân vật bằng <b>Character ID</b> hoặc <b>CCCD</b> (ép thực thi kể cả khi Heat &lt; 80).</div>
            <input
              value={sweepTarget}
              onChange={(e) => setSweepTarget(e.target.value)}
              placeholder="Character ID hoặc CCCD (12 số)"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
            <textarea
              value={sweepNote}
              onChange={(e) => setSweepNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ghi chú/lý do (audit log, tuỳ chọn)"
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
            <div className="text-[11px] text-slate-600">Thực thi Đại án cho <b>tất cả mọi nhân vật</b> trong hệ thống (bất kể Heat). Hành động quy mô lớn, sẽ ghi audit log và thông báo.</div>
            <textarea
              value={sweepNote}
              onChange={(e) => setSweepNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ghi chú/lý do (audit log, tuỳ chọn)"
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
          <div className="text-[11px] text-slate-600">AI sẽ phân tích tình hình (Heat/ứng viên) và đề xuất kích hoạt theo mục tiêu hoặc toàn hệ thống; core kiểm tra và áp dụng an toàn (có fallback). Admin vẫn có thể can thiệp thủ công như trên.</div>
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
