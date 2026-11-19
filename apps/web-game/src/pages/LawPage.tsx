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
  type FamilyOverviewDto,
  type CareTier,
} from '@efls/contracts';

function useSocialOverview() {
  return useQuery<SocialOverviewDto>({
    queryKey: ['social', 'overview'],
    queryFn: () => apiRequest<SocialOverviewDto>('/api/v1/social/overview'),
  });
}

function useFamilyOverview() {
  return useQuery<FamilyOverviewDto>({
    queryKey: ['family', 'overview'],
    queryFn: () => apiRequest<FamilyOverviewDto>('/api/v1/family/overview'),
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
  const { data: family, refetch: refetchFamily } = useFamilyOverview();
  const { data: tax, refetch: refetchTax } = useTaxOverview();
  const { data: me } = useQuery<{ id: string }>({ queryKey: ['characters', 'me'], queryFn: () => apiRequest('/api/v1/characters/me') });
  const myCharId = me?.id;

  const [activeTab, setActiveTab] = useState<'court' | 'family' | 'tax'>('court');
  const [familySection, setFamilySection] = useState<'marriage' | 'planning' | 'children' | 'legacy'>('marriage');
  const [trialBusy, setTrialBusy] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectedAdoptChildId, setSelectedAdoptChildId] = useState<string>('');
  const [divorceCustodyOpen, setDivorceCustodyOpen] = useState<{ marriageId: string; spouseCharacterId: string | null } | null>(null);
  const [divorceCustodyMode, setDivorceCustodyMode] = useState<'agree_me' | 'agree_spouse' | 'system'>('system');

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
      void refetchFamily();
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
      <PageHeader title="Pháp lý, Gia đình & Thuế" />

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
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === tab.key
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
            <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2.5">
              {courtCases.length > 0 ? (
                courtCases.map((c) => {
                  const strength = Number(c.evidenceStrength ?? 0);
                  const pct = Math.max(0, Math.min(100, strength));
                  const isDefendant = !!myCharId && c.defendantId === myCharId;
                  const roleLabel = isDefendant ? 'Bạn là bị cáo' : 'Bạn liên quan vụ án';
                  const canRequestTrial = c.status !== 'closed' && isDefendant;
                  return (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white/50 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
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
                                  ? 'Kết luận: Có tội'
                                  : 'Kết luận: Vô tội'
                                : 'Chờ xét xử'}
                            </Badge>
                            <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 border border-slate-200">{roleLabel}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            Mức phạt nếu có tội (ước tính): <b>{formatMoney(c.fine?.amount ?? 0)}</b> · Tù: <b>{c.prisonDays} ngày</b>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {c.status !== 'closed' && (
                            <>
                              <GameButton
                                variant="outline"
                                size="sm"
                                onClick={() => setEvidenceOpen(c.id)}
                              >
                                Nộp bằng chứng
                              </GameButton>
                              {canRequestTrial ? (
                                <GameButton
                                  variant="primary"
                                  size="sm"
                                  onClick={() => void handleTrial(c.id)}
                                  disabled={trialBusy === c.id}
                                >
                                  {trialBusy === c.id ? 'Đang xét xử…' : 'Yêu cầu xét xử'}
                                </GameButton>
                              ) : (
                                <span className="text-[10px] text-slate-500 text-right max-w-[140px]">
                                  {isDefendant ? '' : 'Chỉ bị cáo mới được yêu cầu xét xử'}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                          <span>Độ mạnh bằng chứng (cộng dồn): <b>{strength}/100</b></span>
                          <span>Ngưỡng có tội: <b>60/100</b> {strength >= 60 ? '· Đủ điều kiện kết luận có tội' : `· Còn thiếu ${Math.max(0, 60 - strength)} điểm`}</span>
                        </div>
                        <div className="relative h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div className={`h-full rounded-full ${strength >= 60 ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                          <div className="absolute top-0 bottom-0 w-0.5 bg-slate-700/70" style={{ left: '60%' }} title="Ngưỡng 60" />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có vụ án nào liên quan đến bạn.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Án tích hình sự">
            <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2.5">
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

          <Panel title="Hợp đồng tống tiền">
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
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'marriage', label: 'Hôn nhân' },
              { key: 'planning', label: 'Sinh con & Nhận nuôi' },
              { key: 'children', label: 'Con cái & Chăm sóc' },
              { key: 'legacy', label: 'Gia tộc & Di chúc' },
            ] as const).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setFamilySection(s.key)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition ${familySection === s.key
                  ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {familySection === 'marriage' && (
          <Panel title="Hôn nhân" borderColor="amber">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Tình trạng hôn nhân</span>
                <span className="font-semibold">
                  {(social?.maritalStatus ?? 'single') === 'married' ? 'Đã kết hôn' : (social?.maritalStatus ?? 'single')}
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
                          <div className="text-xs text-slate-500">{p.prenupEnabled ? 'Có thỏa thuận tiền hôn nhân' : 'Không thỏa thuận tiền hôn nhân'} · {incoming ? 'Bạn được cầu hôn' : 'Đang chờ đối phương đồng ý'}</div>
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

              <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2.5">
                {(social?.marriages ?? []).map((m) => (
                  <div key={m.id} className="space-y-2 p-3 rounded-xl border border-slate-200 bg-white/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{m.characterName ?? '—'} ❤ {m.spouseName ?? '—'}</div>
                        <div className="text-xs text-slate-500">{m.prenupEnabled ? 'Có thỏa thuận tiền hôn nhân' : 'Không thỏa thuận tiền hôn nhân (chia 50/50 tiền mặt + bất động sản khi ly hôn)'} · {(m.status ?? '') === 'active' ? 'Đang hôn nhân' : (m.status ?? '') === 'divorced' ? 'Đã ly hôn' : (m.status ?? '—')}</div>
                      </div>
                      {m.status === 'active' && !(social?.divorceProposals ?? []).some((d) => d.marriageId === m.id) && (
                        <GameButton
                          variant="danger"
                          size="sm"
                          disabled={actionBusy === `divorce-${m.id}`}
                          onClick={() => {
                            const spouseCharacterId = m.characterId === myCharId ? m.spouseId : m.characterId;
                            setDivorceCustodyMode('system');
                            setDivorceCustodyOpen({ marriageId: m.id, spouseCharacterId: spouseCharacterId ?? null });
                          }}
                        >
                          Gửi yêu cầu ly hôn
                        </GameButton>
                      )}
                    </div>
                    {(social?.divorceProposals ?? []).filter((d) => d.marriageId === m.id).map((d) => {
                      const incoming = myCharId != null && d.otherCharacterId === myCharId;
                      const ct: any = (d as any).custodyTerms;
                      const custodyText = ct?.mode === 'agree'
                        ? `Quyền nuôi con (thỏa thuận): ${ct.custodialParentId === myCharId ? 'Bạn' : (ct.custodialParentId === d.requesterCharacterId ? d.requesterName : ct.custodialParentId === d.otherCharacterId ? d.otherName : 'Đối phương')} trực tiếp nuôi`
                        : ct?.mode === 'system'
                          ? 'Quyền nuôi con: để hệ thống phán quyết (bên có điều kiện nhà ở/tài chính tốt hơn nuôi, bên còn lại cấp dưỡng 20% thu nhập/tháng)'
                          : null;
                      return (
                        <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-rose-200 bg-rose-50/60">
                          <div className="min-w-0 text-xs">
                            <div className="font-semibold text-slate-800">Yêu cầu ly hôn: {d.requesterName} → {d.otherName}</div>
                            <div className="text-slate-500">{incoming ? 'Bạn cần xác nhận đồng ý ly hôn' : 'Đang chờ đối phương đồng ý ly hôn'}</div>
                            {custodyText ? <div className="mt-1 text-slate-700">{custodyText}</div> : null}
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
              </div>

              {social?.maritalStatus !== 'married' && (
                <GameButton variant="primary" onClick={() => setMarryOpen(true)}>
                  Gửi lời cầu hôn
                </GameButton>
              )}
            </div>
          </Panel>

          )}

          {familySection === 'planning' && (
          <Panel title="Sinh con & Nhận nuôi" borderColor="emerald">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white/60 p-3 space-y-2">
                  <div className="text-sm font-semibold text-slate-800">Sinh con</div>
                  <div className="text-xs text-slate-600">
                    Điều kiện: đã kết hôn (active), cả hai ≥ 20 tuổi game, sức khỏe ≥ 80, có nhà ở hợp lệ, không sinh con trong 1 năm game gần nhất. Thai kỳ 10 tháng game.
                  </div>
                  {family?.birthBlockedReason ? <div className="text-xs text-amber-700">{family.birthBlockedReason}</div> : null}
                  <GameButton
                    variant="primary"
                    size="sm"
                    disabled={!family?.canProposeBirth || actionBusy === 'birth-propose'}
                    onClick={() => void handleAction('birth-propose', () => apiRequest('/api/v1/family/birth/propose', { method: 'POST', body: JSON.stringify({}) }))}
                  >
                    Đăng ký sinh con (gửi đề xuất)
                  </GameButton>
                  {(family?.birthProposals ?? []).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đề xuất sinh con</div>
                      {(family?.birthProposals ?? []).map((p) => {
                        const incoming = myCharId != null && p.partnerCharacterId === myCharId;
                        return (
                          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800">{p.proposerName} → {p.partnerName}</div>
                              <div className="text-slate-500">{incoming ? 'Bạn cần xác nhận đồng thuận' : 'Đang chờ vợ/chồng xác nhận'}</div>
                            </div>
                            {incoming ? (
                              <div className="flex gap-1.5 shrink-0">
                                <GameButton variant="primary" size="sm" disabled={actionBusy === `bp-a-${p.id}`} onClick={() => void handleAction(`bp-a-${p.id}`, () => apiRequest('/api/v1/family/birth/respond', { method: 'POST', body: JSON.stringify({ proposalId: p.id, accept: true }) }))}>Đồng ý</GameButton>
                                <GameButton variant="outline" size="sm" disabled={actionBusy === `bp-r-${p.id}`} onClick={() => void handleAction(`bp-r-${p.id}`, () => apiRequest('/api/v1/family/birth/respond', { method: 'POST', body: JSON.stringify({ proposalId: p.id, accept: false }) }))}>Từ chối</GameButton>
                              </div>
                            ) : <span className="text-emerald-700">Chờ phản hồi</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(family?.pregnancies ?? []).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Thai kỳ</div>
                      {(family?.pregnancies ?? []).map((pr) => (
                        <div key={pr.id} className="rounded-lg border border-pink-200 bg-pink-50/50 p-2 text-xs">
                          <div className="font-semibold text-slate-800">{pr.motherName} & {pr.fatherName}</div>
                          <div className="text-slate-600">Trạng thái: {pr.status === 'active' ? 'Đang mang thai' : pr.status} · Dự sinh: ngày {pr.dueGameDay + 1}/năm {pr.dueGameYear}</div>
                          {pr.healthWarningDays > 0 ? <div className="text-rose-700">Cảnh báo sức khỏe thai kỳ: {pr.healthWarningDays} ngày (người mang thai sức khỏe &lt; 30)</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white/60 p-3 space-y-2">
                  <div className="text-sm font-semibold text-slate-800">Nhận con nuôi</div>
                  <div className="text-xs text-slate-600">
                    Điều kiện: ≥ 20 tuổi, có nhà ở hợp lệ. Nếu đã kết hôn cần vợ/chồng đồng thuận. Xét duyệt 30 ngày game.
                  </div>
                  {family?.adoptionBlockedReason ? <div className="text-xs text-amber-700">{family.adoptionBlockedReason}</div> : null}
                  <div className="flex flex-col gap-2">
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      value={selectedAdoptChildId}
                      onChange={(e) => setSelectedAdoptChildId(e.target.value)}
                    >
                      <option value="">Chọn trẻ NPC do hệ thống cung cấp</option>
                      {(family?.adoptableChildren ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.fullName} · {c.age} tuổi</option>
                      ))}
                    </select>
                    <GameButton
                      variant="primary"
                      size="sm"
                      disabled={!family?.canApplyAdoption || !selectedAdoptChildId || actionBusy === 'adopt-apply'}
                      onClick={() => void handleAction('adopt-apply', () => apiRequest('/api/v1/family/adoption/apply', { method: 'POST', body: JSON.stringify({ childId: selectedAdoptChildId }) }), () => setSelectedAdoptChildId(''))}
                    >
                      Đăng ký nhận con nuôi
                    </GameButton>
                  </div>
                  {(family?.adoptionApplications ?? []).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hồ sơ nhận nuôi</div>
                      {(family?.adoptionApplications ?? []).map((a) => {
                        const needSpouseApprove = a.status === 'pending_spouse_approval' && myCharId != null && a.spouseCharacterId === myCharId;
                        const statusText = a.status === 'pending_spouse_approval' ? 'Chờ vợ/chồng đồng thuận' : a.status === 'pending_review' ? `Chờ xét duyệt (hoàn tất ngày ${a.reviewCompleteGameDay + 1}/năm ${a.reviewCompleteGameYear})` : a.status === 'completed' ? 'Đã hoàn tất' : a.status;
                        return (
                          <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800">{a.childName}</div>
                              <div className="text-slate-600">{a.applicantName}{a.spouseName ? ` & ${a.spouseName}` : ''} · {statusText}</div>
                            </div>
                            {needSpouseApprove ? (
                              <div className="flex gap-1.5 shrink-0">
                                <GameButton variant="primary" size="sm" disabled={actionBusy === `ad-a-${a.id}`} onClick={() => void handleAction(`ad-a-${a.id}`, () => apiRequest('/api/v1/family/adoption/respond', { method: 'POST', body: JSON.stringify({ applicationId: a.id, accept: true }) }))}>Đồng thuận</GameButton>
                                <GameButton variant="outline" size="sm" disabled={actionBusy === `ad-r-${a.id}`} onClick={() => void handleAction(`ad-r-${a.id}`, () => apiRequest('/api/v1/family/adoption/respond', { method: 'POST', body: JSON.stringify({ applicationId: a.id, accept: false }) }))}>Từ chối</GameButton>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </Panel>
          )}

          {familySection === 'children' && (
          <Panel title="Con cái & Chăm sóc" borderColor="emerald">
            <div className="space-y-2">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-800">Danh sách con cái</div>
                {(family?.children ?? []).length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500">Chưa có con cái.</div>
                ) : (
                  (family?.children ?? []).map((c) => {
                    const wb = c.wellbeing ?? 0;
                    const tierLabel = c.careTier === 'economy' ? 'Tiết kiệm (50.000đ/ngày)' : c.careTier === 'premium' ? 'Cao cấp (400.000đ/ngày)' : c.careTier === 'standard' ? 'Tiêu chuẩn (150.000đ/ngày)' : '—';
                    return (
                      <div key={c.id} className="rounded-xl border border-slate-200 bg-white/70 p-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-800">{c.fullName} <span className="text-xs font-normal text-slate-500">({c.age} tuổi{c.isAdopted ? ', con nuôi' : ', con ruột'})</span></div>
                            <div className="text-xs text-slate-600">
                              Trạng thái: {c.dependentStatus === 'adult' ? 'Trưởng thành (tự lập)' : c.dependentStatus === 'lost_custody' ? 'Mất quyền nuôi' : c.isDependent ? 'Đang nuôi dưỡng' : c.dependentStatus}
                              {c.custodialParentName ? ` · Người nuôi trực tiếp: ${c.custodialParentName}` : ''}
                              {c.childSupportPercent > 0 && c.childSupportPayerName ? ` · Cấp dưỡng: ${c.childSupportPayerName} (${c.childSupportPercent}% thu nhập/tháng)` : ''}
                            </div>
                          </div>
                          <Badge variant={c.dependentStatus === 'lost_custody' ? 'error' : c.age >= 18 ? 'default' : 'success'}>
                            {tierLabel}
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Sức khỏe / Hạnh phúc (wellbeing)</span>
                            <span className="font-semibold">{wb}/100</span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${wb <= 20 ? 'bg-rose-500' : wb <= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, wb))}%` }}
                            />
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Nợ chăm sóc: {formatMoney(c.careDebt?.amount ?? 0)} · Ngày thiếu tiền liên tiếp: {c.unpaidCareDays}/3
                          </div>
                        </div>

                        {(c.canChangeCareTier || c.canInteract || c.canStudy || c.canMedicalCheckup) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {c.canChangeCareTier && (
                              <select
                                className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs"
                                value={c.careTier ?? 'standard'}
                                disabled={actionBusy === `care-tier-${c.id}`}
                                onChange={(e) => void handleAction(`care-tier-${c.id}`, () => apiRequest('/api/v1/family/children/care-tier', { method: 'POST', body: JSON.stringify({ childId: c.id, careTier: e.target.value as CareTier }) }))}
                              >
                                <option value="economy">Tiết kiệm (50.000đ/ngày)</option>
                                <option value="standard">Tiêu chuẩn (150.000đ/ngày)</option>
                                <option value="premium">Cao cấp (400.000đ/ngày)</option>
                              </select>
                            )}
                            {c.canInteract && (
                              <GameButton variant="outline" size="sm" disabled={actionBusy === `care-i-${c.id}`} onClick={() => void handleAction(`care-i-${c.id}`, () => apiRequest('/api/v1/family/children/care', { method: 'POST', body: JSON.stringify({ childId: c.id, action: 'interact' }) }))}>Tương tác</GameButton>
                            )}
                            {c.canStudy && (
                              <GameButton variant="outline" size="sm" disabled={actionBusy === `care-s-${c.id}`} onClick={() => void handleAction(`care-s-${c.id}`, () => apiRequest('/api/v1/family/children/care', { method: 'POST', body: JSON.stringify({ childId: c.id, action: 'study' }) }))}>Cho đi học</GameButton>
                            )}
                            {c.canMedicalCheckup && (
                              <GameButton variant="outline" size="sm" disabled={actionBusy === `care-m-${c.id}`} onClick={() => void handleAction(`care-m-${c.id}`, () => apiRequest('/api/v1/family/children/care', { method: 'POST', body: JSON.stringify({ childId: c.id, action: 'medical_checkup' }) }))}>Khám bệnh</GameButton>
                            )}
                            {c.canInteract && (
                              <GameButton variant="primary" size="sm" disabled={actionBusy === `care-e-${c.id}`} onClick={() => void handleAction(`care-e-${c.id}`, () => apiRequest('/api/v1/family/children/care', { method: 'POST', body: JSON.stringify({ childId: c.id, action: 'extra_support', amount: { amount: 100000, currency: 'VND' } }) }))}>Chu cấp thêm (100.000đ)</GameButton>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Panel>
          )}

          {familySection === 'legacy' && (
            <>
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
            </>
          )}
        </div>
      )}

      {activeTab === 'tax' && (
        <div className="grid gap-4">
          <Panel title="Thuế cá nhân & Kiểm toán" borderColor="emerald">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <StatCard label="Năm hiện tại" value={tax?.currentYear ?? 0} />
                <StatCard label="Rủi ro audit" value={tax?.auditRisk ?? 0} />
                <StatCard
                  label="Tổng nợ thuế"
                  value={formatMoney(tax?.totalDue?.amount ?? 0)}
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
                          taxYear: tax?.currentYear ?? 2000,
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
                          taxYear: tax?.currentYear ?? 2000,
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

              <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2.5">
                {(tax?.assessments ?? []).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">Thuế năm {a.taxYear ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        Thu nhập {formatMoney(a.taxableIncome?.amount ?? 0)} · Nợ{' '}
                        {formatMoney(a.taxDue?.amount ?? 0)} · {a.status === 'paid' ? 'Đã nộp' : a.status === 'due' || String(a.status) === 'unpaid' ? 'Chưa nộp' : (a.status ?? '—')}
                      </div>
                    </div>
                    {(a.status === 'due' || String(a.status) === 'unpaid') && (
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
            </div>
          </Panel>

          <Panel title="Giấy phép kinh doanh (của tôi)" borderColor="emerald">
            <div className="space-y-3">
              {(tax?.ownedCompanyLicenses ?? []).length > 0 ? (
                <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2.5">
                  {(tax?.ownedCompanyLicenses ?? []).map((c) => (
                    <div key={c.companyId} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800">{c.companyName}</div>
                        <div className="text-xs text-slate-500">
                          {c.hasActiveLicense ? `Đang hoạt động · ${c.licenseType ?? 'Giấy phép kinh doanh'}` : 'Chưa có giấy phép hoạt động'}
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
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">Bạn chưa sở hữu công ty nào.</div>
              )}
            </div>
          </Panel>

          <Panel title="Công ty chưa có giấy phép" borderColor="amber">
            <div className="space-y-3">
              {(tax?.unlicensedCompanies ?? []).length > 0 ? (
                <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2.5">
                  {(tax?.unlicensedCompanies ?? []).map((c) => (
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
                  ))}
                </div>
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
        title="Nộp bằng chứng cho vụ án"
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700 leading-relaxed">
            <p><b>Độ mạnh (1-100):</b> mức độ thuyết phục của bằng chứng lần này. Điểm sẽ được <b>cộng dồn</b> vào tổng bằng chứng của vụ án (tối đa 100). Khi tổng đạt <b>≥ 60</b>, bị cáo yêu cầu xét xử có thể bị kết luận <b>có tội</b>.</p>
          </div>
          <GameInput
            label="Độ mạnh bằng chứng (1-100)"
            value={evidenceStrength}
            onChange={(e) => setEvidenceStrength(e.target.value)}
            type="number"
            min={1}
            max={100}
            placeholder="Ví dụ: 20"
          />
          <GameInput
            label="Mô tả bằng chứng (nên ghi rõ)"
            value={evidenceDesc}
            onChange={(e) => setEvidenceDesc(e.target.value)}
            placeholder="Ví dụ: Biên lai giao dịch, ảnh chụp, lời khai..."
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
                      strength: Math.max(1, Math.min(100, Number(evidenceStrength) || 0)),
                      description: evidenceDesc,
                    }),
                  }),
                () => {
                  setEvidenceOpen(null);
                  setEvidenceDesc('');
                  setEvidenceStrength('20');
                },
              )
            }
          >
            Nộp bằng chứng
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
            disabled={actionBusy === 'marry' || spouseCccd.replace(/\s+/g, '').length !== 12}
            onClick={() =>
              void handleAction(
                'marry',
                () =>
                  apiRequest('/api/v1/social/marriage/propose', {
                    method: 'POST',
                    body: JSON.stringify({ spouseCccd: spouseCccd.replace(/\s+/g, ''), prenupEnabled: prenup }),
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
                        .filter((h) => h.beneficiaryCccd.replace(/\s+/g, '') !== '')
                        .map((h) => ({
                          beneficiaryCccd: h.beneficiaryCccd.replace(/\s+/g, ''),
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
                    body: JSON.stringify({ targetCccd: reportTargetCccd.replace(/\s+/g, ''), reason: reportReason }),
                  }),
                () => setReportOpen(false),
              )
            }
          >
            Gửi tố giác
          </GameButton>
        </div>
      </Modal>

      {/* Modal: yêu cầu ly hôn & thỏa thuận quyền nuôi con */}
      <Modal open={divorceCustodyOpen != null} onClose={() => setDivorceCustodyOpen(null)} title="Yêu cầu ly hôn & quyền nuôi con">
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Khi ly hôn, hai bên có thể thỏa thuận người nuôi con trực tiếp. Nếu không thỏa thuận, hệ thống phán quyết giao con cho bên có điều kiện nhà ở/tài chính tốt hơn và tự động trích <b>20% thu nhập/tháng</b> của bên còn lại để cấp dưỡng.
          </p>
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">Thỏa thuận quyền nuôi con</label>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={divorceCustodyMode}
              onChange={(e) => setDivorceCustodyMode(e.target.value as any)}
            >
              <option value="system">Không thỏa thuận / Để hệ thống phán quyết</option>
              <option value="agree_me">Thỏa thuận: Tôi trực tiếp nuôi con</option>
              <option value="agree_spouse" disabled={!divorceCustodyOpen?.spouseCharacterId}>Thỏa thuận: Vợ/chồng trực tiếp nuôi con</option>
            </select>
          </div>
          <GameButton
            variant="danger"
            disabled={!divorceCustodyOpen || actionBusy === `divorce-${divorceCustodyOpen?.marriageId}`}
            onClick={() => {
              if (!divorceCustodyOpen) return;
              const custodyTerms =
                divorceCustodyMode === 'agree_me' && myCharId
                  ? { mode: 'agree', custodialParentId: myCharId }
                  : divorceCustodyMode === 'agree_spouse' && divorceCustodyOpen.spouseCharacterId
                    ? { mode: 'agree', custodialParentId: divorceCustodyOpen.spouseCharacterId }
                    : { mode: 'system' };
              void handleAction(
                `divorce-${divorceCustodyOpen.marriageId}`,
                () =>
                  apiRequest('/api/v1/social/marriage/divorce/propose', {
                    method: 'POST',
                    body: JSON.stringify({ marriageId: divorceCustodyOpen.marriageId, custodyTerms }),
                  }),
                () => setDivorceCustodyOpen(null),
              );
            }}
          >
            Gửi yêu cầu ly hôn
          </GameButton>
        </div>
      </Modal>
    </div>
  );
}
