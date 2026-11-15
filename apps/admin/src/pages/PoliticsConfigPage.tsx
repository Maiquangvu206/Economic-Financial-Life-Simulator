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
  totalVotes: number;
  candidates: CandidateDto[];
};

type PoliticsAdminOverview = {
  current: ElectionView | null;
  elections: ElectionView[];
  config: {
    office: string;
    campaignFeeMinor: number;
    minDonationMinor: number;
    donationScoreRule: string;
    voteScoreRule: string;
    winnerRule: string;
    defaultDurationDays: number;
  };
};

function fmtMoney(m: Money | number | undefined) {
  const amount = typeof m === 'number' ? m : m?.amount ?? 0;
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PoliticsConfigPage() {
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState('7');
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 3600_000);
    return toLocalInputValue(d);
  });

  const { data, isLoading, error, refetch } = useQuery<PoliticsAdminOverview>({
    queryKey: ['admin', 'politics', 'overview'],
    queryFn: () => adminRequest<PoliticsAdminOverview>('/api/v1/admin/politics/overview'),
  });

  const current = data?.current ?? null;
  const config = data?.config;
  const elections = data?.elections ?? [];
  const hasOpen = useMemo(() => elections.some((e) => e.status === 'open'), [elections]);

  function notify(type: 'ok' | 'err', text: string) {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
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
      await adminRequest('/api/v1/admin/politics/elections', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      notify('ok', 'Đã tạo cuộc bầu cử mới.');
      await refetch();
    } catch (err: any) {
      notify('err', err?.problem?.detail || err?.message || 'Không thể tạo bầu cử.');
    } finally {
      setBusy(null);
    }
  }

  async function endElection(id: string) {
    if (!confirm('Chốt kết quả cuộc bầu cử này? Hành động không thể hoàn tác.')) return;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cấu hình & Quản trị Chính trị / Bầu cử</h1>
          <p className="mt-1 text-xs text-slate-600">
            Tạo cuộc bầu cử Thị trưởng, theo dõi ứng viên/phiếu bầu và chốt kết quả (admin/moderator).
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Tải lại
        </button>
      </div>

      {statusMessage && (
        <div
          className={`rounded-xl border p-3 text-xs font-semibold ${
            statusMessage.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {statusMessage.type === 'ok' ? '✓ ' : '⚠ '}
          {statusMessage.text}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Không tải được dữ liệu bầu cử: {(error as any)?.message || 'Lỗi'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">1. Tạo cuộc bầu cử</h2>
          <form onSubmit={createElection} className="space-y-3 text-sm">
            <div className="text-xs text-slate-600">
              Chức vụ: <b>Thị trưởng (mayor)</b>. Chỉ được có 1 cuộc bầu cử đang mở tại một thời điểm.
            </div>
            <label className="block text-xs text-slate-700">
              Thời điểm kết thúc (endsAt)
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            <label className="block text-xs text-slate-700">
              Hoặc thời lượng (ngày) nếu bỏ trống endsAt
              <input
                type="number"
                min={1}
                max={30}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy === 'create' || hasOpen}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              title={hasOpen ? 'Đang có cuộc bầu cử mở' : undefined}
            >
              {busy === 'create' ? 'Đang tạo...' : 'Tạo bầu cử mới'}
            </button>
            {hasOpen && (
              <p className="text-[11px] text-amber-700">
                Hiện có cuộc bầu cử đang mở — cần chốt kết quả trước khi tạo cuộc mới.
              </p>
            )}
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">2. Quy tắc & tham số (hiện hành)</h2>
          {config ? (
            <div className="grid grid-cols-1 gap-2 text-xs text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div><b>Phí tranh cử:</b> {fmtMoney(config.campaignFeeMinor)}</div>
                <div><b>Quyên góp tối thiểu:</b> {fmtMoney(config.minDonationMinor)}</div>
                <div><b>Quy đổi điểm (phiếu):</b> {config.voteScoreRule}</div>
                <div><b>Quy đổi điểm (quyên góp):</b> {config.donationScoreRule}</div>
                <div><b>Người thắng:</b> {config.winnerRule}</div>
                <div><b>Thời lượng mặc định:</b> {config.defaultDurationDays} ngày</div>
              </div>
              <p className="text-[11px] text-slate-500">
                Các tham số điểm/phí hiện được áp dụng theo logic hệ thống (domain). Trang này cho phép quản trị vòng bầu cử (tạo/chốt/theo dõi).
              </p>
            </div>
          ) : (
            <div className="text-sm text-slate-600">{isLoading ? 'Đang tải...' : 'Không có dữ liệu cấu hình.'}</div>
          )}
        </div>
      </div>

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
              {current.winnerCandidateId && <span className="text-amber-700">Winner ID: {current.winnerCandidateId}</span>}
            </div>
            {current.status === 'open' && (
              <button
                type="button"
                onClick={() => endElection(current.id)}
                disabled={busy === `end-${current.id}`}
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
              >
                {busy === `end-${current.id}` ? 'Đang chốt...' : 'Chốt kết quả bầu cử'}
              </button>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200">
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

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">4. Lịch sử bầu cử</h2>
        {elections.length === 0 ? (
          <div className="text-sm text-slate-500">Chưa có lịch sử.</div>
        ) : (
          <div className="space-y-2">
            {elections.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-600">{e.id}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${e.status === 'open' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-700'}`}>
                      {e.status === 'open' ? 'Đang mở' : 'Đã kết thúc'}
                    </span>
                    <span>Phiếu: <b>{e.totalVotes}</b></span>
                    <span>Ứng viên: <b>{e.candidates.length}</b></span>
                  </div>
                  <div className="text-slate-600">{fmtDate(e.startsAt)} → {fmtDate(e.endsAt)}</div>
                </div>
                {e.status === 'open' && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => endElection(e.id)}
                      disabled={busy === `end-${e.id}`}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                    >
                      Chốt kết quả
                    </button>
                  </div>
                )}
                {e.candidates.length > 0 && (
                  <div className="mt-2 text-[11px] text-slate-600">
                    Ứng viên: {e.candidates.map((c) => `${c.name} (${c.score}đ${c.id === e.winnerCandidateId ? ', thắng' : ''})`).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
