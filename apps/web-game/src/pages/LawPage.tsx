import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { CCCDLookupInput } from '../shared/identity/CCCDLookupInput';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import {
  type LawOverviewExtDto,
  type SocialOverviewDto,
  type TaxOverviewExtDto,
  type CrimeType,
} from '@efls/contracts';

function useSocialOverview() {
  return useQuery<SocialOverviewDto>({
    queryKey: ['social', 'overview'],
    queryFn: () => apiRequest<SocialOverviewDto>('/api/v1/social/overview'),
  });
}

function useLawOverview() {
  return useQuery<LawOverviewExtDto>({
    queryKey: ['law', 'overview'],
    queryFn: () => apiRequest<LawOverviewExtDto>('/api/v1/law/overview'),
  });
}

function useTaxOverview() {
  return useQuery<TaxOverviewExtDto>({
    queryKey: ['tax', 'overview'],
    queryFn: () => apiRequest<TaxOverviewExtDto>('/api/v1/tax/overview'),
  });
}

const CRIME_LABEL: Record<CrimeType, string> = {
  tax_evasion: 'Trốn thuế',
  money_laundering: 'Rửa tiền',
  fraud: 'Lừa đảo',
  forgery: 'Giả mạo',
  blackmail: 'Tống tiền',
  heist: 'Cướp tài sản',
  sabotage: 'Phá hoại',
  assault: 'Hành hung',
  operating_without_license: 'Kinh doanh không giấy phép',
};

export function LawPage() {
  const { data: law, isLoading: lawLoading, refetch: refetchLaw } = useLawOverview();
  const { data: social, refetch: refetchSocial } = useSocialOverview();
  const { data: tax, refetch: refetchTax } = useTaxOverview();
  const { data: me } = useQuery<{ id: string }>({ queryKey: ['characters', 'me'], queryFn: () => apiRequest('/api/v1/characters/me') });
  const myCharId = me?.id;

  const [activeTab, setActiveTab] = useState<'court' | 'family' | 'tax'>('court');
  const [trialBusy, setTrialBusy] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Modals & forms
  const [evidenceOpen, setEvidenceOpen] = useState<string | null>(null);
  const [evidenceStrength, setEvidenceStrength] = useState('20');
  const [evidenceDesc, setEvidenceDesc] = useState('');
  const [marryOpen, setMarryOpen] = useState(false);
  const [spouseCccd, setSpouseCccd] = useState('');
  const [prenup, setPrenup] = useState(false);
  const [willOpen, setWillOpen] = useState(false);
  const [trustEnabled, setTrustEnabled] = useState(false);
  const [willHeirs, setWillHeirs] = useState<Array<{ beneficiaryCccd: string; sharePct: string; relationship: string; note: string }>>([]);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1000000');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTargetCccd, setReportTargetCccd] = useState('');
  const [reportReason, setReportReason] = useState('');

  const WILL_RELATIONSHIPS = ['Con ruột', 'Con riêng', 'Con nuôi', 'Vợ/Chồng', 'Cha/Mẹ', 'Anh/Chị/Em', 'Cháu', 'Người chơi khác', 'Người khác'];

  function openWillModal() {
    const heirs = (social?.will?.heirs ?? []).map((h: any) => ({
      beneficiaryCccd: h.beneficiaryCccd ?? '',
      sharePct: String(h.sharePct ?? ''),
      relationship: h.relationship || 'Người thừa kế',
      note: h.note ?? '',
    }));
    setWillHeirs(heirs.length > 0 ? heirs : [{ beneficiaryCccd: '', sharePct: '100', relationship: 'Con ruột', note: '' }]);
    setTrustEnabled(Boolean(social?.will?.trustFundEnabled));
    setWillOpen(true);
  }

  function updateWillHeir(idx: number, patch: Partial<{ beneficiaryCccd: string; sharePct: string; relationship: string; note: string }>) {
    setWillHeirs((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  }

  function addWillHeir() {
    setWillHeirs((prev) => [...prev, { beneficiaryCccd: '', sharePct: '0', relationship: 'Con riêng', note: '' }]);
  }

  function removeWillHeir(idx: number) {
    setWillHeirs((prev) => prev.filter((_, i) => i !== idx));
  }

  const willTotalShare = willHeirs.reduce((s, h) => s + (Number(h.sharePct) || 0), 0);

  async function handleAction(key: string, fn: () => Promise<unknown>, onDone?: () => void) {
    setActionBusy(key);
    try {
      await fn();
      onDone?.();
      void refetchLaw();
      void refetchSocial();
      void refetchTax();
    } catch {
      // lỗi đã xử lý bởi httpClient
    } finally {
      setActionBusy(null);
    }
  }

  async function handleTrial(caseId: string) {
    setTrialBusy(caseId);
    try {
      await apiRequest(`/api/v1/law/cases/${caseId}/trial`, { method: 'POST' });
      void refetchLaw();
      void refetchTax();
    } catch {
      // noop
    } finally {
      setTrialBusy(null);
    }
  }

  if (lawLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Pháp lý & Tòa án" description="Đang tải hồ sơ pháp lý..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  const courtCases = law?.courtCases ?? [];
  const records = law?.criminalRecords ?? [];
  const blackmails = law?.blackmailContracts ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pháp lý, Gia đình & Thuế"
        description="Tòa án với AI Thẩm phán, hôn nhân, di chúc và kiểm toán thuế. AI chỉ đề xuất; core kiểm tra bằng chứng và luật."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Vụ án"
          value={courtCases.length}
          hint="Vụ án liên quan đến bạn"
          tone="positive"
        />
        <StatCard label="Án tích" value={records.length} hint="Bản án có tội đã lưu" />
        <StatCard label="Heat Level" value={law?.heatLevel ?? 0} hint="Mức độ rủi ro công an" />
        <StatCard
          label="Nợ thuế"
          value={formatMoney(tax?.totalDue?.amount ?? 0)}
          hint="Tổng thuế chưa nộp"
        />
      </div>

      <div className="flex gap-2">
        {(
          [
            { key: 'court', label: 'Tòa án & Bằng chứng' },
            { key: 'family', label: 'Hôn nhân & Di chúc' },
            { key: 'tax', label: 'Thuế & Giấy phép' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === tab.key
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'court' && (
        <div className="grid gap-4">
          <Panel title="Vụ án của bạn" borderColor="rose">
            <div className="space-y-3">
              {courtCases.length > 0 ? (
                courtCases.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {CRIME_LABEL[c.crimeType as CrimeType] ?? c.crimeType ?? 'Vụ án'}
                        </span>
                        <Badge
                          variant={
                            c.status === 'closed'
                              ? c.verdict === 'guilty'
                                ? 'error'
                                : 'success'
                              : 'warning'
                          }
                        >
                          {c.status === 'closed'
                            ? c.verdict === 'guilty'
                              ? 'Có tội'
                              : 'Vô tội'
                            : 'Đang xét xử'}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Bằng chứng: {c.evidenceStrength}/100 · Phạt:{' '}
                        {formatMoney(c.fine?.amount ?? 0)} · Tù {c.prisonDays} ngày
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.status !== 'closed' && (
                        <>
                          <GameButton
                            variant="outline"
                            size="sm"
                            onClick={() => setEvidenceOpen(c.id)}
                          >
                            Nộp bằng chứng
                          </GameButton>
                          <GameButton
                            variant="primary"
                            size="sm"
                            onClick={() => void handleTrial(c.id)}
                            disabled={trialBusy === c.id}
                          >
                            {trialBusy === c.id ? 'Đang xét xử…' : 'Yêu cầu xét xử'}
                          </GameButton>
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có vụ án nào. Sạch!
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Án tích hình sự">
            <div className="space-y-2">
              {records.length > 0 ? (
                records.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50 text-sm"
                  >
                    <span className="font-medium">
                      {CRIME_LABEL[r.crimeType as CrimeType] ?? r.crimeType ?? 'Tội danh'}
                    </span>
                    <span className="text-xs text-slate-500">
                      Phạt {formatMoney(r.fine?.amount ?? 0)} · {r.prisonDays} ngày
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">Chưa có án tích.</div>
              )}
            </div>
          </Panel>

          <Panel title="Hợp đồng tống tiền (blackmail)">
            <div className="space-y-2">
              {blackmails.length > 0 ? (
                blackmails.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50 text-sm"
                  >
                    <span className="font-medium">{b.status ?? '—'}</span>
                    <span className="text-xs text-slate-500">
                      {formatMoney(b.monthlyPayment?.amount ?? 0)}/th
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  Không có hợp đồng tống tiền nào.
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'family' && (
        <div className="grid gap-4">
          <Panel title="Hôn nhân (cần đồng thuận 2 bên)" borderColor="amber">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Tình trạng hôn nhân</span>
                <span className="font-semibold">
                  {social?.maritalStatus ?? 'single'}
                  {social?.spouse?.characterName ? ` · Vợ/chồng: ${social.spouse.characterName}` : ''}
                </span>
              </div>

              {(social?.marriageProposals ?? []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lời cầu hôn đang chờ</div>
                  {(social?.marriageProposals ?? []).map((p) => {
                    const incoming = myCharId != null && p.targetCharacterId === myCharId;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">{p.proposerName} → {p.targetName}</div>
                          <div className="text-xs text-slate-500">{p.prenupEnabled ? 'Có prenup' : 'Không prenup'} · {incoming ? 'Bạn được cầu hôn' : 'Đang chờ đối phương đồng ý'}</div>
                        </div>
                        {incoming ? (
                          <div className="flex gap-2 shrink-0">
                            <GameButton variant="primary" size="sm" disabled={actionBusy === `mp-accept-${p.id}`} onClick={() => void handleAction(`mp-accept-${p.id}`, () => apiRequest('/api/v1/social/marriage/respond', { method: 'POST', body: JSON.stringify({ proposalId: p.id, accept: true }) }))}>Đồng ý</GameButton>
                            <GameButton variant="outline" size="sm" disabled={actionBusy === `mp-reject-${p.id}`} onClick={() => void handleAction(`mp-reject-${p.id}`, () => apiRequest('/api/v1/social/marriage/respond', { method: 'POST', body: JSON.stringify({ proposalId: p.id, accept: false }) }))}>Từ chối</GameButton>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700">Chờ phản hồi</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(social?.marriages ?? []).map((m) => (
                <div key={m.id} className="space-y-2 p-3 rounded-xl border border-slate-200 bg-white/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{m.characterName ?? '—'} ❤ {m.spouseName ?? '—'}</div>
                      <div className="text-xs text-slate-500">{m.prenupEnabled ? 'Prenup (không tự chia tài sản khi ly hôn)' : 'Không prenup (chia 50/50 tiền mặt + bất động sản khi ly hôn)'} · {m.status ?? '—'}</div>
                    </div>
                    {m.status === 'active' && !(social?.divorceProposals ?? []).some((d) => d.marriageId === m.id) && (
                      <GameButton variant="danger" size="sm" disabled={actionBusy === `divorce-${m.id}`} onClick={() => void handleAction(`divorce-${m.id}`, () => apiRequest('/api/v1/social/marriage/divorce/propose', { method: 'POST', body: JSON.stringify({ marriageId: m.id }) }))}>
                        Gửi yêu cầu ly hôn
                      </GameButton>
                    )}
                  </div>
                  {(social?.divorceProposals ?? []).filter((d) => d.marriageId === m.id).map((d) => {
                    const incoming = myCharId != null && d.otherCharacterId === myCharId;
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-rose-200 bg-rose-50/60">
                        <div className="min-w-0 text-xs">
                          <div className="font-semibold text-slate-800">Yêu cầu ly hôn: {d.requesterName} → {d.otherName}</div>
                          <div className="text-slate-500">{incoming ? 'Bạn cần xác nhận đồng ý ly hôn' : 'Đang chờ đối phương đồng ý ly hôn'}</div>
                        </div>
                        {incoming ? (
                          <div className="flex gap-2 shrink-0">
                            <GameButton variant="danger" size="sm" disabled={actionBusy === `dp-accept-${d.id}`} onClick={() => void handleAction(`dp-accept-${d.id}`, () => apiRequest('/api/v1/social/marriage/divorce/respond', { method: 'POST', body: JSON.stringify({ proposalId: d.id, accept: true }) }))}>Đồng ý ly hôn</GameButton>
                            <GameButton variant="outline" size="sm" disabled={actionBusy === `dp-reject-${d.id}`} onClick={() => void handleAction(`dp-reject-${d.id}`, () => apiRequest('/api/v1/social/marriage/divorce/respond', { method: 'POST', body: JSON.stringify({ proposalId: d.id, accept: false }) }))}>Từ chối</GameButton>
                          </div>
                        ) : (
                          <span className="text-xs text-rose-700">Chờ phản hồi</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {social?.maritalStatus !== 'married' && (
                <GameButton variant="primary" onClick={() => setMarryOpen(true)}>
                  Gửi lời cầu hôn
                </GameButton>
              )}
            </div>
          </Panel>

          <Panel title="Cây gia tộc">
            <div className="space-y-2">
              {(social?.family ?? []).length > 0 ? (
                (social?.family ?? []).map((f) => (
                  <div
                    key={f.characterId}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50 text-sm"
                  >
                    <span className="font-medium">{f.characterName ?? '—'}</span>
                    <span className="text-xs text-slate-500">
                      {f.relationship ?? '—'} · Thế hệ {f.generationLevel}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có thông tin gia tộc.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Di chúc & Quỹ tín thác (Trust Fund)">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Người thừa kế & tỉ lệ tài sản</div>
                {(social?.will?.heirs?.length ?? 0) > 0 ? (
                  <div className="space-y-1.5">
                    {(social?.will?.heirs ?? []).map((h: any, i: number) => (
                      <div key={h.beneficiaryCccd || h.characterId || i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{h.beneficiaryName || h.characterName || h.beneficiaryCccd || h.characterId}</div>
                          <div className="text-xs text-slate-500">{h.relationship}{h.note ? ` · ${h.note}` : ''} {h.beneficiaryCccd ? <>· CCCD: <span className="font-mono">{h.beneficiaryCccd}</span></> : null}</div>
                        </div>
                        <div className="shrink-0 font-semibold text-emerald-700">{h.sharePct}%</div>
                      </div>
                    ))}
                    <div className="text-xs text-slate-500">Tổng phân chia: <b>{(social?.will?.heirs ?? []).reduce((s, h) => s + Number(h.sharePct || 0), 0).toFixed(2)}%</b> (có thể để lại phần còn lại theo quy định/mặc định). Có thể chỉ định người chơi khác, gồm cả con riêng.</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Chưa lập di chúc hoặc chưa có người thừa kế. Bạn có thể chọn nhiều người thừa kế (kể cả người chơi khác, con riêng), đặt tỉ lệ % tài sản cho từng người.</div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Tổng quỹ tín thác</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatMoney(social?.trustFundTotal?.amount ?? 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <GameButton variant="outline" onClick={openWillModal}>
                  {social?.will?.id ? 'Chỉnh sửa di chúc' : 'Lập di chúc'}
                </GameButton>
                <GameButton variant="primary" onClick={() => setDepositOpen(true)}>
                  Nạp quỹ tín thác
                </GameButton>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'tax' && (
        <div className="grid gap-4">
          <Panel title="Thuế cá nhân & Kiểm toán" borderColor="emerald">
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-slate-700">
                Thuế cá nhân được <b>tự động quyết toán 1 lần/năm</b> dựa trên <b>tổng thu nhập năm từ các công việc đang giữ</b> (lương các việc làm hiện tại, quy ước 12 tháng/năm, thuế suất 10%). <b>Không gộp</b> thuế/kê khai doanh nghiệp. Nếu đủ số dư hệ thống sẽ tự trừ; nếu không đủ sẽ ghi nợ để nộp.
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <StatCard label="Năm hiện tại" value={tax?.currentYear ?? 0} hint="Quyết toán theo năm" />
                <StatCard label="Rủi ro audit" value={tax?.auditRisk ?? 0} hint="Trên 60 bị phạt" />
                <StatCard
                  label="Tổng nợ thuế"
                  value={formatMoney(tax?.totalDue?.amount ?? 0)}
                  hint="Chưa nộp"
                />
              </div>
              <div className="flex gap-2">
                <GameButton
                  variant="primary"
                  disabled={actionBusy === 'assess'}
                  onClick={() =>
                    void handleAction('assess', () =>
                      apiRequest('/api/v1/tax/assess', {
                        method: 'POST',
                        body: JSON.stringify({
                          taxYear: tax?.currentYear ?? new Date().getFullYear(),
                        }),
                      }),
                    )
                  }
                >
                  Quyết toán thuế năm nay
                </GameButton>
                <GameButton
                  variant="outline"
                  disabled={actionBusy === 'audit'}
                  onClick={() =>
                    void handleAction('audit', () =>
                      apiRequest('/api/v1/tax/audit/start', {
                        method: 'POST',
                        body: JSON.stringify({
                          taxYear: tax?.currentYear ?? new Date().getFullYear(),
                        }),
                      }),
                    )
                  }
                >
                  Mở kiểm toán
                </GameButton>
                <GameButton variant="outline" onClick={() => setReportOpen(true)}>
                  Tố giác
                </GameButton>
              </div>

              {(tax?.assessments ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div>
                    <div className="font-semibold text-slate-800">Thuế năm {a.taxYear ?? '—'}</div>
                    <div className="text-xs text-slate-500">
                      Thu nhập {formatMoney(a.taxableIncome?.amount ?? 0)} · Nợ{' '}
                      {formatMoney(a.taxDue?.amount ?? 0)} · {a.status ?? '—'}
                    </div>
                  </div>
                  {a.status === 'due' && (
                    <GameButton
                      variant="primary"
                      size="sm"
                      disabled={actionBusy === `pay-${a.id}`}
                      onClick={() =>
                        void handleAction(`pay-${a.id}`, () =>
                          apiRequest('/api/v1/tax/pay', {
                            method: 'POST',
                            body: JSON.stringify({ assessmentId: a.id }),
                          }),
                        )
                      }
                    >
                      Nộp thuế
                    </GameButton>
                  )}
                </div>
              ))}
              {(tax?.assessments ?? []).length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có khoản thuế nào.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Giấy phép kinh doanh (của tôi)" borderColor="emerald">
            <div className="space-y-3">
              <p className="text-xs text-slate-600">Chủ doanh nghiệp tự cấp/xin cấp giấy phép cho công ty mình (lệ phí {formatMoney(5000000)} trừ từ ví cá nhân). Công ty cần có giấy phép hoạt động để vận hành hợp lệ.</p>
              {(tax?.ownedCompanyLicenses ?? []).length > 0 ? (
                (tax?.ownedCompanyLicenses ?? []).map((c) => (
                  <div key={c.companyId} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{c.companyName}</div>
                      <div className="text-xs text-slate-500">
                        {c.hasActiveLicense ? `Đang hoạt động · ${c.licenseType ?? 'Giấy phép'}${c.issuedAt ? ` · cấp ${new Date(c.issuedAt).toLocaleDateString('vi-VN')}` : ''}` : 'Chưa có giấy phép hoạt động'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.hasActiveLicense && c.licenseId ? (
                        <GameButton
                          variant="danger"
                          size="sm"
                          disabled={actionBusy === `revoke-${c.licenseId}`}
                          onClick={() =>
                            void handleAction(`revoke-${c.licenseId}`, () =>
                              apiRequest('/api/v1/tax/licenses/revoke', {
                                method: 'POST',
                                body: JSON.stringify({ licenseId: c.licenseId }),
                              }),
                            )
                          }
                        >
                          Hủy giấy phép
                        </GameButton>
                      ) : (
                        <GameButton
                          variant="primary"
                          size="sm"
                          disabled={actionBusy === `issue-${c.companyId}`}
                          onClick={() =>
                            void handleAction(`issue-${c.companyId}`, () =>
                              apiRequest('/api/v1/tax/licenses/issue', {
                                method: 'POST',
                                body: JSON.stringify({ companyId: c.companyId }),
                              }),
                            )
                          }
                        >
                          Cấp giấy phép
                        </GameButton>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">Bạn chưa sở hữu công ty nào.</div>
              )}
            </div>
          </Panel>

          <Panel title="Công ty chưa có giấy phép (phát hiện & tố cáo)" borderColor="amber">
            <div className="space-y-3">
              <p className="text-xs text-slate-600">Danh sách công ty đang hoạt động nhưng chưa có giấy phép. Người chơi có thể tố cáo: hệ thống sẽ mở vụ án "Kinh doanh không giấy phép" đối với chủ công ty, tăng heat và xử phạt từ quỹ công ty (nếu có).</p>
              {(tax?.unlicensedCompanies ?? []).length > 0 ? (
                (tax?.unlicensedCompanies ?? []).map((c) => (
                  <div key={c.companyId} className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{c.companyName}</div>
                      <div className="text-xs text-slate-500">Chủ: {c.ownerName} · Chưa có giấy phép hoạt động</div>
                    </div>
                    <GameButton
                      variant="outline"
                      size="sm"
                      disabled={actionBusy === `report-co-${c.companyId}`}
                      onClick={() =>
                        void handleAction(`report-co-${c.companyId}`, () =>
                          apiRequest('/api/v1/tax/licenses/report-unlicensed', {
                            method: 'POST',
                            body: JSON.stringify({ companyId: c.companyId, reason: `Kinh doanh không có giấy phép (${c.companyName})` }),
                          }),
                        )
                      }
                    >
                      Tố cáo
                    </GameButton>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">Không phát hiện công ty thiếu giấy phép.</div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Modal: nộp bằng chứng */}
      <Modal
        open={evidenceOpen != null}
        onClose={() => setEvidenceOpen(null)}
        title="Nộp bằng chứng"
      >
        <div className="space-y-3">
          <GameInput
            label="Độ mạnh bằng chứng (1-100)"
            value={evidenceStrength}
            onChange={(e) => setEvidenceStrength(e.target.value)}
            type="number"
            placeholder="20"
          />
          <GameInput
            label="Mô tả"
            value={evidenceDesc}
            onChange={(e) => setEvidenceDesc(e.target.value)}
            placeholder="Mô tả bằng chứng..."
          />
          <GameButton
            variant="primary"
            disabled={actionBusy === 'evidence'}
            onClick={() =>
              evidenceOpen &&
              void handleAction(
                'evidence',
                () =>
                  apiRequest('/api/v1/law/evidence', {
                    method: 'POST',
                    body: JSON.stringify({
                      caseId: evidenceOpen,
                      strength: Number(evidenceStrength) || 0,
                      description: evidenceDesc,
                    }),
                  }),
                () => {
                  setEvidenceOpen(null);
                  setEvidenceDesc('');
                },
              )
            }
          >
            Nộp
          </GameButton>
        </div>
      </Modal>

      {/* Modal: cầu hôn */}
      <Modal open={marryOpen} onClose={() => setMarryOpen(false)} title="Gửi lời cầu hôn">
        <div className="space-y-3">
          <p className="text-xs text-slate-600">Kết hôn cần <b>sự đồng ý của cả hai bên</b>. Gửi lời cầu hôn và chờ đối phương chấp nhận.</p>
          <CCCDLookupInput
            label="CCCD người được cầu hôn"
            value={spouseCccd}
            onChange={setSpouseCccd}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prenup} onChange={(e) => setPrenup(e.target.checked)} />
            <span>Có prenup (khi ly hôn sẽ không tự động phân chia tài sản)</span>
          </label>
          <GameButton
            variant="primary"
            disabled={actionBusy === 'marry' || spouseCccd.replace(/\s+/g,'').length !== 12}
            onClick={() =>
              void handleAction(
                'marry',
                () =>
                  apiRequest('/api/v1/social/marriage/propose', {
                    method: 'POST',
                    body: JSON.stringify({ spouseCccd: spouseCccd.replace(/\s+/g,''), prenupEnabled: prenup }),
                  }),
                () => { setMarryOpen(false); setSpouseCccd(''); setPrenup(false); },
              )
            }
          >
            Gửi lời cầu hôn
          </GameButton>
        </div>
      </Modal>

      {/* Modal: di chúc */}
      <Modal open={willOpen} onClose={() => setWillOpen(false)} title="Di chúc & phân chia thừa kế">
        <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
          <p className="text-xs text-slate-600">Phân chia tỉ lệ tài sản cho từng người thừa kế (có thể chọn <b>người chơi khác</b> bằng Character ID). Hỗ trợ nhiều tình huống (vd. <b>con riêng</b>, con ruột, vợ/chồng…). Tổng tỉ lệ không vượt quá 100%.</p>
          <div className="space-y-2">
            {willHeirs.map((h, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Người thừa kế #{idx + 1}</span>
                  {willHeirs.length > 1 && (
                    <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => removeWillHeir(idx)}>Xóa</button>
                  )}
                </div>
                <CCCDLookupInput label="CCCD người thụ hưởng" value={h.beneficiaryCccd} onChange={(v) => updateWillHeir(idx, { beneficiaryCccd: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <GameInput label="Tỉ lệ tài sản (%)" type="number" min={0} max={100} step={0.01} value={h.sharePct} onChange={(e) => updateWillHeir(idx, { sharePct: e.target.value })} />
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-slate-500">Quan hệ</label>
                    <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={h.relationship} onChange={(e) => updateWillHeir(idx, { relationship: e.target.value })}>
                      {WILL_RELATIONSHIPS.map((r) => (<option key={r} value={r}>{r}</option>))}
                    </select>
                  </div>
                </div>
                <GameInput label="Ghi chú (tùy chọn, vd. con riêng bên vợ/chồng)" value={h.note} onChange={(e) => updateWillHeir(idx, { note: e.target.value })} placeholder="Ghi chú..." />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" className="text-xs font-semibold text-emerald-700 hover:underline" onClick={addWillHeir}>+ Thêm người thừa kế</button>
            <span className={`text-xs font-semibold ${willTotalShare > 100.001 ? 'text-rose-600' : 'text-slate-700'}`}>Tổng: {willTotalShare.toFixed(2)}%</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={trustEnabled} onChange={(e) => setTrustEnabled(e.target.checked)} />
            <span>Bật quỹ tín thác (trust fund)</span>
          </label>
          <GameButton
            variant="primary"
            disabled={actionBusy === 'will'}
            onClick={() =>
              void handleAction(
                'will',
                () =>
                  apiRequest('/api/v1/social/will', {
                    method: 'POST',
                    body: JSON.stringify({
                      heirs: willHeirs
                        .filter((h) => h.beneficiaryCccd.replace(/\s+/g,'') !== '')
                        .map((h) => ({
                          beneficiaryCccd: h.beneficiaryCccd.replace(/\s+/g,''),
                          sharePct: Number(h.sharePct) || 0,
                          relationship: h.relationship || 'Người thừa kế',
                          note: h.note?.trim() ? h.note.trim() : null,
                        })),
                      trustFundEnabled: trustEnabled,
                    }),
                  }),
                () => setWillOpen(false),
              )
            }
          >
            Lưu di chúc
          </GameButton>
        </div>
      </Modal>

      {/* Modal: nạp trust fund */}
      <Modal open={depositOpen} onClose={() => setDepositOpen(false)} title="Nạp quỹ tín thác">
        <div className="space-y-3">
          <GameInput
            label="Số tiền (VNĐ)"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            type="number"
            placeholder="1000000"
          />
          <GameButton
            variant="primary"
            disabled={actionBusy === 'deposit'}
            onClick={() =>
              void handleAction(
                'deposit',
                () =>
                  apiRequest('/api/v1/social/trust-fund/deposit', {
                    method: 'POST',
                    body: JSON.stringify({
                      amount: { amount: Number(depositAmount) || 0, currency: 'VND' },
                    }),
                  }),
                () => setDepositOpen(false),
              )
            }
          >
            Nạp quỹ
          </GameButton>
        </div>
      </Modal>

      {/* Modal: tố giác */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Tố giác">
        <div className="space-y-3">
          <CCCDLookupInput
            label="CCCD người bị tố giác"
            value={reportTargetCccd}
            onChange={setReportTargetCccd}
          />
          <GameInput
            label="Lý do"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Lý do tố giác..."
          />
          <GameButton
            variant="primary"
            disabled={actionBusy === 'report'}
            onClick={() =>
              void handleAction(
                'report',
                () =>
                  apiRequest('/api/v1/tax/report', {
                    method: 'POST',
                    body: JSON.stringify({ targetCccd: reportTargetCccd.replace(/\s+/g,''), reason: reportReason }),
                  }),
                () => setReportOpen(false),
              )
            }
          >
            Gửi tố giác
          </GameButton>
        </div>
      </Modal>
    </div>
  );
}
