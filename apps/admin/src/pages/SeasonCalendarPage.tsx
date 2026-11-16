import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

type SeasonRangeDto = { season: SeasonId; startMonth: number; endMonth: number };

const SEASON_META: Record<SeasonId, { label: string; desc: string; accent: string }> = {
  spring: { label: '🌸 Mùa Xuân', desc: 'Mát mẻ, mưa phùn, năng suất +10%', accent: 'emerald' },
  summer: { label: '☀️ Mùa Hạ', desc: 'Nắng nóng gay gắt, hao thể lực +25%', accent: 'amber' },
  autumn: { label: '🍂 Mùa Thu', desc: 'Dễ chịu, sản xuất & kinh doanh đỉnh cao', accent: 'orange' },
  winter: { label: '❄️ Mùa Đông', desc: 'Se lạnh rét buốt, chi phí sưởi ấm', accent: 'sky' },
};

const DEFAULT_SEASON_RANGES: SeasonRangeDto[] = [
  { season: 'spring', startMonth: 2, endMonth: 4 },
  { season: 'summer', startMonth: 5, endMonth: 7 },
  { season: 'autumn', startMonth: 8, endMonth: 10 },
  { season: 'winter', startMonth: 11, endMonth: 1 },
];

function monthsOfRange(startMonth: number, endMonth: number): number[] {
  const months: number[] = [];
  let m = Math.round(startMonth);
  const end = Math.round(endMonth);
  for (let i = 0; i < 12; i += 1) {
    if (m < 1 || m > 12) break;
    months.push(m);
    if (m === end) break;
    m = m === 12 ? 1 : m + 1;
  }
  return months;
}

function validateSeasonRanges(ranges: SeasonRangeDto[]): string | null {
  const assigned = new Array<SeasonId | null>(13).fill(null);
  for (const r of ranges) {
    if (!(r.startMonth >= 1 && r.startMonth <= 12) || !(r.endMonth >= 1 && r.endMonth <= 12)) {
      return 'Tháng phải nằm trong khoảng 1 - 12.';
    }
    const months = monthsOfRange(r.startMonth, r.endMonth);
    if (months.length === 0) return 'Khoảng thời gian mùa không hợp lệ.';
    for (const m of months) {
      if (assigned[m]) return `Tháng ${m} đang bị gán cho cả ${SEASON_META[assigned[m]!].label} và ${SEASON_META[r.season].label}.`;
      assigned[m] = r.season;
    }
  }
  const missing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !assigned[m]);
  if (missing.length > 0) return `Còn tháng chưa được gán mùa: ${missing.join(', ')}.`;
  return null;
}

type SeasonEffectDto = { productivityPct: number; energyPct: number; taxPct: number; revenuePct: number };
type SeasonEffectsMap = Record<SeasonId, SeasonEffectDto>;

const DEFAULT_SEASON_EFFECTS: SeasonEffectsMap = {
  spring: { productivityPct: 110, energyPct: 95, taxPct: 100, revenuePct: 100 },
  summer: { productivityPct: 90, energyPct: 125, taxPct: 100, revenuePct: 105 },
  autumn: { productivityPct: 105, energyPct: 100, taxPct: 100, revenuePct: 100 },
  winter: { productivityPct: 95, energyPct: 115, taxPct: 100, revenuePct: 95 },
};

const EFFECT_FIELDS: Array<{ key: keyof SeasonEffectDto; label: string; hint: string }> = [
  { key: 'productivityPct', label: 'Năng suất', hint: 'Thu nhập từ việc làm' },
  { key: 'energyPct', label: 'Tiêu hao thể lực', hint: 'Càng cao càng hao thể lực' },
  { key: 'taxPct', label: 'Thuế', hint: 'Thuế phải nộp' },
  { key: 'revenuePct', label: 'Doanh thu', hint: 'Doanh thu công ty' },
];

type WelfareBenefitDto = {
  id: string;
  code: string;
  name: string;
  description: string;
  sender: string;
  bonus: { amount: number; currency: 'VND' };
  month: number | null;
  day: number | null;
  isActive: boolean;
};

type BenefitForm = {
  code: string;
  name: string;
  description: string;
  sender: string;
  bonusMinor: string;
  month: string;
  day: string;
  isActive: boolean;
};

const emptyForm: BenefitForm = {
  code: '',
  name: '',
  description: '',
  sender: 'Hệ thống',
  bonusMinor: '1000000',
  month: '',
  day: '',
  isActive: true,
};

function fmtMoney(amount: number) {
  return `${(amount ?? 0).toLocaleString('vi-VN')} ₫`;
}

export function SeasonCalendarPage() {
  const [seasonRanges, setSeasonRanges] = useState<SeasonRangeDto[]>(DEFAULT_SEASON_RANGES);
  const [seasonEffects, setSeasonEffects] = useState<SeasonEffectsMap>(DEFAULT_SEASON_EFFECTS);
  const [otRatePercent, setOtRatePercent] = useState(300);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [editing, setEditing] = useState<WelfareBenefitDto | null>(null);
  const [form, setForm] = useState<BenefitForm>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: benefits = [], isLoading, error, refetch } = useQuery<WelfareBenefitDto[]>({
    queryKey: ['admin', 'welfare', 'benefits'],
    queryFn: () => adminRequest<WelfareBenefitDto[]>('/api/v1/admin/welfare'),
  });
  const { data: gameConfig, refetch: refetchConfig } = useQuery<{
    season: SeasonId;
    currentDay: number;
    currentYear: number;
    currentMonth?: number;
    currentDayOfMonth?: number;
    otRatePercent?: number;
    seasonRanges?: SeasonRangeDto[];
    seasonEffects?: SeasonEffectsMap;
  }>({
    queryKey: ['admin', 'game-config'],
    queryFn: () => adminRequest('/api/v1/admin/game-config'),
  });

  useEffect(() => {
    if (gameConfig?.seasonRanges && gameConfig.seasonRanges.length === 4) {
      setSeasonRanges(gameConfig.seasonRanges);
    }
    if (gameConfig?.seasonEffects) {
      setSeasonEffects({ ...DEFAULT_SEASON_EFFECTS, ...gameConfig.seasonEffects });
    }
    if (gameConfig && typeof (gameConfig as any).otRatePercent === 'number') {
      setOtRatePercent(Number((gameConfig as any).otRatePercent));
    }
  }, [gameConfig?.seasonRanges, gameConfig?.seasonEffects, (gameConfig as any)?.otRatePercent]);

  const activeCount = useMemo(() => benefits.filter((b) => b.isActive).length, [benefits]);

  function notify(type: 'ok' | 'err', text: string) {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3500);
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
  }

  function startEdit(b: WelfareBenefitDto) {
    setEditing(b);
    setForm({
      code: b.code ?? '',
      name: b.name ?? '',
      description: b.description ?? '',
      sender: b.sender ?? 'Hệ thống',
      bonusMinor: String(b.bonus?.amount ?? 0),
      month: b.month != null ? String(b.month) : '',
      day: b.day != null ? String(b.day) : '',
      isActive: !!b.isActive,
    });
  }

  async function saveBenefit(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    try {
      const body = {
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        description: form.description.trim(),
        sender: form.sender.trim() || 'Hệ thống',
        bonusMinor: Math.max(0, Math.round(Number(form.bonusMinor || 0))),
        month: form.month.trim() === '' ? null : Math.max(1, Math.min(12, Math.round(Number(form.month)))),
        day: form.day.trim() === '' ? null : Math.max(1, Math.min(31, Math.round(Number(form.day)))),
        isActive: form.isActive,
      };
      if (!body.name) throw new Error('Tên phúc lợi là bắt buộc.');
      if (editing) {
        await adminRequest(`/api/v1/admin/welfare/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        notify('ok', 'Đã cập nhật phúc lợi.');
      } else {
        await adminRequest('/api/v1/admin/welfare', { method: 'POST', body: JSON.stringify(body) });
        notify('ok', 'Đã tạo phúc lợi mới.');
      }
      startCreate();
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể lưu phúc lợi.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(b: WelfareBenefitDto) {
    setBusy(`toggle-${b.id}`);
    try {
      await adminRequest(`/api/v1/admin/welfare/${b.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: b.code, name: b.name, description: b.description, sender: b.sender,
          bonusMinor: b.bonus?.amount ?? 0, month: b.month, day: b.day, isActive: !b.isActive,
        }),
      });
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể cập nhật trạng thái.');
    } finally {
      setBusy(null);
    }
  }

  async function removeBenefit(id: string) {
    if (!confirm('Xóa phúc lợi này?')) return;
    setBusy(`del-${id}`);
    try {
      await adminRequest(`/api/v1/admin/welfare/${id}`, { method: 'DELETE' });
      notify('ok', 'Đã xóa phúc lợi.');
      if (editing?.id === id) startCreate();
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể xóa phúc lợi.');
    } finally {
      setBusy(null);
    }
  }

  const handleApplyChanges = async () => {
    const invalid = validateSeasonRanges(seasonRanges);
    if (invalid) {
      notify('err', invalid);
      return;
    }
    for (const season of Object.keys(seasonEffects) as SeasonId[]) {
      for (const f of EFFECT_FIELDS) {
        const v = seasonEffects[season][f.key];
        if (!Number.isFinite(v) || v < 0 || v > 300) {
          notify('err', `Giá trị "${f.label}" của ${SEASON_META[season].label} phải nằm trong khoảng 0 - 300%.`);
          return;
        }
      }
    }
    try {
      await adminRequest('/api/v1/admin/game-config', {
        method: 'PUT',
        body: JSON.stringify({ seasonRanges, seasonEffects, otRatePercent }),
      });
      await refetchConfig();
      notify('ok', 'Đã lưu khoảng thời gian mùa và hiệu ứng theo mùa. Mùa trên toàn hệ thống (admin, người chơi, hiệu ứng thời tiết) sẽ tự chuyển theo đúng các khoảng tháng đã cấu hình.');
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể lưu cấu hình.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản trị Mùa & Phúc lợi công dân</h1>
          <p className="mt-1 text-xs text-slate-600">
            Cấu hình <b>khoảng thời gian mùa</b> (tháng bắt đầu - kết thúc) được lưu vào hệ thống dùng chung; phúc lợi/lì xì do hệ thống phát (server-side). Thời gian game cố định: <b>1 ngày = 1 phút thực tế</b>.
          </p>
        </div>
        <button type="button" onClick={handleApplyChanges} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 transition hover:bg-amber-400 shadow-md shadow-amber-500/20">
          Áp dụng & lưu mùa + hiệu ứng
        </button>
      </div>

      {statusMessage && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${statusMessage.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {statusMessage.type === 'ok' ? '✓ ' : '⚠ '}{statusMessage.text}
        </div>
      )}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được phúc lợi: {(error as any)?.message || 'Lỗi'}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">1. Khoảng thời gian mùa (hệ thống)</h2>
          <p className="text-[11px] text-slate-600">
            Thiết lập tháng bắt đầu - tháng kết thúc cho từng mùa. Mùa vắt qua năm mới: tháng bắt đầu lớn hơn tháng kết thúc (ví dụ Đông: 11 → 1). Toàn bộ 12 tháng phải được gán đủ 4 mùa, không trùng nhau.
          </p>
          <div className="space-y-2">
            {seasonRanges.map((r, idx) => {
              const meta = SEASON_META[r.season];
              const months = monthsOfRange(r.startMonth, r.endMonth);
              return (
                <div key={r.season} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{meta.label}</p>
                    <span className="text-[11px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Tháng {months.length > 0 ? months.join(', ') : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <label className="flex items-center gap-1.5">
                      Từ tháng
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={r.startMonth}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1)));
                          setSeasonRanges((prev) => prev.map((item, i) => (i === idx ? { ...item, startMonth: v } : item)));
                        }}
                        className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      đến tháng
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={r.endMonth}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1)));
                          setSeasonRanges((prev) => prev.map((item, i) => (i === idx ? { ...item, endMonth: v } : item)));
                        }}
                        className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono"
                      />
                    </label>
                    <span className="text-[11px] text-slate-500">{meta.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
            <p><b>Thời gian game:</b> cố định <b>1 ngày = 1 phút thực tế</b> (không cấu hình tốc độ).</p>
            <p>
              Mùa hiện tại trên hệ thống: <b>{gameConfig?.season ? SEASON_META[gameConfig.season].label : '—'}</b>{' '}
              (năm {gameConfig?.currentYear ?? 2000}, ngày {gameConfig?.currentDayOfMonth ?? '—'} tháng {gameConfig?.currentMonth ?? '—'}).
            </p>
            <p className="text-amber-700"><b>Lưu ý:</b> mùa tự chuyển theo các khoảng tháng ở trên; không còn cơ chế chọn mùa thủ công theo từng ngày.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">2. Hiệu ứng theo mùa</h2>
          <p className="text-[11px] text-slate-600">
            Hiệu chỉnh tác động kinh tế/xã hội của từng mùa. Đơn vị là <b>%</b> so với mức bình thường: <b>100 = không thay đổi</b>, &gt;100 = tăng, &lt;100 = giảm (cho phép 0 – 300).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-2 font-semibold">Mùa</th>
                  {EFFECT_FIELDS.map((f) => (
                    <th key={f.key} className="px-2 py-2 font-semibold">
                      {f.label}
                      <span className="block font-normal normal-case tracking-normal text-slate-400">{f.hint}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(SEASON_META) as SeasonId[]).map((season) => (
                  <tr key={season} className="border-t border-slate-200">
                    <td className="py-2 pr-2 font-semibold text-slate-800 whitespace-nowrap">{SEASON_META[season].label}</td>
                    {EFFECT_FIELDS.map((f) => {
                      const value = seasonEffects[season][f.key];
                      const tone = value > 100 ? 'text-emerald-600' : value < 100 ? 'text-rose-600' : 'text-slate-700';
                      return (
                        <td key={f.key} className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={300}
                              step={5}
                              value={value}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0)));
                                setSeasonEffects((prev) => ({ ...prev, [season]: { ...prev[season], [f.key]: v } }));
                              }}
                              className={`w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono ${tone}`}
                            />
                            <span className="text-slate-400">%</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSeasonEffects(DEFAULT_SEASON_EFFECTS)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Khôi phục mặc định
            </button>
            <span className="text-[11px] text-slate-500">
              Hiệu ứng áp dụng theo mùa hiện tại của lịch game: năng suất → thu nhập việc làm, tiêu hao thể lực → hao thể lực theo năm, thuế → thuế phải nộp, doanh thu → doanh thu công ty.
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">3. Quy định Lao động & Phúc lợi (tham chiếu)</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-700">Hệ số lương làm thêm ngày lễ (OT):</span>
              <span className="font-mono font-bold text-emerald-600">{otRatePercent}% (x{(otRatePercent / 100).toFixed(1)})</span>
            </div>
            <input type="range" min="150" max="400" step="10" value={otRatePercent} onChange={(e) => setOtRatePercent(Number(e.target.value))} className="w-full accent-emerald-500 cursor-pointer" />
            <p className="text-[11px] text-slate-500">OT hiển thị tham chiếu; phúc lợi/lì xì được cấu hình và phát qua API (server-side) bên dưới.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 text-xs space-y-2">
            <p className="font-semibold text-slate-800">Phúc lợi đang cấu hình (server):</p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div>Tổng gói phúc lợi: <span className="font-bold text-slate-800">{benefits.length}</span></div>
              <div>Đang bật: <span className="font-bold text-emerald-600">{activeCount}</span></div>
              <div className="col-span-2">Nhân vật nhận qua nút &quot;Nhận Lì Xì/Phúc lợi&quot; → cộng tiền vào tài khoản thật (ledger/cash).</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">{editing ? 'Sửa phúc lợi' : 'Thêm phúc lợi'}</h2>
          <form onSubmit={saveBenefit} className="space-y-3 text-sm">
            <label className="block text-xs text-slate-700">Mã (code, duy nhất)
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="vd: tet_nguyen_dan, quoc_khanh..." disabled={!!editing} />
            </label>
            <label className="block text-xs text-slate-700">Tên phúc lợi
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="block text-xs text-slate-700">Người gửi/đơn vị
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
            </label>
            <label className="block text-xs text-slate-700">Nội dung/mô tả
              <textarea className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs text-slate-700">Thưởng (₫)
                <input type="number" min={0} step={1000} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={form.bonusMinor} onChange={(e) => setForm({ ...form, bonusMinor: e.target.value })} />
              </label>
              <label className="block text-xs text-slate-700">Tháng (1-12)
                <input type="number" min={1} max={12} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} placeholder="trống=n/a" />
              </label>
              <label className="block text-xs text-slate-700">Ngày (1-31)
                <input type="number" min={1} max={31} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} placeholder="trống=n/a" />
              </label>
            </div>
            <div className="text-[11px] text-slate-500">Số tiền hiển thị: <b>{fmtMoney(Number(form.bonusMinor || 0))}</b>. Nhân vật chỉ nhận 1 lần/kỳ (năm game) cho mỗi phúc lợi.</div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Đang bật (cho phép nhận)
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy === 'save'} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy === 'save' ? 'Đang lưu...' : (editing ? 'Cập nhật' : 'Tạo phúc lợi')}</button>
              {editing && <button type="button" onClick={startCreate} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700">Hủy sửa</button>}
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">3. Danh sách phúc lợi & ngày lễ</h2>
            <button type="button" onClick={() => refetch()} className="text-xs text-slate-600 hover:text-slate-900">Tải lại</button>
          </div>
          {isLoading ? (
            <div className="text-sm text-slate-600">Đang tải...</div>
          ) : benefits.length === 0 ? (
            <div className="text-sm text-slate-500">Chưa có phúc lợi nào.</div>
          ) : (
            <div className="divide-y divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200 bg-slate-100/70">
              {benefits.map((b) => (
                <div key={b.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">{b.name}</span>
                      <span className="text-[11px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">{b.code}</span>
                      <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{fmtMoney(b.bonus?.amount ?? 0)}</span>
                      {(b.month != null || b.day != null) && (
                        <span className="text-xs font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                          {b.day != null ? `${b.day}` : '—'}/{b.month != null ? `${b.month}` : '—'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 truncate">{b.description || b.sender}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => toggleActive(b)} disabled={busy === `toggle-${b.id}`} className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${b.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                      {b.isActive ? 'Đang bật' : 'Đã tắt'}
                    </button>
                    <button type="button" onClick={() => startEdit(b)} className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700">Sửa</button>
                    <button type="button" onClick={() => removeBenefit(b.id)} disabled={busy === `del-${b.id}`} className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700">Xóa</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
