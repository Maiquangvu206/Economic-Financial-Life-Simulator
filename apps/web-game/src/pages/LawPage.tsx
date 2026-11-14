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

  const [activeTab, setActiveTab] = useState<'court' | 'family' | 'tax'>('court');
  const [trialBusy, setTrialBusy] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Modals & forms
  const [evidenceOpen, setEvidenceOpen] = useState<string | null>(null);
  const [evidenceStrength, setEvidenceStrength] = useState('20');
  const [evidenceDesc, setEvidenceDesc] = useState('');
  const [marryOpen, setMarryOpen] = useState(false);
  const [spouseId, setSpouseId] = useState('');
  const [prenup, setPrenup] = useState(false);
  const [willOpen, setWillOpen] = useState(false);
  const [heirId, setHeirId] = useState('');
  const [trustEnabled, setTrustEnabled] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1000000');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState('');
  const [reportReason, setReportReason] = useState('');

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
          <Panel title="Hôn nhân" borderColor="amber">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Tình trạng hôn nhân</span>
                <span className="font-semibold">
                  {social?.maritalStatus ?? 'single'}
                  {social?.spouse?.characterName
                    ? ` · Vợ/chồng: ${social.spouse.characterName}`
                    : ''}
                </span>
              </div>
              {(social?.marriages ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {m.characterName ?? '—'} ❤ {m.spouseName ?? '—'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.prenupEnabled
                        ? 'Prenup (chia tài sản có giới hạn)'
                        : 'Hôn nhân chung tài sản'}{' '}
                      · {m.status ?? '—'}
                    </div>
                  </div>
                  {m.status === 'active' && (
                    <GameButton
                      variant="danger"
                      size="sm"
                      disabled={actionBusy === `divorce-${m.id}`}
                      onClick={() =>
                        void handleAction(`divorce-${m.id}`, () =>
                          apiRequest('/api/v1/social/marriage/divorce', {
                            method: 'POST',
                            body: JSON.stringify({ marriageId: m.id }),
                          }),
                        )
                      }
                    >
                      Ly hôn
                    </GameButton>
                  )}
                </div>
              ))}
              {social?.maritalStatus !== 'married' && (
                <GameButton variant="primary" onClick={() => setMarryOpen(true)}>
                  Kết hôn
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Người thừa kế chính</span>
                <span className="font-semibold">{social?.will?.primaryHeirName ?? 'Chưa lập'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Tổng quỹ tín thác</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatMoney(social?.trustFundTotal?.amount ?? 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <GameButton variant="outline" onClick={() => setWillOpen(true)}>
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

      {/* Modal: kết hôn */}
      <Modal open={marryOpen} onClose={() => setMarryOpen(false)} title="Kết hôn">
        <div className="space-y-3">
          <GameInput
            label="Character ID của vợ/chồng"
            value={spouseId}
            onChange={(e) => setSpouseId(e.target.value)}
            placeholder="UUID nhân vật..."
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prenup} onChange={(e) => setPrenup(e.target.checked)} />
            <span>Hợp đồng prenup (chia tài sản có giới hạn)</span>
          </label>
          <GameButton
            variant="primary"
            disabled={actionBusy === 'marry'}
            onClick={() =>
              void handleAction(
                'marry',
                () =>
                  apiRequest('/api/v1/social/marriage/marry', {
                    method: 'POST',
                    body: JSON.stringify({ spouseCharacterId: spouseId, prenupEnabled: prenup }),
                  }),
                () => setMarryOpen(false),
              )
            }
          >
            Kết hôn
          </GameButton>
        </div>
      </Modal>

      {/* Modal: di chúc */}
      <Modal open={willOpen} onClose={() => setWillOpen(false)} title="Di chúc">
        <div className="space-y-3">
          <GameInput
            label="Người thừa kế chính (Character ID, trống nếu bỏ qua)"
            value={heirId}
            onChange={(e) => setHeirId(e.target.value)}
            placeholder="UUID..."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trustEnabled}
              onChange={(e) => setTrustEnabled(e.target.checked)}
            />
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
                      primaryHeirId: heirId.trim() === '' ? null : heirId,
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
          <GameInput
            label="Character ID người bị tố giác"
            value={reportTarget}
            onChange={(e) => setReportTarget(e.target.value)}
            placeholder="UUID..."
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
                    body: JSON.stringify({ targetCharacterId: reportTarget, reason: reportReason }),
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
