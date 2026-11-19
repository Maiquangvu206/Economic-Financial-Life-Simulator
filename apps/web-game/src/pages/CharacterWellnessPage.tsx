import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type { CharacterDto } from '@efls/contracts';
import { Badge } from '../shared/ui/Badge';
import { Panel } from '../shared/ui/Panel';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { toast } from '../shared/ui/Toast';
import { CharacterSectionNav } from '../shared/character/CharacterSectionNav';

function fmtMoneyValue(m: any): string {
  if (!m) return formatMoney(0);
  if (typeof m === 'number') return formatMoney(m);
  return formatMoney(Number(m.amount ?? 0));
}

export function CharacterWellnessPage() {
  const qc = useQueryClient();
  const [insuranceRate, setInsuranceRate] = useState(5);

  const { data: character } = useQuery({
    queryKey: ['character', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const { data: healthOverview, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['health', 'overview'],
    queryFn: () => apiRequest<any>('/api/v1/health/overview'),
    enabled: !!character,
  });

  useEffect(() => {
    if (healthOverview?.insurance?.contributionRatePct != null) {
      setInsuranceRate(Math.max(1, Math.round(Number(healthOverview.insurance.contributionRatePct))));
    }
  }, [healthOverview?.insurance?.contributionRatePct]);

  const refreshAll = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['character', 'me'] }), refetchHealth()]);
  };

  const restMutation = useMutation({
    mutationFn: () => apiRequest<any>('/api/v1/health/rest', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: async (res) => {
      toast({ title: 'Nghỉ ngơi', description: res?.message || 'Đã nghỉ ngơi tại nhà.', variant: 'success' });
      await refreshAll();
    },
    onError: (err: any) => toast({ title: 'Không thể nghỉ ngơi', description: err?.problem?.detail || err?.message, variant: 'error' }),
  });

  const medicalMutation = useMutation({
    mutationFn: () => apiRequest<any>('/api/v1/health/medical/visit', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: async (res) => {
      toast({ title: 'Khám chữa bệnh', description: res?.message || 'Đã khám chữa bệnh.', variant: 'success' });
      await refreshAll();
    },
    onError: (err: any) => toast({ title: 'Không thể khám chữa bệnh', description: err?.problem?.detail || err?.message, variant: 'error' }),
  });

  const insuranceMutation = useMutation({
    mutationFn: (payload: { isActive: boolean; contributionRatePct?: number }) =>
      apiRequest<any>('/api/v1/health/insurance', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      toast({ title: 'Bảo hiểm', description: 'Đã cập nhật bảo hiểm đóng góp.', variant: 'success' });
      await refreshAll();
    },
    onError: (err: any) => toast({ title: 'Không thể cập nhật bảo hiểm', description: err?.problem?.detail || err?.message, variant: 'error' }),
  });

  const claimSupportMutation = useMutation({
    mutationFn: (supportType: string) =>
      apiRequest<any>('/api/v1/health/supports/claim', { method: 'POST', body: JSON.stringify({ supportType }) }),
    onSuccess: async (res) => {
      toast({ title: 'An sinh', description: res?.message || 'Đã nhận trợ cấp.', variant: 'success' });
      await refreshAll();
    },
    onError: (err: any) => toast({ title: 'Không thể nhận trợ cấp', description: err?.problem?.detail || err?.message, variant: 'error' }),
  });

  const entertainmentMutation = useMutation({
    mutationFn: (activityCode: string) =>
      apiRequest<any>('/api/v1/health/entertainment/perform', { method: 'POST', body: JSON.stringify({ activityCode }) }),
    onSuccess: async (res) => {
      toast({ title: 'Giải trí', description: res?.message || 'Hoạt động thành công.', variant: 'success' });
      await refreshAll();
    },
    onError: (err: any) => toast({ title: 'Không thể thực hiện', description: err?.problem?.detail || err?.message, variant: 'error' }),
  });

  const hw = healthOverview;
  const insured = !!hw?.insurance?.isActive;

  return (
    <div className="space-y-5 pb-[env(safe-area-inset-bottom)]">
      <PageHeader
        title="Thể lực & Hồi phục"
        description="Quản lý nghỉ ngơi, y tế, bảo hiểm, an sinh và giải trí."
      />
      <CharacterSectionNav />

      {healthLoading && (
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">Đang tải dữ liệu sức khỏe…</div>
      )}

      {hw?.inActiveTrip && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bạn đang trong chuyến nghỉ dưỡng. Một số hoạt động sẽ tạm thời không khả dụng.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Thể lực hiện tại</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{hw?.healthEnergy ?? character?.healthEnergy ?? 0} / 100</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Nghỉ ngơi hôm nay</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{hw?.homeRest?.usedToday ?? 0}/{hw?.homeRest?.dailyLimit ?? 2}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Lượt khám hôm nay</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{hw?.medical?.usedToday ?? 0}/{hw?.medical?.dailyLimit ?? 2}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Bảo hiểm</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{insured ? `Đang tham gia (${hw?.insurance?.contributionRatePct ?? insuranceRate}%)` : 'Chưa tham gia'}</div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Nghỉ ngơi" borderColor="emerald">
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Nghỉ ngơi tại nhà để hồi phục thể lực khi có chỗ ở hợp lệ.</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">+{hw?.homeRest?.energyGain ?? 15} thể lực</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Đã dùng {hw?.homeRest?.usedToday ?? 0}/{hw?.homeRest?.dailyLimit ?? 2} lượt hôm nay</span>
              </div>
              {!hw?.homeRest?.canRest && hw?.homeRest?.reason && (
                <p className="text-xs text-amber-700">{hw.homeRest.reason}</p>
              )}
              <button
                type="button"
                onClick={() => restMutation.mutate()}
                disabled={!hw?.homeRest?.canRest || restMutation.isPending}
                className="min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {restMutation.isPending ? 'Đang nghỉ ngơi…' : 'Nghỉ ngơi tại nhà'}
              </button>
            </div>
          </Panel>

          <Panel title="Y tế" borderColor="emerald">
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Khám chữa bệnh để hồi phục thể lực nhanh hơn.</p>
              <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-2.5">Hồi phục: <b>+{hw?.medical?.energyGain ?? 25}</b></div>
                <div className="rounded-xl bg-slate-50 p-2.5">Chi phí: <b>{fmtMoneyValue(hw?.medical?.discountedCost ?? hw?.medical?.baseCost)}</b></div>
                <div className="rounded-xl bg-slate-50 p-2.5">Lượt hôm nay: <b>{hw?.medical?.usedToday ?? 0}/{hw?.medical?.dailyLimit ?? 2}</b></div>
                <div className="rounded-xl bg-slate-50 p-2.5">Bảo hiểm: <b>{insured ? 'Giảm 50%' : 'Chưa áp dụng'}</b></div>
              </div>
              {!hw?.medical?.canUse && hw?.medical?.reason && (
                <p className="text-xs text-amber-700">{hw.medical.reason}</p>
              )}
              <button
                type="button"
                onClick={() => medicalMutation.mutate()}
                disabled={!hw?.medical?.canUse || medicalMutation.isPending}
                className="min-h-[44px] w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {medicalMutation.isPending ? 'Đang xử lý…' : 'Khám chữa bệnh'}
              </button>
            </div>
          </Panel>

          <Panel title="An sinh" borderColor="amber">
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">Bảo hiểm đóng góp</div>
                    <div className="text-xs text-slate-600">Giảm chi phí khám chữa bệnh và hỗ trợ trợ cấp thất nghiệp.</div>
                  </div>
                  <Badge variant={insured ? 'success' : 'default'}>{insured ? 'Đang tham gia' : 'Chưa tham gia'}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-700">Mức đóng góp</label>
                  <select
                    value={insuranceRate}
                    onChange={(e) => setInsuranceRate(Number(e.target.value))}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={insuranceMutation.isPending}
                  >
                    {[3, 5, 8, 10].map((r) => <option key={r} value={r}>{r}% lương</option>)}
                  </select>
                  {insured ? (
                    <button
                      type="button"
                      onClick={() => insuranceMutation.mutate({ isActive: false, contributionRatePct: insuranceRate })}
                      disabled={insuranceMutation.isPending}
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Tạm dừng
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => insuranceMutation.mutate({ isActive: true, contributionRatePct: insuranceRate })}
                      disabled={insuranceMutation.isPending}
                      className="min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Tham gia
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Trợ cấp định kỳ</div>
                {(hw?.supports ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có thông tin trợ cấp.</p>
                ) : (
                  (hw?.supports ?? []).map((s: any) => (
                    <div key={s.type} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-900">{s.label}</div>
                          <div className="text-xs text-slate-600">Ước tính: {fmtMoneyValue(s.estimatedAmount)} • Kỳ {s.periodKey}</div>
                          {s.reason && <div className="mt-1 text-xs text-slate-500">{s.reason}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => claimSupportMutation.mutate(s.type)}
                          disabled={!s.eligible || s.claimedThisPeriod || claimSupportMutation.isPending}
                          className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {s.claimedThisPeriod ? 'Đã nhận' : 'Nhận trợ cấp'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Giải trí" borderColor="emerald">
            <div className="space-y-2 text-sm">
              <p className="text-slate-600">Tham gia các hoạt động để hồi phục thể lực trong ngày.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(hw?.entertainment ?? []).map((a: any) => (
                  <div key={a.code} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{a.name}</div>
                        <div className="mt-0.5 text-xs text-slate-600">{a.description}</div>
                      </div>
                      {a.seasonal && <Badge variant="warning">Theo mùa</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">+{a.energyGain} thể lực</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{fmtMoneyValue(a.cost)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">Còn {a.remainingToday}/{a.dailyLimit}</span>
                    </div>
                    {!a.available && a.unavailableReason && (
                      <div className="mt-2 text-[11px] text-amber-700">{a.unavailableReason}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => entertainmentMutation.mutate(a.code)}
                      disabled={!a.available || entertainmentMutation.isPending}
                      className="mt-2 min-h-[44px] w-full rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Tham gia
                    </button>
                  </div>
                ))}
              </div>
              {(!hw?.entertainment || hw.entertainment.length === 0) && !healthLoading && (
                <p className="text-xs text-slate-500">Chưa có dữ liệu hoạt động giải trí.</p>
              )}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}
