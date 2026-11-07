import { PageHeader } from '@efls/ui';
import { useState } from 'react';

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

  function handleTrigger() {
    setNotice(
      `Chưa gửi server. Payload hợp lệ: ${eventType}, severity=${severity.toFixed(2)}, ${duration} năm.`,
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trình điều khiển AI & Sự kiện"
        description="Kích hoạt sự kiện vĩ mô và cấu hình tham số prompt LLM. AI chỉ đề xuất, core quyết định."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel space-y-3">
          <h2 className="panel-title">Kích hoạt sự kiện</h2>

          <label className="block text-xs text-slate-400">
            Loại sự kiện
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value as typeof eventType)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-850 px-3 py-2 text-sm"
            >
              {EVENTS.map((event) => (
                <option key={event.value} value={event.value}>
                  {event.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            Mức độ: <span className="font-mono text-slate-200">{severity.toFixed(2)}</span>
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

          <label className="block text-xs text-slate-400">
            Thời lượng (năm in-game)
            <input
              type="number"
              min={1}
              max={20}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-850 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs text-slate-400">
            Lý do (audit log)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-850 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={handleTrigger}
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
          >
            Kích hoạt
          </button>

          {notice ? <p className="text-xs text-amber-300">{notice}</p> : null}
        </section>

        <section className="panel space-y-3">
          <h2 className="panel-title">Tham số AI</h2>
          <p className="text-xs text-slate-500">
            Prompt được version hóa trong <code className="font-mono">ai/app/prompts/</code>. Thay
            đổi prompt phải qua review và chạy eval trước khi bật production.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-800 p-2">
              <dt className="text-slate-500">Provider</dt>
              <dd className="mt-0.5 font-mono text-slate-200">fake</dd>
            </div>
            <div className="rounded-lg border border-slate-800 p-2">
              <dt className="text-slate-500">Timeout</dt>
              <dd className="mt-0.5 font-mono text-slate-200">15s</dd>
            </div>
            <div className="rounded-lg border border-slate-800 p-2">
              <dt className="text-slate-500">Judge model</dt>
              <dd className="mt-0.5 font-mono text-slate-200">—</dd>
            </div>
            <div className="rounded-lg border border-slate-800 p-2">
              <dt className="text-slate-500">News model</dt>
              <dd className="mt-0.5 font-mono text-slate-200">—</dd>
            </div>
          </dl>
          <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-200/80">
            Không cấp quyền ghi trực tiếp cho AI. Mọi output phải qua schema validation và rule
            engine của game-core.
          </p>
        </section>
      </div>
    </div>
  );
}
