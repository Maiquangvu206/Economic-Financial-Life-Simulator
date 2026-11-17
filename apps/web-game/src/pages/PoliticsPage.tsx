import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type PoliticsOverviewDto } from '@efls/contracts';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('vi-VN');
}

function termLabel(status?: string | null) {
  switch (status) {
    case 'active': return 'Đang tại nhiệm';
    case 'revoked': return 'Bị thu hồi tư cách';
    case 'expired': return 'Hết nhiệm kỳ';
    case 'none':
    default: return 'Không có nhiệm kỳ';
  }
}

export function PoliticsPage() {
  const {
    data: overview,
    isLoading,
    refetch,
  } = useQuery<PoliticsOverviewDto>({
    queryKey: ['politics', 'overview'],
    queryFn: () => apiRequest<PoliticsOverviewDto>('/api/v1/politics/overview'),
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [candidacyOpen, setCandidacyOpen] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [donateOpen, setDonateOpen] = useState<string | null>(null);
  const [donateAmount, setDonateAmount] = useState('1000000');
  const [policyMsg, setPolicyMsg] = useState<string | null>(null);
  const [otRate, setOtRate] = useState<string>('');
  const [welfarePerCitizen, setWelfarePerCitizen] = useState<string>('');
  const [welfareMax, setWelfareMax] = useState<string>('');
  const [supportTickers, setSupportTickers] = useState<string>('');
  const [supportAll, setSupportAll] = useState(false);
  const [supportAmountPerCompany, setSupportAmountPerCompany] = useState<string>('');
  const [supportReason, setSupportReason] = useState<string>('Hỗ trợ doanh nghiệp theo chỉ định của Thị trưởng');

  async function handleAction(key: string, fn: () => Promise<unknown>, onDone?: () => void) {
    setBusy(key);
    setPolicyMsg(null);
    try {
      await fn();
      onDone?.();
      void refetch();
    } catch (e: any) {
      const msg = e?.problem?.detail || e?.message || 'Thao tác thất bại.';
      setPolicyMsg(msg);
    } finally {
      setBusy(null);
    }
  }

  const election = overview?.election ?? null;
  const candidates = overview?.candidates ?? [];
  const mayor = overview?.mayor ?? null;
  const isMayor = !!mayor?.active && !!mayor?.isYou;

  const totalVotes = candidates.reduce((sum, c) => sum + (c.votes ?? 0), 0);
  const totalDonations = candidates.reduce((sum, c) => sum + (c.donations?.amount ?? 0), 0);

  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.votes ?? 0) - (a.votes ?? 0));
  }, [candidates]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Chính trị & Bầu cử" description="Đang tải thông tin bầu cử..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Chính trị & Bầu cử" />

      {/* Mayor status (Pha A/C) */}
      <Panel title="Thị trưởng đương nhiệm" borderColor={mayor?.active ? 'emerald' : 'default'}>
        {mayor?.active ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Đương nhiệm</Badge>
              <span className="text-sm font-semibold text-slate-900">{mayor.characterName ?? '—'}</span>
              {mayor.isYou && <Badge variant="default">Bạn</Badge>}
              <span className="text-xs text-slate-600">({termLabel(mayor.termStatus)})</span>
            </div>
            <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-slate-500">Bắt đầu nhiệm kỳ</div>
                <div className="font-medium">{fmtDate(mayor.termStartedAt)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-slate-500">Kết thúc nhiệm kỳ</div>
                <div className="font-medium">{fmtDate(mayor.termEndsAt)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-slate-500">Phụ cấp (Pha A)</div>
                <div className="font-medium">
                  {formatMoney(mayor.config.salaryMinor)} / {mayor.config.salaryIntervalGameDays} ngày game
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-slate-500">Đặc quyền/giới hạn</div>
                <div className="font-medium">Theo cấu hình hệ thống</div>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 leading-relaxed">
              Quyền hạn và lợi ích được hệ thống kiểm soát tự động. Lạm dụng chức vụ sẽ bị thu hồi tư cách ngay lập tức.
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-slate-600">
            <div>Hiện chưa có Thị trưởng đương nhiệm.</div>
            {mayor?.config?.enabled === false && (
              <div className="text-xs text-amber-700">Hệ thống Thị trưởng đang tạm tắt bởi quản trị.</div>
            )}
          </div>
        )}
      </Panel>

      {/* Mayor actions (Pha B) */}
      {isMayor && mayor && (
        <Panel title="Hành động & Chính sách của Thị trưởng" borderColor="amber">
          <div className="space-y-4 text-sm">

            {policyMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{policyMsg}</div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="font-semibold text-slate-900">Điều chỉnh mức OT (%)</div>
                <GameInput
                  label="Mức OT mới (%)"
                  type="number"
                  value={otRate}
                  onChange={(e) => setOtRate(e.target.value)}
                  placeholder={`${mayor.config.otRateAdjustMinPct}`}
                />
                <GameButton
                  variant="primary"
                  disabled={busy === 'policy-ot'}
                  onClick={() =>
                    void handleAction(
                      'policy-ot',
                      () => apiRequest('/api/v1/politics/mayor/actions', {
                        method: 'POST',
                        body: JSON.stringify({ type: 'adjust_ot_rate', otRatePercent: Number(otRate) || 0, reason: 'Điều chỉnh bởi Thị trưởng' }),
                      }),
                      () => setPolicyMsg('Đã gửi yêu cầu điều chỉnh OT.'),
                    )
                  }
                >
                  {busy === 'policy-ot' ? 'Đang thực hiện…' : 'Áp dụng điều chỉnh OT'}
                </GameButton>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="font-semibold text-slate-900">Gói hỗ trợ phúc lợi</div>
                <GameInput
                  label="Số tiền mỗi công dân (VNĐ)"
                  type="number"
                  value={welfarePerCitizen}
                  onChange={(e) => setWelfarePerCitizen(e.target.value)}
                  placeholder={String(mayor.config.welfareBonusPerCitizenMinor || 50000)}
                />
                <GameInput
                  label="Số công dân tối đa"
                  type="number"
                  value={welfareMax}
                  onChange={(e) => setWelfareMax(e.target.value)}
                  placeholder={String(mayor.config.welfareBonusMaxCitizens || 50)}
                />
                <GameButton
                  variant="primary"
                  disabled={busy === 'policy-welfare'}
                  onClick={() =>
                    void handleAction(
                      'policy-welfare',
                      () => apiRequest('/api/v1/politics/mayor/actions', {
                        method: 'POST',
                        body: JSON.stringify({
                          type: 'treasury_welfare_bonus',
                          amountPerCitizen: welfarePerCitizen ? Number(welfarePerCitizen) : undefined,
                          maxCitizens: welfareMax ? Number(welfareMax) : undefined,
                          reason: 'Gói hỗ trợ phúc lợi do Thị trưởng ban hành',
                        }),
                      }),
                      () => setPolicyMsg('Đã ban hành gói hỗ trợ phúc lợi.'),
                    )
                  }
                >
                  {busy === 'policy-welfare' ? 'Đang thực hiện…' : 'Ban hành gói hỗ trợ'}
                </GameButton>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 lg:col-span-2">
                <div className="font-semibold text-slate-900">Hỗ trợ doanh nghiệp chỉ định</div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={supportAll}
                    onChange={(e) => setSupportAll(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-amber-500"
                  />
                  Hỗ trợ toàn bộ công ty đang hoạt động/IPO
                </label>
                {!supportAll && (
                  <GameInput
                    label="Mã chứng khoán (phân tách bằng dấu phẩy)"
                    value={supportTickers}
                    onChange={(e) => setSupportTickers(e.target.value.toUpperCase())}
                    placeholder="VCB, FPT, ..."
                  />
                )}
                <GameInput
                  label="Số tiền mỗi công ty (VNĐ)"
                  type="number"
                  value={supportAmountPerCompany}
                  onChange={(e) => setSupportAmountPerCompany(e.target.value)}
                  placeholder="VD: 50000000"
                />
                <GameInput
                  label="Lý do"
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                  placeholder="Lý do hỗ trợ doanh nghiệp"
                />
                <GameButton
                  variant="primary"
                  disabled={busy === 'policy-support-companies'}
                  onClick={() => {
                    const amount = Math.trunc(Number(supportAmountPerCompany));
                    if (!Number.isFinite(amount) || amount <= 0) {
                      setPolicyMsg('Nhập số tiền hỗ trợ mỗi công ty (> 0).');
                      return;
                    }
                    const tickers = supportTickers
                      .split(/[,\s;]+/)
                      .map((t) => t.trim().toUpperCase())
                      .filter(Boolean);
                    if (!supportAll && tickers.length === 0) {
                      setPolicyMsg('Nhập ít nhất một Mã chứng khoán hoặc chọn hỗ trợ toàn bộ.');
                      return;
                    }
                    void handleAction(
                      'policy-support-companies',
                      () => apiRequest('/api/v1/politics/mayor/actions', {
                        method: 'POST',
                        body: JSON.stringify({
                          type: 'support_companies',
                          supportAllCompanies: supportAll,
                          tickers: supportAll ? undefined : tickers,
                          amountPerCompanyMinor: amount,
                          reason: supportReason.trim() || 'Hỗ trợ doanh nghiệp theo chỉ định của Thị trưởng',
                        }),
                      }),
                      () => setPolicyMsg(`Đã gửi yêu cầu hỗ trợ ${supportAll ? 'toàn bộ doanh nghiệp' : tickers.join(', ')}.`),
                    );
                  }}
                >
                  {busy === 'policy-support-companies' ? 'Đang thực hiện…' : 'Hỗ trợ doanh nghiệp từ quỹ'}
                </GameButton>
              </div>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Trạng thái bầu cử"
          value={election ? (election.status === 'open' ? 'Đang mở' : 'Đã kết thúc') : 'Chưa có'}
          hint={election?.endsAt ? `Kết thúc ${fmtDate(election.endsAt)}` : '—'}
          tone="positive"
        />
        <StatCard label="Ứng viên" value={candidates.length} hint="Tranh cử Thị trưởng" />
        <StatCard label="Tổng phiếu" value={totalVotes} hint="Số phiếu đã bỏ" />
        <StatCard label="Tổng quyên góp" value={formatMoney(totalDonations)} hint="Vận động tranh cử" />
      </div>

      <div className="grid gap-4">
        <Panel title="Ứng viên Thị trưởng" borderColor="emerald">
          <div className="space-y-3">
            {!election && (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-slate-500">Chưa có cuộc bầu cử nào.</p>
              </div>
            )}

            {sortedCandidates.map((c) => {
              const pct = totalVotes > 0 ? ((c.votes ?? 0) / totalVotes) * 100 : 0;
              const isWinner = election?.winnerCandidateId === c.id;
              return (
                <div key={c.id} className={`p-4 rounded-xl border ${isWinner ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white/50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{c.name ?? '—'}</span>
                      {c.isMe && <Badge variant="success">Bạn</Badge>}
                      {isWinner && <Badge variant="warning">Thắng cử</Badge>}
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-700">{pct.toFixed(1)}%</div>
                      <div className="text-xs text-slate-500">{c.votes ?? 0} phiếu · Điểm {c.score ?? 0}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Quyên góp {formatMoney(c.donations?.amount ?? 0)}</div>
                  {election?.status === 'open' && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {!election.youVoted && (
                        <GameButton
                          variant="primary"
                          size="sm"
                          disabled={busy === `vote-${c.id}`}
                          onClick={() =>
                            void handleAction(`vote-${c.id}`, () =>
                              apiRequest('/api/v1/politics/vote', {
                                method: 'POST',
                                body: JSON.stringify({ electionId: election.id, candidateId: c.id }),
                              }),
                            )
                          }
                        >
                          {busy === `vote-${c.id}` ? 'Đang bỏ phiếu…' : 'Bỏ phiếu'}
                        </GameButton>
                      )}
                      <GameButton variant="outline" size="sm" onClick={() => setDonateOpen(c.id)}>
                        Quyên góp
                      </GameButton>
                    </div>
                  )}
                </div>
              );
            })}

            {election?.status === 'open' && candidates.length === 0 && (
              <div className="text-center py-4 text-xs text-slate-500">Chưa có ứng viên. Hãy ra ứng cử!</div>
            )}

            {election?.status === 'open' && !election.youCandidateId && (
              <div className="flex flex-wrap gap-2">
                <GameButton variant="primary" onClick={() => setCandidacyOpen(true)}>
                  Ứng cử Thị trưởng (5.000.000 ₫)
                </GameButton>
              </div>
            )}

            {election?.status === 'ended' && (
              <div className={`rounded-xl border p-4 text-sm space-y-1 ${election.winnerCandidateId ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="font-semibold text-slate-900">
                  Kết quả: {election.winnerCandidateId
                    ? `Thị trưởng mới ${candidates.find((c) => c.id === election.winnerCandidateId)?.name ?? election.winnerCharacterName ?? '—'}`
                    : 'Không có người thắng (hòa điểm hoặc không có ứng viên)'}
                </div>
                {election.termStatus && election.termStatus !== 'none' && (
                  <div className="text-xs text-slate-700">
                    Nhiệm kỳ: <b>{termLabel(election.termStatus)}</b>
                    {election.termEndsAt ? ` · đến ${fmtDate(election.termEndsAt)}` : ''}
                    {election.termStatus === 'revoked' && election.revokedReason ? ` · Lý do thu hồi: ${election.revokedReason}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Modal open={candidacyOpen} onClose={() => setCandidacyOpen(false)} title="Ứng cử Thị trưởng">
        <div className="space-y-3">
          <GameInput
            label="Tên tranh cử"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Tên của bạn trên phiếu bầu..."
          />
          <p className="text-[11px] text-slate-500">Phí tranh cử 5.000.000 ₫ chuyển thẳng vào ngân sách thành phố.</p>
          <GameButton
            variant="primary"
            disabled={busy === 'candidacy'}
            onClick={() =>
              election &&
              void handleAction(
                'candidacy',
                () =>
                  apiRequest('/api/v1/politics/candidacy', {
                    method: 'POST',
                    body: JSON.stringify({ electionId: election.id, name: candidateName }),
                  }),
                () => setCandidacyOpen(false),
              )
            }
          >
            Nộp đơn ứng cử
          </GameButton>
        </div>
      </Modal>

      <Modal open={donateOpen != null} onClose={() => setDonateOpen(null)} title="Quyên góp vận động">
        <div className="space-y-3">
          <GameInput
            label="Số tiền ủng hộ (VNĐ)"
            value={donateAmount}
            onChange={(e) => setDonateAmount(e.target.value)}
            type="number"
            placeholder="1000000"
          />
          <p className="text-[11px] text-slate-500">Mỗi 1.000.000 ₫ quyên góp = +10 điểm cho ứng viên (tối thiểu 1tr).</p>
          <GameButton
            variant="primary"
            disabled={busy === 'donate'}
            onClick={() =>
              donateOpen &&
              void handleAction(
                'donate',
                () =>
                  apiRequest('/api/v1/politics/donate', {
                    method: 'POST',
                    body: JSON.stringify({
                      candidateId: donateOpen,
                      amount: { amount: Number(donateAmount) || 0, currency: 'VND' },
                    }),
                  }),
                () => setDonateOpen(null),
              )
            }
          >
            Quyên góp
          </GameButton>
        </div>
      </Modal>
    </div>
  );
}
