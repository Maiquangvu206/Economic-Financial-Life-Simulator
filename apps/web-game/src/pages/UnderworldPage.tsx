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
  type UnderworldOverviewExtDto,
  type CrimeType,
  type NpcNegotiationDto,
} from '@efls/contracts';

const HEAT_LABEL = (heat: number) =>
  heat < 20 ? 'Sạch' : heat < 50 ? 'Bị để ý' : heat < 80 ? 'Truy nã' : 'Truy nã toàn quốc';

export function UnderworldPage() {
  const {
    data: overview,
    isLoading,
    refetch,
  } = useQuery<UnderworldOverviewExtDto>({
    queryKey: ['underworld', 'overview'],
    queryFn: () => apiRequest<UnderworldOverviewExtDto>('/api/v1/underworld/overview'),
  });
  const { data: npcHistory, refetch: refetchNpc } = useQuery<NpcNegotiationDto[]>({
    queryKey: ['npc', 'history'],
    queryFn: () => apiRequest<NpcNegotiationDto[]>('/api/v1/npc/history'),
  });

  const [activeTab, setActiveTab] = useState<
    'services' | 'detective' | 'blackmail' | 'protection' | 'npc'
  >('services');
  const [busy, setBusy] = useState<string | null>(null);

  const [collectOpen, setCollectOpen] = useState(false);
  const [collectTarget, setCollectTarget] = useState('');
  const [collectPrice, setCollectPrice] = useState('2000000');
  const [blackmailOpen, setBlackmailOpen] = useState(false);
  const [blackmailTarget, setBlackmailTarget] = useState('');
  const [blackmailMonthly, setBlackmailMonthly] = useState('1000000');
  const [stingOpen, setStingOpen] = useState(false);
  const [stingTarget, setStingTarget] = useState('');
  const [stingAmount, setStingAmount] = useState('5000000');
  const [npcOpen, setNpcOpen] = useState(false);
  const [npcId, setNpcId] = useState('merchant_01');
  const [npcPersonality, setNpcPersonality] = useState<
    'aggressive' | 'cautious' | 'greedy' | 'honest'
  >('greedy');
  const [npcContext, setNpcContext] = useState('Mua cổ phiếu với giá chiết khấu');
  const [npcOfferText, setNpcOfferText] = useState('50 triệu, chốt ngay');
  const [npcFair, setNpcFair] = useState('100000000');
  const [npcOfferMinor, setNpcOfferMinor] = useState('50000000');

  async function handleAction(key: string, fn: () => Promise<unknown>, onDone?: () => void) {
    setBusy(key);
    try {
      await fn();
      onDone?.();
      void refetch();
      void refetchNpc();
    } catch {
      // lỗi đã xử lý bởi httpClient
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Chợ đen & Thám tử" description="Đang kết nối chợ đen..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  const services = overview?.services ?? [];
  const evidences = overview?.evidences ?? [];
  const blackmails = overview?.blackmails ?? [];
  const stings = overview?.stings ?? [];
  const protections = overview?.protections ?? [];
  const sweeps = overview?.sweeps ?? [];
  const heat = overview?.heatLevel ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chợ đen & Thám tử"
        description="Cân bằng kinh tế ngầm: rủi ro càng cao, tiền càng nhiều. Mọi hành vi phi pháp đều tăng Heat và có thể kích hoạt Đại án Công an."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        Cảnh báo: Heat ≥ 80 sẽ kích hoạt <strong>Đại án Công an</strong> (phạt 10% tiền mặt, hạ heat
        xuống 40). Vệ sĩ giúp giảm heat, bảo hiểm đền bù khi bị bắt.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Heat Level" value={heat} hint={HEAT_LABEL(heat)} tone="negative" />
        <StatCard
          label="Thu nhập ngầm (30 ngày)"
          value={formatMoney(overview?.undergroundEarned?.amount ?? 0)}
          hint="Tổng tiền kiếm từ chợ đen"
        />
        <StatCard label="Bằng chứng" value={evidences.length} hint="Đang giữ / đã bán / đã nộp" />
        <StatCard
          label="Giấy tờ giả"
          value={overview?.credentials?.length ?? 0}
          hint="Chứng minh thư giả, giấy phép giả"
        />
      </div>

      <div className="flex gap-2">
        {(
          [
            { key: 'services', label: 'Dịch vụ ngầm' },
            { key: 'detective', label: 'Thám tử & Bằng chứng' },
            { key: 'blackmail', label: 'Tống tiền & Gài bẫy' },
            { key: 'protection', label: 'Bảo vệ & Đại án' },
            { key: 'npc', label: 'NPC Đàm phán' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === tab.key
                ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'services' && (
        <div className="grid gap-4">
          <Panel title="Dịch vụ chợ đen" borderColor="rose">
            <div className="space-y-3">
              {services.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{s.name ?? '—'}</span>
                      <Badge variant="warning">Rủi ro {s.risk ?? 0}%</Badge>
                      <Badge variant="error">Heat +{s.heat ?? 0}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Phần thưởng {formatMoney(s.minPayout?.amount ?? 0)} –{' '}
                      {formatMoney(s.maxPayout?.amount ?? 0)}
                    </div>
                  </div>
                  <GameButton
                    variant="danger"
                    size="sm"
                    disabled={busy === s.code}
                    onClick={() =>
                      void handleAction(s.code, () =>
                        apiRequest('/api/v1/underworld/crime', {
                          method: 'POST',
                          body: JSON.stringify({ crimeType: s.code as CrimeType }),
                        }),
                      )
                    }
                  >
                    {busy === s.code ? 'Đang làm…' : 'Thực hiện'}
                  </GameButton>
                </div>
              ))}
              {services.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Đang tải dịch vụ chợ đen...
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Mua giấy tờ giả">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { kind: 'fake_id', label: 'CMND giả (2.000.000 ₫)' },
                  { kind: 'business_license', label: 'Giấy phép KD giả (8.000.000 ₫)' },
                  { kind: 'shell_company', label: 'Công ty ma (15.000.000 ₫)' },
                ] as const
              ).map((c) => (
                <GameButton
                  key={c.kind}
                  variant="outline"
                  size="sm"
                  disabled={busy === `cred-${c.kind}`}
                  onClick={() =>
                    void handleAction(`cred-${c.kind}`, () =>
                      apiRequest('/api/v1/underworld/credentials/buy', {
                        method: 'POST',
                        body: JSON.stringify({ kind: c.kind }),
                      }),
                    )
                  }
                >
                  {c.label}
                </GameButton>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {(overview?.credentials ?? []).map((cred) => (
                <div
                  key={cred.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50 text-sm"
                >
                  <span className="font-medium">{cred.kind ?? '—'}</span>
                  <span className="text-xs text-slate-500">
                    Chất lượng {cred.quality ?? 0}/100 · {cred.active ? 'Đang dùng' : 'Hết hạn'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'detective' && (
        <Panel title="Thám tử & Bằng chứng">
          <div className="space-y-3">
            <GameButton variant="primary" onClick={() => setCollectOpen(true)}>
              Thuê thám tử thu thập bằng chứng
            </GameButton>
            {evidences.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {e.targetName ?? 'Mục tiêu'}
                    </span>
                    <Badge variant="default">Độ mạnh {e.strength ?? 0}/100</Badge>
                    <Badge
                      variant={
                        e.status === 'held'
                          ? 'warning'
                          : e.status === 'submitted'
                            ? 'success'
                            : e.status === 'sold'
                              ? 'default'
                              : 'error'
                      }
                    >
                      {e.status === 'held'
                        ? 'Đang giữ'
                        : e.status === 'submitted'
                          ? 'Đã nộp tòa'
                          : e.status === 'sold'
                            ? 'Đã bán'
                            : 'Đã dùng'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{e.description ?? ''}</div>
                </div>
                {e.status === 'held' && (
                  <div className="flex gap-2">
                    <GameButton
                      variant="outline"
                      size="sm"
                      disabled={busy === `sell-${e.id}`}
                      onClick={() =>
                        void handleAction(`sell-${e.id}`, () =>
                          apiRequest('/api/v1/underworld/evidence/sell', {
                            method: 'POST',
                            body: JSON.stringify({ evidenceId: e.id }),
                          }),
                        )
                      }
                    >
                      Bán cho chợ đen
                    </GameButton>
                    <GameButton
                      variant="primary"
                      size="sm"
                      disabled={busy === `submit-${e.id}`}
                      onClick={() =>
                        void handleAction(`submit-${e.id}`, () =>
                          apiRequest('/api/v1/underworld/evidence/submit', {
                            method: 'POST',
                            body: JSON.stringify({ evidenceId: e.id }),
                          }),
                        )
                      }
                    >
                      Nộp tòa án
                    </GameButton>
                  </div>
                )}
              </div>
            ))}
            {evidences.length === 0 && (
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa có bằng chứng. Hãy thuê thám tử!
              </div>
            )}
          </div>
        </Panel>
      )}

      {activeTab === 'blackmail' && (
        <div className="grid gap-4">
          <Panel title="Hợp đồng tống tiền">
            <div className="space-y-3">
              <GameButton variant="danger" onClick={() => setBlackmailOpen(true)}>
                Mở hợp đồng tống tiền mới
              </GameButton>
              {blackmails.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{b.targetName ?? 'Mục tiêu'}</div>
                    <div className="text-xs text-slate-500">
                      {formatMoney(b.monthlyPayment?.amount ?? 0)}/tháng · {b.status ?? '—'}
                    </div>
                  </div>
                  {b.status === 'active' && (
                    <GameButton
                      variant="primary"
                      size="sm"
                      disabled={busy === `collect-${b.id}`}
                      onClick={() =>
                        void handleAction(`collect-${b.id}`, () =>
                          apiRequest(`/api/v1/underworld/blackmail/${b.id}/collect`, {
                            method: 'POST',
                          }),
                        )
                      }
                    >
                      Thu tiền tháng này
                    </GameButton>
                  )}
                </div>
              ))}
              {blackmails.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có hợp đồng tống tiền nào.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Gài bẫy (Sting)">
            <div className="space-y-3">
              <GameButton variant="outline" onClick={() => setStingOpen(true)}>
                Bắt đầu gài bẫy mới
              </GameButton>
              {stings.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{s.targetName ?? 'Mục tiêu'}</div>
                    <div className="text-xs text-slate-500">
                      Mồi nhử {formatMoney(s.amount?.amount ?? 0)}
                    </div>
                  </div>
                  <Badge
                    variant={
                      s.result === 'caught'
                        ? 'success'
                        : s.result === 'failed'
                          ? 'error'
                          : 'warning'
                    }
                  >
                    {s.result === 'caught'
                      ? 'Bắt quả tang'
                      : s.result === 'failed'
                        ? 'Thất bại'
                        : 'Đang chờ'}
                  </Badge>
                </div>
              ))}
              {stings.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có vụ gài bẫy nào.
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'protection' && (
        <div className="grid gap-4">
          <Panel title="Bảo hiểm & Vệ sĩ">
            <div className="space-y-3">
              <div className="flex gap-2">
                <GameButton
                  variant="primary"
                  size="sm"
                  disabled={busy === 'bodyguard'}
                  onClick={() =>
                    void handleAction('bodyguard', () =>
                      apiRequest('/api/v1/underworld/protection/buy', {
                        method: 'POST',
                        body: JSON.stringify({ kind: 'bodyguard' }),
                      }),
                    )
                  }
                >
                  Thuê vệ sĩ (5.000.000 ₫)
                </GameButton>
                <GameButton
                  variant="outline"
                  size="sm"
                  disabled={busy === 'insurance'}
                  onClick={() =>
                    void handleAction('insurance', () =>
                      apiRequest('/api/v1/underworld/protection/buy', {
                        method: 'POST',
                        body: JSON.stringify({ kind: 'insurance' }),
                      }),
                    )
                  }
                >
                  Mua bảo hiểm (10.000.000 ₫)
                </GameButton>
              </div>
              {protections.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {p.kind === 'bodyguard' ? 'Vệ sĩ' : 'Bảo hiểm'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Bảo vệ {formatMoney(p.coverage?.amount ?? 0)} · {p.status ?? '—'}
                    </div>
                  </div>
                  <Badge variant={p.status === 'active' ? 'success' : 'default'}>
                    {p.status === 'active' ? 'Đang hiệu lực' : 'Hết hạn'}
                  </Badge>
                </div>
              ))}
              {protections.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">Chưa có bảo vệ nào.</div>
              )}
            </div>
          </Panel>

          <Panel title="Đại án Công an" borderColor="rose">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  Heat hiện tại: <strong>{heat}</strong> — cần ≥ 80 để kích hoạt
                </span>
                <GameButton
                  variant="danger"
                  size="sm"
                  disabled={busy === 'sweep' || heat < 80}
                  onClick={() =>
                    void handleAction('sweep', () =>
                      apiRequest('/api/v1/underworld/sweep/trigger', { method: 'POST' }),
                    )
                  }
                >
                  Kích hoạt Đại án
                </GameButton>
              </div>
              {sweeps.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50 text-sm"
                >
                  <span className="font-medium">Đại án (heat {s.triggerHeat ?? 0})</span>
                  <span className="text-xs text-slate-500">
                    Phạt {formatMoney(s.fine?.amount ?? 0)} · Tù {s.prisonDays ?? 0} ngày
                  </span>
                </div>
              ))}
              {sweeps.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có vụ Đại án nào.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Lịch sử Heat">
            <div className="space-y-2">
              {(overview?.heatEvents ?? []).map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50 text-sm"
                >
                  <span className="font-medium">{h.reason ?? '—'}</span>
                  <span
                    className={`text-xs font-mono ${h.delta >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                  >
                    {h.delta >= 0 ? '+' : ''}
                    {h.delta ?? 0}
                  </span>
                </div>
              ))}
              {(overview?.heatEvents ?? []).length === 0 && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có sự kiện heat nào.
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'npc' && (
        <Panel title="NPC đàm phán theo tính cách">
          <div className="space-y-3">
            <GameButton variant="primary" onClick={() => setNpcOpen(true)}>
              Đàm phán với NPC mới
            </GameButton>
            {(npcHistory ?? []).map((n) => (
              <div key={n.id} className="p-3 rounded-xl border border-slate-200 bg-white/50">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{n.npcId ?? 'NPC'}</span>
                  <Badge variant="default">{n.personality ?? '—'}</Badge>
                  <Badge variant={n.accept ? 'success' : 'warning'}>
                    {n.accept ? 'Đã chấp nhận' : 'Đã từ chối'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-700">{n.dialogue ?? ''}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {n.counterOffer?.amount
                    ? `Counter: ${formatMoney(n.counterOffer.amount)}`
                    : 'Không counter'}
                </div>
              </div>
            ))}
            {(npcHistory ?? []).length === 0 && (
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa đàm phán với NPC nào.
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Modal: đàm phán NPC */}
      <Modal open={npcOpen} onClose={() => setNpcOpen(false)} title="Đàm phán NPC">
        <div className="space-y-3">
          <GameInput
            label="NPC ID"
            value={npcId}
            onChange={(e) => setNpcId(e.target.value)}
            placeholder="merchant_01"
          />
          <GameInput
            label="Tính cách (aggressive/cautious/greedy/honest)"
            value={npcPersonality}
            onChange={(e) =>
              setNpcPersonality((e.target.value as typeof npcPersonality) || 'greedy')
            }
            placeholder="greedy"
          />
          <GameInput
            label="Ngữ cảnh"
            value={npcContext}
            onChange={(e) => setNpcContext(e.target.value)}
            placeholder="Mua cổ phiếu với giá chiết khấu"
          />
          <GameInput
            label="Đề xuất (text)"
            value={npcOfferText}
            onChange={(e) => setNpcOfferText(e.target.value)}
            placeholder="50 triệu, chốt ngay"
          />
          <GameInput
            label="Giá trị công bằng (VNĐ)"
            value={npcFair}
            onChange={(e) => setNpcFair(e.target.value)}
            type="number"
            placeholder="100000000"
          />
          <GameInput
            label="Offer của bạn (VNĐ)"
            value={npcOfferMinor}
            onChange={(e) => setNpcOfferMinor(e.target.value)}
            type="number"
            placeholder="50000000"
          />
          <GameButton
            variant="primary"
            disabled={busy === 'npc'}
            onClick={() =>
              void handleAction(
                'npc',
                () =>
                  apiRequest('/api/v1/npc/negotiate', {
                    method: 'POST',
                    body: JSON.stringify({
                      npcId,
                      personality: npcPersonality,
                      context: npcContext,
                      playerOffer: npcOfferText,
                      fairValue: Number(npcFair) || 0,
                      offerMinor: Number(npcOfferMinor) || 0,
                    }),
                  }),
                () => setNpcOpen(false),
              )
            }
          >
            Đàm phán
          </GameButton>
        </div>
      </Modal>

      {/* Modal: thu thập bằng chứng */}
      <Modal open={collectOpen} onClose={() => setCollectOpen(false)} title="Thuê thám tử">
        <div className="space-y-3">
          <GameInput
            label="Character ID mục tiêu"
            value={collectTarget}
            onChange={(e) => setCollectTarget(e.target.value)}
            placeholder="UUID..."
          />
          <GameInput
            label="Chi phí thám tử (VNĐ)"
            value={collectPrice}
            onChange={(e) => setCollectPrice(e.target.value)}
            type="number"
            placeholder="2000000"
          />
          <p className="text-[11px] text-slate-500">
            Chi càng nhiều, bằng chứng càng mạnh (tối đa 100). Tối thiểu 500.000 ₫.
          </p>
          <GameButton
            variant="primary"
            disabled={busy === 'collect'}
            onClick={() =>
              void handleAction(
                'collect',
                () =>
                  apiRequest('/api/v1/underworld/evidence/collect', {
                    method: 'POST',
                    body: JSON.stringify({
                      targetCharacterId: collectTarget,
                      price: { amount: Number(collectPrice) || 0, currency: 'VND' },
                    }),
                  }),
                () => setCollectOpen(false),
              )
            }
          >
            Thuê thám tử
          </GameButton>
        </div>
      </Modal>

      {/* Modal: tống tiền */}
      <Modal
        open={blackmailOpen}
        onClose={() => setBlackmailOpen(false)}
        title="Mở hợp đồng tống tiền"
      >
        <div className="space-y-3">
          <GameInput
            label="Character ID mục tiêu"
            value={blackmailTarget}
            onChange={(e) => setBlackmailTarget(e.target.value)}
            placeholder="UUID..."
          />
          <GameInput
            label="Tiền im lặng / tháng (VNĐ)"
            value={blackmailMonthly}
            onChange={(e) => setBlackmailMonthly(e.target.value)}
            type="number"
            placeholder="1000000"
          />
          <GameButton
            variant="danger"
            disabled={busy === 'blackmail'}
            onClick={() =>
              void handleAction(
                'blackmail',
                () =>
                  apiRequest('/api/v1/underworld/blackmail/start', {
                    method: 'POST',
                    body: JSON.stringify({
                      targetCharacterId: blackmailTarget,
                      monthlyPayment: { amount: Number(blackmailMonthly) || 0, currency: 'VND' },
                    }),
                  }),
                () => setBlackmailOpen(false),
              )
            }
          >
            Mở hợp đồng
          </GameButton>
        </div>
      </Modal>

      {/* Modal: gài bẫy */}
      <Modal open={stingOpen} onClose={() => setStingOpen(false)} title="Gài bẫy (Sting)">
        <div className="space-y-3">
          <GameInput
            label="Character ID mục tiêu"
            value={stingTarget}
            onChange={(e) => setStingTarget(e.target.value)}
            placeholder="UUID..."
          />
          <GameInput
            label="Tiền đánh dấu mồi nhử (VNĐ)"
            value={stingAmount}
            onChange={(e) => setStingAmount(e.target.value)}
            type="number"
            placeholder="5000000"
          />
          <p className="text-[11px] text-slate-500">
            Thành công 55%: mục tiêu bị bắt quả tang và mở vụ án. Thất bại: tiền được hoàn trả.
          </p>
          <GameButton
            variant="primary"
            disabled={busy === 'sting'}
            onClick={() =>
              void handleAction(
                'sting',
                () =>
                  apiRequest('/api/v1/underworld/sting', {
                    method: 'POST',
                    body: JSON.stringify({
                      targetCharacterId: stingTarget,
                      amount: { amount: Number(stingAmount) || 0, currency: 'VND' },
                    }),
                  }),
                () => setStingOpen(false),
              )
            }
          >
            Bắt đầu gài bẫy
          </GameButton>
        </div>
      </Modal>
    </div>
  );
}
