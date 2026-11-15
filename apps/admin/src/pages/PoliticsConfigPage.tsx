import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type Money = { amount: number; currency: 'VND' };

type CandidateDto = {
  id: string;
  characterId: string;
  name: string;
  votes: number;
  donations: Money;
  score: number;
  isMe: boolean;
};

type ElectionView = {
  id: string;
  office: string;
  status: 'open' | 'ended';
  startsAt: string;
  endsAt: string;
  winnerCandidateId: string | null;
  winnerCharacterId?: string | null;
  winnerCharacterName?: string | null;
  termDays?: number | null;
  termStartedAt?: string | null;
  termEndsAt?: string | null;
  termStatus?: string | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
  totalVotes: number;
  candidates: CandidateDto[];
};

type MayorConfig = {
  enabled: boolean;
  termDays: number;
  salaryMinor: number;
  salaryIntervalGameDays: number;
  perkTaxDiscountPct: number;
  policyCooldownMinutes: number;
  policyCostMinor: number;
  treasurySpendLimitMinor: number;
  otRateAdjustMinPct: number;
  otRateAdjustMaxPct: number;
  otRateAdjustStepPct: number;
  welfareBonusPerCitizenMinor: number;
  welfareBonusMaxCitizens: number;
};

type MayorAction = {
  id: string;
  electionId: string | null;
  actionType: string;
  status: string;
  amountMinor: number | null;
  reason: string | null;
  payload: any;
  actorCharacterName?: string | null;
  createdAt: string;
};

type PoliticsAdminOverview = {
  current: ElectionView | null;
  elections: ElectionView[];
  mayor?: {
    active: boolean;
    electionId?: string | null;
    characterId?: string | null;
    characterName?: string | null;
    userId?: string | null;
    termStatus?: string | null;
    termStartedAt?: string | null;
    termEndsAt?: string | null;
    revokedAt?: string | null;
    revokedReason?: string | null;
    config: MayorConfig;
  };
  actions?: MayorAction[];
  config: {
    office: string;
    campaignFeeMinor: number;
    minDonationMinor: number;
    donationScoreRule: string;
    voteScoreRule: string;
    winnerRule: string;
    defaultDurationDays: number;
    mayor?: MayorConfig;
  };
};

function fmtMoney(m: Money | number | undefined) {
  const amount = typeof m === 'number' ? m : m?.amount ?? 0;
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return String(iso); }
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function termLabel(status?: string | null) {
  switch (status) {
    case 'active': return 'Đang tại nhiệm';
    case 'revoked': return 'Đã thu hồi';
    case 'expired': return 'Hết nhiệm kỳ';
    case 'none': return 'Không có';
    default: return status || '—';
  }
}

export function PoliticsConfigPage() {
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState('7');
  const [termDaysInput, setTermDaysInput] = useState('7');
  const [endsAt, setEndsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 7 * 24 * 3600_000)));
  const [revokeReason, setRevokeReason] = useState('');
  const [mayorCfgDraft, setMayorCfgDraft] = useState<Partial<MayorConfig>>({});

  const { data, isLoading, error, refetch } = useQuery<PoliticsAdminOverview>({
    queryKey: ['admin', 'politics', 'overview'],
    queryFn: () => adminRequest<PoliticsAdminOverview>('/api/v1/admin/politics/overview'),
  });

  const current = data?.current ?? null;
  const config = data?.config;
  const elections = data?.elections ?? [];
  const mayor = data?.mayor ?? null;
  const mayorConfig = (mayor?.config ?? data?.config?.mayor) as MayorConfig | undefined;
  const actions = data?.actions ?? [];
  const hasOpen = useMemo(() => elections.some((e) => e.status === 'open'), [elections]);

  function notify(type: 'ok' | 'err', text: string) {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  }

  async function createElection(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    try {
      const body: any = {};
      if (endsAt) {
        const d = new Date(endsAt);
        if (Number.isNaN(d.getTime())) throw new Error('Thời gian kết thúc không hợp lệ.');
        body.endsAt = d.toISOString();
      } else if (durationDays) {
        body.durationDays = Math.max(1, Math.round(Number(durationDays)));
      }
      if (termDaysInput) body.termDays = Math.max(1, Math.round(Number(termDaysInput)));
      await adminRequest('/api/v1/admin/politics/elections', { method: 'POST', body: JSON.stringify(body) });
      notify('ok', 'Đã tạo cuộc bầu cử mới.');
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể tạo bầu cử.');
    } finally {
      setBusy(null);
    }
  }

  async function endElection(id: string) {
    if (!confirm('Chốt kết quả cuộc bầu cử này? Nếu có người thắng, nhiệm kỳ Thị trưởng sẽ được kích hoạt.')) return;
    setBusy(`end-${id}`);
    try {
      await adminRequest(`/api/v1/admin/politics/elections/${id}/end`, { method: 'POST' });
      notify('ok', 'Đã chốt kết quả bầu cử.');
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể chốt bầu cử.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeCurrentMayor() {
    const reason = revokeReason.trim();
    if (reason.length < 5) {
      notify('err', 'Vui lòng nhập lý do thu hồi tư cách (tối thiểu 5 ký tự).');
      return;
    }
    if (!confirm('Thu hồi tư cách Thị trưởng đương nhiệm? Quyền hạn/lợi ích sẽ bị gỡ ngay lập tức.')) return;
    setBusy('revoke');
    try {
      await adminRequest('/api/v1/admin/politics/mayor/revoke', {
        method: 'POST',
        body: JSON.stringify({ reason, electionId: mayor?.electionId || undefined }),
      });
      setRevokeReason('');
      notify('ok', 'Đã thu hồi tư cách Thị trưởng.');
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể thu hồi tư cách.');
    } finally {
      setBusy(null);
    }
  }

  async function saveMayorConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!mayorConfig) return;
    setBusy('cfg');
    try {
      const merged = { ...mayorConfig, ...mayorCfgDraft };
      await adminRequest('/api/v1/admin/politics/mayor/config', { method: 'PUT', body: JSON.stringify(merged) });
      setMayorCfgDraft({});
      notify('ok', 'Đã cập nhật cấu hình Thị trưởng.');
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể cập nhật cấu hình.');
    } finally {
      setBusy(null);
    }
  }

  const draft = { ...(mayorConfig ?? {}), ...mayorCfgDraft } as Partial<MayorConfig>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cấu hình & Quản trị Chính trị / Bầu cử</h1>
          <p className="mt-1 text-xs text-slate-600">
            Bầu cử Thị trưởng, nhiệm kỳ/quyền lợi/chính sách (3 pha) và thu hồi tư cách khi lạm dụng (admin).
          </p>
        </div>
        <button type="button" onClick={() => refetch()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Tải lại
        </button>
      </div>

      {statusMessage && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${statusMessage.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {statusMessage.type === 'ok' ? '✓ ' : '⚠ '}{statusMessage.text}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Không tải được dữ liệu: {(error as any)?.message || 'Lỗi'}
        </div>
      )}

      {/* Mayor active + revoke */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">Thị trưởng đương nhiệm & Thu hồi tư cách</h2>
        {mayor?.active ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 font-semibold">Đương nhiệm</span>
              <b className="text-slate-900">{mayor.characterName ?? '—'}</b>
              <span className="text-xs text-slate-600">Character: <span className="font-mono">{mayor.characterId}</span></span>
              <span className="text-xs text-slate-600">User: <span className="font-mono">{mayor.userId ?? '—'}</span></span>
            </div>
            <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">Trạng thái</div><div className="font-medium">{termLabel(mayor.termStatus)}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">Bắt đầu</div><div className="font-medium">{fmtDate(mayor.termStartedAt)}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">Kết thúc</div><div className="font-medium">{fmtDate(mayor.termEndsAt)}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="text-slate-500">Election</div><div className="font-mono text-[11px]">{mayor.electionId}</div></div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
              <div className="text-xs font-semibold text-rose-800">Thu hồi/Hủy tư cách Thị trưởng (khi lạm dụng)</div>
              <p className="text-[11px] text-rose-700">Hành động có hiệu lực ngay: gỡ quyền/lợi ích nhiệm kỳ, ghi audit/notify/realtime. Không thể hoàn tác tư cách đã thu hồi.</p>
              <textarea
                className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs text-slate-800"
                rows={2}
                placeholder="Nhập lý do thu hồi tư cách (bắt buộc, tối thiểu 5 ký tự)..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
              <button type="button" onClick={revokeCurrentMayor} disabled={busy === 'revoke'} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                {busy === 'revoke' ? 'Đang thu hồi...' : 'Thu hồi tư cách Thị trưởng'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Hiện không có Thị trưởng đương nhiệm. {mayorConfig?.enabled === false ? '(Hệ thống Thị trưởng đang tắt)' : ''}</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Create election */}
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">1. Tạo cuộc bầu cử</h2>
          <form onSubmit={createElection} className="space-y-3 text-sm">
            <div className="text-xs text-slate-600">Chức vụ: <b>Thị trưởng (mayor)</b>. Chỉ 1 cuộc mở tại một thời điểm.</div>
            <label className="block text-xs text-slate-700">Thời điểm kết thúc (endsAt)
              <input type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-700">Thời lượng bầu cử (ngày)
                <input type="number" min={1} max={30} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
              </label>
              <label className="block text-xs text-slate-700">Nhiệm kỳ nếu thắng (ngày)
                <input type="number" min={1} max={365} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={termDaysInput} onChange={(e) => setTermDaysInput(e.target.value)} />
              </label>
            </div>
            <button type="submit" disabled={busy === 'create' || hasOpen} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy === 'create' ? 'Đang tạo...' : 'Tạo bầu cử mới'}
            </button>
            {hasOpen && <p className="text-[11px] text-amber-700">Đang có cuộc bầu cử mở — cần chốt trước khi tạo cuộc mới.</p>}
          </form>
        </div>

        {/* Mayor config */}
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">2. Cấu hình Thị trưởng (3 pha)</h2>
          {mayorConfig ? (
            <form onSubmit={saveMayorConfig} className="space-y-3 text-xs">
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={draft.enabled ?? mayorConfig.enabled} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, enabled: e.target.checked }))} />
                Bật hệ thống Thị trưởng (nhiệm kỳ/quyền lợi/chính sách)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-slate-700">Nhiệm kỳ mặc định (ngày)
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.termDays ?? mayorConfig.termDays} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, termDays: Number(e.target.value) }))} />
                </label>
                <label className="text-slate-700">Phụ cấp (VNĐ)
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.salaryMinor ?? mayorConfig.salaryMinor} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, salaryMinor: Number(e.target.value) }))} />
                </label>
                <label className="text-slate-700">Chu kỳ phụ cấp (ngày game)
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.salaryIntervalGameDays ?? mayorConfig.salaryIntervalGameDays} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, salaryIntervalGameDays: Number(e.target.value) }))} />
                </label>
                <label className="text-slate-700">Cooldown chính sách (phút)
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.policyCooldownMinutes ?? mayorConfig.policyCooldownMinutes} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, policyCooldownMinutes: Number(e.target.value) }))} />
                </label>
                <label className="text-slate-700">Hạn mức chi quỹ (VNĐ/lần)
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.treasurySpendLimitMinor ?? mayorConfig.treasurySpendLimitMinor} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, treasurySpendLimitMinor: Number(e.target.value) }))} />
                </label>
                <label className="text-slate-700">OT min/max (%)
                  <div className="mt-1 flex gap-1">
                    <input type="number" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.otRateAdjustMinPct ?? mayorConfig.otRateAdjustMinPct} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, otRateAdjustMinPct: Number(e.target.value) }))} />
                    <input type="number" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={draft.otRateAdjustMaxPct ?? mayorConfig.otRateAdjustMaxPct} onChange={(e) => setMayorCfgDraft((s) => ({ ...s, otRateAdjustMaxPct: Number(e.target.value) }))} />
                  </div>
                </label>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 space-y-0.5">
                <div><b>Phí tranh cử:</b> {fmtMoney(config?.campaignFeeMinor)} · <b>Quyên góp tối thiểu:</b> {fmtMoney(config?.minDonationMinor)}</div>
                <div><b>Luật thắng:</b> {config?.winnerRule}</div>
              </div>
              <button type="submit" disabled={busy === 'cfg'} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                {busy === 'cfg' ? 'Đang lưu...' : 'Lưu cấu hình Thị trưởng'}
              </button>
            </form>
          ) : (
            <div className="text-sm text-slate-600">{isLoading ? 'Đang tải...' : 'Không có dữ liệu cấu hình.'}</div>
          )}
        </div>
      </div>

      {/* Current election */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">3. Cuộc bầu cử hiện tại / gần nhất</h2>
        {isLoading ? (
          <div className="text-sm text-slate-600">Đang tải...</div>
        ) : !current ? (
          <div className="text-sm text-slate-500">Chưa có cuộc bầu cử nào.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono">{current.id}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${current.status === 'open' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                {current.status === 'open' ? 'Đang mở' : 'Đã kết thúc'}
              </span>
              <span className="text-slate-600">Bắt đầu: {fmtDate(current.startsAt)}</span>
              <span className="text-slate-600">Kết thúc: {fmtDate(current.endsAt)}</span>
              <span className="text-slate-600">Tổng phiếu: <b>{current.totalVotes}</b></span>
              {current.winnerCharacterName && <span className="text-amber-700 font-semibold">Thị trưởng: {current.winnerCharacterName}</span>}
              {current.termStatus && current.termStatus !== 'none' && (
                <span className={`rounded-full px-2 py-0.5 border ${current.termStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : current.termStatus === 'revoked' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  Nhiệm kỳ: {termLabel(current.termStatus)}
                </span>
              )}
            </div>
            {current.termStatus === 'revoked' && current.revokedReason && (
              <div className="text-xs text-rose-700">Lý do thu hồi: {current.revokedReason}</div>
            )}
            {current.status === 'open' && (
              <button type="button" onClick={() => endElection(current.id)} disabled={busy === `end-${current.id}`} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                {busy === `end-${current.id}` ? 'Đang chốt...' : 'Chốt kết quả bầu cử'}
              </button>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Ứng viên</th>
                    <th className="px-3 py-2 text-left">Character</th>
                    <th className="px-3 py-2 text-right">Phiếu</th>
                    <th className="px-3 py-2 text-right">Quyên góp</th>
                    <th className="px-3 py-2 text-right">Điểm</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {current.candidates.length === 0 ? (
                    <tr><td className="px-3 py-3 text-slate-500" colSpan={6}>Chưa có ứng viên.</td></tr>
                  ) : (
                    current.candidates.map((c) => (
                      <tr key={c.id} className={c.id === current.winnerCandidateId ? 'bg-amber-50/60' : ''}>
                        <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{c.characterId}</td>
                        <td className="px-3 py-2 text-right">{c.votes}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(c.donations)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{c.score}</td>
                        <td className="px-3 py-2">{c.id === current.winnerCandidateId ? <span className="text-amber-700 font-semibold">Thắng cử</span> : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">4. Lịch sử bầu cử & nhiệm kỳ</h2>
        {elections.length === 0 ? (
          <div className="text-sm text-slate-500">Chưa có lịch sử.</div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {elections.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-600">{e.id}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${e.status === 'open' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-700'}`}>
                      {e.status === 'open' ? 'Đang mở' : 'Đã kết thúc'}
                    </span>
                    {e.termStatus && e.termStatus !== 'none' && (
                      <span className={`rounded-full px-2 py-0.5 border ${e.termStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : e.termStatus === 'revoked' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {termLabel(e.termStatus)}
                      </span>
                    )}
                    <span>Phiếu: <b>{e.totalVotes}</b></span>
                    <span>Ứng viên: <b>{e.candidates.length}</b></span>
                  </div>
                  <div className="text-slate-600">{fmtDate(e.startsAt)} → {fmtDate(e.endsAt)}</div>
                </div>
                {e.winnerCharacterName && <div className="mt-1 text-slate-700">Thị trưởng: <b>{e.winnerCharacterName}</b> {e.termEndsAt ? `(đến ${fmtDate(e.termEndsAt)})` : ''}</div>}
                {e.termStatus === 'revoked' && e.revokedReason && <div className="mt-1 text-rose-700">Thu hồi: {e.revokedReason}</div>}
                {e.status === 'open' && (
                  <div className="mt-2">
                    <button type="button" onClick={() => endElection(e.id)} disabled={busy === `end-${e.id}`} className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                      Chốt kết quả
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mayor actions log */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">5. Nhật ký hành động/nhiệm kỳ Thị trưởng</h2>
        {actions.length === 0 ? (
          <div className="text-sm text-slate-500">Chưa có nhật ký.</div>
        ) : (
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Thời gian</th>
                  <th className="px-3 py-2 text-left">Hành động</th>
                  <th className="px-3 py-2 text-left">Người thực hiện</th>
                  <th className="px-3 py-2 text-left">Số tiền</th>
                  <th className="px-3 py-2 text-left">Lý do/Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                    <td className="px-3 py-2"><span className="font-mono text-[11px]">{a.actionType}</span> <span className="text-slate-500">({a.status})</span></td>
                    <td className="px-3 py-2">{a.actorCharacterName ?? 'Hệ thống/Admin'}</td>
                    <td className="px-3 py-2">{a.amountMinor != null ? fmtMoney(a.amountMinor) : '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.reason || (a.payload ? JSON.stringify(a.payload) : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
