import { useEffect, useMemo, useState } from 'react';
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

  const { data: character, refetch: refetchCharacter } = useQuery({
    queryKey: ['character', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const { data: healthOverview, isLoading: healthLoading, refetch: refetchHealth } = useQuery<any>({
    queryKey: ['health', 'overview'],
    queryFn: () => apiRequest<any>('/api/v1/health/overview'),
  });

  const { data: provinces } = useQuery<any[]>({
    queryKey: ['characters', 'provinces'],
    queryFn: () => apiRequest<any[]>('/api/v1/characters/provinces'),
    staleTime: 300_000,
  });

  const { data: travelOverview, isLoading: travelLoading, refetch: refetchTravel } = useQuery<any>({
    queryKey: ['travel', 'overview'],
    queryFn: () => apiRequest<any>('/api/v1/travel/overview'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const [travelProvince, setTravelProvince] = useState<string>('');
  const [travelDays, setTravelDays] = useState<1 | 2 | 3>(1);
  const [lodgingOptions, setLodgingOptions] = useState<any[]>([]);
  const [lodgingLoading, setLodgingLoading] = useState(false);
  const [selectedLodgingId, setSelectedLodgingId] = useState<string>('');
  const [travelBusy, setTravelBusy] = useState(false);

  const defaultProvince = character?.birthplace ?? provinces?.[0]?.code ?? '001';

  useEffect(() => {
    if (!travelProvince) setTravelProvince(defaultProvince);
  }, [defaultProvince, travelProvince]);

  const travelDestination = useMemo(() => {
    const list = (travelOverview?.destinations ?? []) as any[];
    return list.find((d) => d.provinceCode === (travelProvince || defaultProvince)) ?? null;
  }, [travelOverview?.destinations, travelProvince, defaultProvince]);

  async function refreshTravelState() {
    await Promise.all([
      refetchTravel(),
      refetchCharacter(),
      qc.invalidateQueries({ queryKey: ['health'] }),
    ]);
  }

  async function handleShortTrip() {
    const provinceCode = travelProvince || defaultProvince;
    if (!provinceCode) return;
    setTravelBusy(true);
    try {
      const res = await apiRequest<any>('/api/v1/travel/short', {
        method: 'POST',
        body: JSON.stringify({ provinceCode }),
      });
      toast({ title: 'Du lịch ngắn', description: res?.message || 'Chuyến đi thành công.', variant: 'success' });
      await refreshTravelState();
    } catch (e: any) {
      toast({ title: 'Không thể du lịch', description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally {
      setTravelBusy(false);
    }
  }

  async function loadLodgingOptions() {
    const provinceCode = travelProvince || defaultProvince;
    if (!provinceCode) return;
    setLodgingLoading(true);
    try {
      const res = await apiRequest<any>(`/api/v1/travel/lodging-options?provinceCode=${encodeURIComponent(provinceCode)}&days=${travelDays}`);
      const options = Array.isArray(res?.options) ? res.options : [];
      setLodgingOptions(options);
      if (options.length > 0) setSelectedLodgingId((prev) => options.some((o: any) => o.id === prev) ? prev : options[0].id);
      else setSelectedLodgingId('');
    } catch (e: any) {
      setLodgingOptions([]);
      setSelectedLodgingId('');
      toast({ title: 'Không thể tải lựa chọn lưu trú', description: e?.problem?.detail || e?.message, variant: 'error' });
    } finally {
      setLodgingLoading(false);
    }
  }

  async function handleStartRetreat() {
    const provinceCode = travelProvince || defaultProvince;
    const option = lodgingOptions.find((o) => o.id === selectedLodgingId) ?? lodgingOptions[0];
    if (!provinceCode || !option) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng chọn điểm đến và nơi lưu trú.', variant: 'error' });
      return;
    }
    setTravelBusy(true);
    try {
      const res = await apiRequest<any>('/api/v1/travel/retreat', {
        method: 'POST',
        body: JSON.stringify({
          provinceCode,
          days: travelDays,
          lodgingType: option.type,
          lodgingOptionId: option.id,
          propertyId: option.propertyId ?? null,
          propertySource: option.propertySource ?? null,
        }),
      });
      toast({ title: 'Nghỉ dưỡng', description: res?.message || 'Đã bắt đầu chuyến nghỉ dưỡng.', variant: 'success' });
      await refreshTravelState();
    } catch (e: any) {
      toast({ title: 'Không thể bắt đầu nghỉ dưỡng', description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally {
      setTravelBusy(false);
    }
  }

  const run = async (fn: () => Promise<any>, title: string) => {
    try {
      await fn();
      toast({ title, description: 'Thao tác thành công.' });
      await qc.invalidateQueries({ queryKey: ['health'] });
      await qc.invalidateQueries({ queryKey: ['character'] });
    } catch (e: any) {
      toast({ title: 'Thao tác thất bại', description: e?.problem?.detail || e?.message, variant: 'error' });
    }
  };

  const setInsuranceMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/health/insurance', {
        method: 'POST',
        body: JSON.stringify({ contributionRatePct: insuranceRate }),
      }),
  });

  const hw = healthOverview?.wellness;
  const ins = healthOverview?.insurance;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Thể lực & Hồi phục"
        description="Theo dõi thể lực, quản lý bảo hiểm y tế, nghỉ ngơi, spa và du lịch/lưu trú."
      />
      <CharacterSectionNav />

      {hw?.inActiveTrip && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Nhân vật đang trong chuyến nghỉ dưỡng. Một số hoạt động làm việc/chợ đen sẽ bị khóa cho đến khi kết thúc.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Chỉ số hiện tại" borderColor="emerald">
          {healthLoading ? (
            <p className="text-xs text-slate-500">Đang tải...</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Thể lực</span>
                <span className="font-semibold">{Number(hw?.stamina ?? 0).toFixed(2)} / {hw?.staminaCap ?? 100}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.max(0, Math.min(100, ((Number(hw?.stamina ?? 0) / Math.max(1, Number(hw?.staminaCap ?? 100))) * 100)))}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-200 p-2">Lượt làm việc/tháng: <b>{hw?.shiftCountMonth ?? 0}</b></div>
                <div className="rounded-lg border border-slate-200 p-2">Nghỉ ngơi/tháng: <b>{hw?.restActionsMonth ?? 0}</b></div>
                <div className="rounded-lg border border-slate-200 p-2">Spa tháng này: <b>{hw?.spaUsedMonth ? 'Đã dùng' : 'Chưa dùng'}</b></div>
                <div className="rounded-lg border border-slate-200 p-2">Du lịch trong kỳ: <b>{hw?.travelCountYear ?? 0}</b></div>
              </div>
              <div className="text-xs text-slate-500">
                Trần theo tuổi: {hw?.staminaCap ?? '—'} • Kỳ du lịch: {hw?.travelYear ?? '—'}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Bảo hiểm y tế" borderColor="sky">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Trạng thái</span>
              <Badge variant={ins?.status === 'ACTIVE' ? 'success' : ins?.status === 'SUSPENDED' ? 'error' : 'default'}>
                {ins?.status ?? 'NONE'}
              </Badge>
            </div>
            <div className="text-xs text-slate-600">
              Đóng góp hiện tại: <b>{ins?.contributionRatePct ?? 0}%</b> thu nhập / tháng
            </div>
            <label className="block text-xs font-medium text-slate-700">
              Tỷ lệ đóng góp (%)
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                value={insuranceRate}
                onChange={(e) => setInsuranceRate(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => run(() => setInsuranceMutation.mutateAsync(), 'Cập nhật bảo hiểm')}
              className="w-full rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Lưu mức đóng góp
            </button>
            <p className="text-[11px] text-slate-500">
              Lương thực nhận khi có bảo hiểm active = lương gộp trừ tỷ lệ đóng góp.
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Hành động hồi phục" borderColor="violet">
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            disabled={!!hw?.inActiveTrip}
            onClick={() => run(() => apiRequest('/api/v1/health/rest', { method: 'POST', body: JSON.stringify({}) }), 'Nghỉ ngơi')}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 disabled:opacity-50"
          >
            <div className="font-semibold text-slate-900">Nghỉ ngơi tại nhà</div>
            <div className="mt-1 text-xs text-slate-600">Hồi 5–10% trần thể lực, tối đa 5 lần/tháng, không tốn tiền.</div>
          </button>

          <button
            type="button"
            disabled={!!hw?.inActiveTrip || !!hw?.spaUsedMonth}
            onClick={() => run(() => apiRequest('/api/v1/health/spa', { method: 'POST', body: JSON.stringify({}) }), 'Gói Spa')}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 disabled:opacity-50"
          >
            <div className="font-semibold text-slate-900">Gói Spa cao cấp</div>
            <div className="mt-1 text-xs text-slate-600">
              Chi phí {fmtMoneyValue(healthOverview?.spaCost)} • Hồi 30% trần • 1 lần/tháng.
            </div>
          </button>
        </div>
      </Panel>

      <Panel title="Du lịch & Lưu trú" borderColor="emerald">
        <div className="space-y-3 text-sm">
          {travelLoading ? (
            <p className="text-xs text-slate-500">Đang tải thông tin du lịch…</p>
          ) : travelOverview?.inActiveTrip && travelOverview?.activeTrip ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-amber-900">Đang nghỉ dưỡng</div>
                <Badge variant="warning">Đang diễn ra</Badge>
              </div>
              <div className="mt-1 text-xs text-amber-800">
                {travelOverview.activeTrip.provinceName || travelOverview.activeTrip.provinceCode}
                {` • ${travelOverview.activeTrip.durationDays} ngày`}
              </div>
              <div className="mt-1 text-xs text-amber-700">
                Kết thúc: ngày {travelOverview.activeTrip.endGameDay + 1} (năm {travelOverview.activeTrip.endGameYear})
              </div>
              <p className="mt-2 text-[11px] text-amber-700">
                Trong thời gian này, thao tác đi làm và chợ đen sẽ tạm khóa.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">Điểm đến</label>
                <select
                  value={travelProvince || defaultProvince}
                  onChange={(e) => {
                    setTravelProvince(e.target.value);
                    setLodgingOptions([]);
                    setSelectedLodgingId('');
                  }}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={travelBusy}
                >
                  {(travelOverview?.destinations ?? provinces ?? []).map((d: any) => (
                    <option key={d.provinceCode || d.code} value={d.provinceCode || d.code}>
                      {(d.provinceName || d.name)}{d.isPeakSeason ? ' • Cao điểm' : ''}
                    </option>
                  ))}
                </select>
                {travelDestination && (
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      Vé ngắn: {formatMoney(Number(travelDestination.shortTripTicket?.amount ?? 0))}
                    </span>
                    {travelDestination.isPeakSeason && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Mùa cao điểm x1.4</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">Du lịch ngắn</div>
                  <div className="mt-1 text-xs text-slate-600">Hoàn tất ngay, hồi phục thể lực tức thời.</div>
                  <button
                    type="button"
                    onClick={() => void handleShortTrip()}
                    disabled={travelBusy || !!travelOverview?.inActiveTrip}
                    className="mt-2 min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {travelBusy ? 'Đang xử lý…' : 'Đi du lịch ngắn'}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">Nghỉ dưỡng</div>
                  <div className="mt-1 text-xs text-slate-600">Chọn thời gian và nơi lưu trú tại điểm đến.</div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setTravelDays(d as 1 | 2 | 3); setLodgingOptions([]); setSelectedLodgingId(''); }}
                        className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-semibold ${travelDays === d ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}
                        disabled={travelBusy}
                      >
                        {d} ngày
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadLodgingOptions()}
                    disabled={lodgingLoading || travelBusy || !!travelOverview?.inActiveTrip}
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {lodgingLoading ? 'Đang tải nơi lưu trú…' : 'Xem lựa chọn lưu trú'}
                  </button>

                  {lodgingOptions.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {lodgingOptions.map((opt: any) => (
                        <label key={opt.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 ${selectedLodgingId === opt.id ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                          <input
                            type="radio"
                            name="lodging"
                            className="mt-1"
                            checked={selectedLodgingId === opt.id}
                            onChange={() => setSelectedLodgingId(opt.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-900">{opt.name}</span>
                              <Badge variant={opt.type === 'player_property' ? 'success' : 'default'}>
                                {opt.type === 'player_property' ? 'BĐS người chơi' : 'Khách sạn'}
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-600">
                              {formatMoney(Number(opt.perDayCost?.amount ?? 0))}/ngày • Tổng {formatMoney(Number(opt.totalCost?.amount ?? 0))}
                            </div>
                          </div>
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => void handleStartRetreat()}
                        disabled={travelBusy || !selectedLodgingId || !!travelOverview?.inActiveTrip}
                        className="min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {travelBusy ? 'Đang khởi hành…' : `Bắt đầu nghỉ dưỡng ${travelDays} ngày`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
