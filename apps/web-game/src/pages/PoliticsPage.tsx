import { useState } from 'react';
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

  async function handleAction(key: string, fn: () => Promise<unknown>, onDone?: () => void) {
    setBusy(key);
    try {
      await fn();
      onDone?.();
      void refetch();
    } catch {
      // lỗi đã xử lý bởi httpClient
    } finally {
      setBusy(null);
    }
  }

  const election = overview?.election ?? null;
  const candidates = overview?.candidates ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Chính trị & Bầu cử" description="Đang tải thông tin bầu cử..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  const totalVotes = candidates.reduce((sum, c) => sum + (c.votes ?? 0), 0);
  const totalDonations = candidates.reduce((sum, c) => sum + (c.donations?.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chính trị & Bầu cử"
        description="Ứng cử Thị trưởng, vận động quyên góp (1tr = +10 điểm) và bỏ phiếu. AI/GM duy trì trật tự vĩ mô."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Trạng thái bầu cử"
          value={election ? (election.status === 'open' ? 'Đang mở' : 'Đã kết thúc') : 'Chưa có'}
          hint={
            election?.endsAt
              ? `Kết thúc ${new Date(election.endsAt).toLocaleDateString('vi-VN')}`
              : '—'
          }
          tone="positive"
        />
        <StatCard label="Ứng viên" value={candidates.length} hint="Đang tranh cử Thị trưởng" />
        <StatCard label="Tổng phiếu" value={totalVotes} hint="Số phiếu đã bỏ" />
        <StatCard
          label="Tổng quyên góp"
          value={formatMoney(totalDonations)}
          hint="Vận động tranh cử"
        />
      </div>

      <div className="grid gap-4">
        <Panel title="Ứng viên Thị trưởng" borderColor="emerald">
          <div className="space-y-3">
            {!election && (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-slate-500">
                  Chưa có cuộc bầu cử nào. Mở cuộc đầu tiên để bắt đầu chính trị thành phố!
                </p>
                <GameButton
                  variant="primary"
                  disabled={busy === 'create'}
                  onClick={() =>
                    void handleAction('create', () =>
                      apiRequest('/api/v1/politics/elections', {
                        method: 'POST',
                        body: JSON.stringify({}),
                      }),
                    )
                  }
                >
                  Mở cuộc bầu cử
                </GameButton>
              </div>
            )}

            {candidates.map((c) => {
              const pct = totalVotes > 0 ? ((c.votes ?? 0) / totalVotes) * 100 : 0;
              return (
                <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-white/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{c.name ?? '—'}</span>
                      {c.isMe && <Badge variant="success">Bạn</Badge>}
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-700">{pct.toFixed(1)}%</div>
                      <div className="text-xs text-slate-500">
                        {c.votes ?? 0} phiếu · Điểm {c.score ?? 0}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Quyên góp {formatMoney(c.donations?.amount ?? 0)}
                  </div>
                  {election?.status === 'open' && (
                    <div className="mt-2 flex gap-2">
                      {!election.youVoted && (
                        <GameButton
                          variant="primary"
                          size="sm"
                          disabled={busy === `vote-${c.id}`}
                          onClick={() =>
                            void handleAction(`vote-${c.id}`, () =>
                              apiRequest('/api/v1/politics/vote', {
                                method: 'POST',
                                body: JSON.stringify({
                                  electionId: election.id,
                                  candidateId: c.id,
                                }),
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
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa có ứng viên. Hãy ra ứng cử!
              </div>
            )}

            {election?.status === 'open' && (
              <div className="flex flex-wrap gap-2">
                {!election.youCandidateId && (
                  <GameButton variant="primary" onClick={() => setCandidacyOpen(true)}>
                    Ứng cử Thị trưởng (5.000.000 ₫)
                  </GameButton>
                )}
                <GameButton
                  variant="outline"
                  disabled={busy === 'end'}
                  onClick={() =>
                    void handleAction('end', () =>
                      apiRequest(`/api/v1/politics/elections/${election.id}/end`, {
                        method: 'POST',
                      }),
                    )
                  }
                >
                  Chốt kết quả (admin)
                </GameButton>
              </div>
            )}

            {election?.status === 'ended' && election.winnerCandidateId && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm">
                <span className="font-semibold text-emerald-800">
                  Thị trưởng mới:{' '}
                  {candidates.find((c) => c.id === election.winnerCandidateId)?.name ?? '—'}
                </span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Modal: ứng cử */}
      <Modal open={candidacyOpen} onClose={() => setCandidacyOpen(false)} title="Ứng cử Thị trưởng">
        <div className="space-y-3">
          <GameInput
            label="Tên tranh cử"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Tên của bạn trên phiếu bầu..."
          />
          <p className="text-[11px] text-slate-500">
            Phí tranh cử 5.000.000 ₫ chuyển thẳng vào ngân sách thành phố.
          </p>
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

      {/* Modal: quyên góp */}
      <Modal
        open={donateOpen != null}
        onClose={() => setDonateOpen(null)}
        title="Quyên góp vận động"
      >
        <div className="space-y-3">
          <GameInput
            label="Số tiền ủng hộ (VNĐ)"
            value={donateAmount}
            onChange={(e) => setDonateAmount(e.target.value)}
            type="number"
            placeholder="1000000"
          />
          <p className="text-[11px] text-slate-500">
            Mỗi 1.000.000 ₫ quyên góp = +10 điểm cho ứng viên (tối thiểu 1tr).
          </p>
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
