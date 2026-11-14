import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type {
  CompanyDto,
  CompanyEmployeesDto,
  CompanyOverviewDto,
  IndustryType,
} from '@efls/contracts';
import { apiRequest } from '../shared/api/httpClient';
import { formatCompact, formatMoney } from '../shared/lib/format';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { useToast } from '../shared/ui/Toast';

const INDUSTRIES: { value: IndustryType; label: string }[] = [
  { value: 'real_estate', label: 'Bất động sản' },
  { value: 'finance_banking', label: 'Tài chính - Ngân hàng' },
  { value: 'technology_ai', label: 'Công nghệ - AI' },
  { value: 'agritech', label: 'Nông nghiệp công nghệ' },
  { value: 'healthcare_pharma', label: 'Y tế - Dược phẩm' },
  { value: 'entertainment_media', label: 'Giải trí - Truyền thông' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'energy_mining', label: 'Năng lượng - Khoáng sản' },
  { value: 'education', label: 'Giáo dục' },
  { value: 'underworld_services', label: 'Dịch vụ ngầm' },
];

function industryLabel(v: IndustryType): string {
  return INDUSTRIES.find((i) => i.value === v)?.label ?? v;
}

function statusBadge(status: CompanyDto['status']) {
  if (status === 'ipo') return <Badge variant="success">IPO</Badge>;
  if (status === 'bankrupt') return <Badge variant="error">Phá sản/Giải thể</Badge>;
  return <Badge variant="default">Hoạt động</Badge>;
}

function money(amount: number) {
  return { amount, currency: 'VND' as const };
}

export function BusinessPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('technology_ai');
  const [capital, setCapital] = useState('10000000');

  const [investAmount, setInvestAmount] = useState('1000000');
  const [ipoSymbol, setIpoSymbol] = useState('');
  const [ipoPrice, setIpoPrice] = useState('10000');
  const [ipoShares, setIpoShares] = useState('1000000');
  const [divPerShare, setDivPerShare] = useState('100');
  const [takeoverBuyerId, setTakeoverBuyerId] = useState('');
  const [revenueAmount, setRevenueAmount] = useState('5000000');
  const [revenueNote, setRevenueNote] = useState('');
  const [opexAmount, setOpexAmount] = useState('2000000');
  const [opexNote, setOpexNote] = useState('');

  const { data: me } = useQuery<{ id: string; fullName: string }>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest('/api/v1/characters/me'),
  });

  const {
    data: overview,
    isLoading,
    error,
    refetch,
  } = useQuery<CompanyOverviewDto>({
    queryKey: ['corporations', 'overview'],
    queryFn: () => apiRequest<CompanyOverviewDto>('/api/v1/corporations'),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<CompanyDto>({
    queryKey: ['corporations', 'detail', selectedId],
    queryFn: () => apiRequest<CompanyDto>(`/api/v1/corporations/${selectedId}`),
    enabled: !!selectedId,
  });

  const selectedCompany = detail ?? overview?.companies.find((c) => c.id === selectedId) ?? null;
  const canManage = !!selectedCompany?.isOwner;

  const { data: employeesData, isLoading: employeesLoading } = useQuery<CompanyEmployeesDto>({
    queryKey: ['corporations', 'employees', selectedId],
    queryFn: () => apiRequest<CompanyEmployeesDto>(`/api/v1/corporations/${selectedId}/employees`),
    enabled: !!selectedId && canManage && detail?.isOwner === true,
  });

  const companies = overview?.companies ?? [];
  const myCompanies = companies.filter((c) => c.isOwner);
  const totalValuation = companies.reduce((s, c) => s + c.valuation.amount, 0);
  const myValuation = myCompanies.reduce((s, c) => s + c.valuation.amount, 0);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['corporations'] });
    await queryClient.invalidateQueries({ queryKey: ['characters', 'me'] });
  };

  const createCompany = useMutation({
    mutationFn: () =>
      apiRequest<CompanyDto>('/api/v1/corporations', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          industry,
          initialCapital: money(Number(capital) || 0),
        }),
      }),
    onSuccess: async (c) => {
      toast({ title: 'Đã thành lập công ty', description: `Công ty "${c.name}" đã được tạo.` });
      setCreateOpen(false);
      setName('');
      await invalidate();
      setSelectedId(c.id);
    },
    onError: (e: Error) =>
      toast({ title: 'Thành lập thất bại', description: e.message, variant: 'error' }),
  });

  const investCompany = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/invest`, {
        method: 'POST',
        body: JSON.stringify({ amount: money(Number(investAmount) || 0) }),
      }),
    onSuccess: async (c) => {
      toast({ title: 'Đầu tư thành công', description: `Đã đầu tư vào "${c.name}".` });
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Đầu tư thất bại', description: e.message, variant: 'error' }),
  });

  const ipoCompany = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/ipo`, {
        method: 'POST',
        body: JSON.stringify({
          tickerSymbol: ipoSymbol.trim().toUpperCase(),
          initialPrice: money(Number(ipoPrice) || 0),
          totalShares: Number(ipoShares) || 0,
        }),
      }),
    onSuccess: async (c) => {
      toast({
        title: 'IPO thành công',
        description: `"${c.name}" đã niêm yết với mã ${c.tickerSymbol}.`,
      });
      setIpoSymbol('');
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'IPO thất bại', description: e.message, variant: 'error' }),
  });

  const payDividend = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/v1/corporations/${companyId}/dividend`, {
        method: 'POST',
        body: JSON.stringify({ amountPerShare: money(Number(divPerShare) || 0) }),
      }),
    onSuccess: async () => {
      toast({ title: 'Đã phát cổ tức', description: 'Cổ tức đã được xử lý.' });
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Phát cổ tức thất bại', description: e.message, variant: 'error' }),
  });

  const takeoverCompany = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/takeover`, {
        method: 'POST',
        body: JSON.stringify({ buyerCharacterId: takeoverBuyerId.trim() || me?.id }),
      }),
    onSuccess: async (c) => {
      toast({ title: 'Thâu tóm thành công', description: `Bạn đã kiểm soát "${c.name}".` });
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Thâu tóm thất bại', description: e.message, variant: 'error' }),
  });

  const collectRevenue = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/revenue`, {
        method: 'POST',
        body: JSON.stringify({
          amount: money(Number(revenueAmount) || 0),
          note: revenueNote.trim() || undefined,
        }),
      }),
    onSuccess: async (c) => {
      toast({ title: 'Đã ghi nhận doanh thu', description: `Quỹ "${c.name}" đã tăng.` });
      setRevenueNote('');
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Ghi nhận thất bại', description: e.message, variant: 'error' }),
  });

  const payOpex = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/opex`, {
        method: 'POST',
        body: JSON.stringify({
          amount: money(Number(opexAmount) || 0),
          note: opexNote.trim() || undefined,
        }),
      }),
    onSuccess: async (c) => {
      toast({ title: 'Đã chi OPEX', description: `Quỹ "${c.name}" đã cập nhật.` });
      setOpexNote('');
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Chi OPEX thất bại', description: e.message, variant: 'error' }),
  });

  const dissolveCompany = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/dissolve`, { method: 'POST' }),
    onSuccess: async (c) => {
      toast({
        title: 'Đã giải thể công ty',
        description: `"${c.name}" chuyển sang phá sản/giải thể.`,
      });
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Giải thể thất bại', description: e.message, variant: 'error' }),
  });

  const fireEmployee = useMutation({
    mutationFn: ({ companyId, employmentId }: { companyId: string; employmentId: string }) =>
      apiRequest(`/api/v1/corporations/${companyId}/employees/${employmentId}/fire`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      toast({ title: 'Đã sa thải', description: 'Hợp đồng lao động đã chấm dứt.' });
      await queryClient.invalidateQueries({ queryKey: ['corporations', 'employees', selectedId] });
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Sa thải thất bại', description: e.message, variant: 'error' }),
  });

  const topShareholders = useMemo(() => detail?.shareholders ?? [], [detail]);
  const activeEmployees = (employeesData?.employees ?? []).filter((e) => e.status === 'active');

  if (isLoading) {
    return (
      <Panel title="Doanh nghiệp" borderColor="default">
        <p className="text-sm text-slate-600">Đang tải dữ liệu doanh nghiệp...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Lỗi tải dữ liệu" borderColor="rose">
        <p className="text-sm text-rose-600">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <GameButton variant="outline" onClick={() => void refetch()}>
          Thử lại
        </GameButton>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Doanh nghiệp"
          description="Thành lập, vận hành (doanh thu/OPEX), nhân sự, đầu tư, IPO, cổ tức, thâu tóm và giải thể. Dữ liệu do server xác thực."
        />
        <GameButton variant="primary" onClick={() => setCreateOpen(true)}>
          + Thành lập công ty
        </GameButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng công ty" value={String(companies.length)} hint="Toàn thị trường" />
        <StatCard
          label="Công ty của tôi"
          value={String(myCompanies.length)}
          hint="Bạn sở hữu"
          tone="positive"
        />
        <StatCard
          label="Định giá (của tôi)"
          value={formatCompact(myValuation)}
          hint={formatMoney(myValuation)}
          tone="positive"
        />
        <StatCard
          label="Định giá thị trường"
          value={formatCompact(totalValuation)}
          hint={formatMoney(totalValuation)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Công ty của tôi" borderColor="emerald">
          {myCompanies.length === 0 ? (
            <p className="text-sm text-slate-500">
              Bạn chưa sở hữu công ty nào. Hãy thành lập công ty đầu tiên.
            </p>
          ) : (
            <div className="space-y-2">
              {myCompanies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selectedId === c.id
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {statusBadge(c.status)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{industryLabel(c.industry)}</span>
                    <span>{formatCompact(c.valuation.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <div className="xl:col-span-2">
          <Panel title="Thị trường doanh nghiệp" borderColor="default">
            {companies.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có công ty nào được thành lập.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Công ty</th>
                      <th className="py-2 pr-3">Ngành</th>
                      <th className="py-2 pr-3">Trạng thái</th>
                      <th className="py-2 pr-3 text-right">Định giá</th>
                      <th className="py-2 pr-3 text-right">Quỹ CT</th>
                      <th className="py-2 text-right">Mã CK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companies.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedId(c.id)}
                      >
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          {c.name}
                          {c.isOwner && (
                            <span className="ml-2 text-[10px] font-semibold text-emerald-700">
                              (của tôi)
                            </span>
                          )}
                          <div className="text-[11px] text-slate-500">CT: {c.ownerName}</div>
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{industryLabel(c.industry)}</td>
                        <td className="py-2 pr-3">{statusBadge(c.status)}</td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700">
                          {formatCompact(c.valuation.amount)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700">
                          {formatCompact(c.cash.amount)}
                        </td>
                        <td className="py-2 text-right font-mono text-slate-700">
                          {c.tickerSymbol ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thành lập công ty">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createCompany.mutate();
          }}
        >
          <GameInput
            label="Tên công ty"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: EFLS Tech"
            required
          />
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-slate-500">Ngành</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as IndustryType)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <GameInput
            label="Vốn khởi điểm (VND)"
            type="number"
            min={1}
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            required
          />
          <p className="text-[11px] text-slate-500">
            Vốn sẽ được trừ từ ví cá nhân của bạn khi thành lập.
          </p>
          <div className="flex justify-end">
            <GameButton
              variant="primary"
              type="submit"
              disabled={createCompany.isPending || !name.trim()}
            >
              {createCompany.isPending ? 'Đang tạo...' : 'Thành lập'}
            </GameButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={selectedCompany ? `Công ty: ${selectedCompany.name}` : 'Chi tiết công ty'}
      >
        {!selectedCompany ? (
          <p className="text-sm text-slate-500">
            {detailLoading ? 'Đang tải...' : 'Không tìm thấy công ty.'}
          </p>
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-slate-500">Ngành</div>
              <div className="font-medium">{industryLabel(selectedCompany.industry)}</div>
              <div className="text-slate-500">Chủ sở hữu</div>
              <div className="font-medium">{selectedCompany.ownerName}</div>
              <div className="text-slate-500">Trạng thái</div>
              <div>{statusBadge(selectedCompany.status)}</div>
              <div className="text-slate-500">Định giá</div>
              <div className="font-mono">{formatMoney(selectedCompany.valuation.amount)}</div>
              <div className="text-slate-500">Quỹ công ty</div>
              <div className="font-mono">{formatMoney(selectedCompany.cash.amount)}</div>
              <div className="text-slate-500">Mã CK</div>
              <div className="font-mono">{selectedCompany.tickerSymbol ?? '—'}</div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700">Đầu tư vốn</p>
              <div className="flex gap-2">
                <GameInput
                  type="number"
                  min={1}
                  value={investAmount}
                  onChange={(e) => setInvestAmount(e.target.value)}
                />
                <GameButton
                  variant="primary"
                  onClick={() => investCompany.mutate(selectedCompany.id)}
                  disabled={investCompany.isPending || selectedCompany.status !== 'active'}
                >
                  {investCompany.isPending ? '...' : 'Đầu tư'}
                </GameButton>
              </div>
              {selectedCompany.status !== 'active' && (
                <p className="text-[11px] text-amber-600">
                  Chỉ công ty đang hoạt động mới nhận đầu tư.
                </p>
              )}
            </div>

            {canManage && selectedCompany.status !== 'bankrupt' && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
                <p className="text-xs font-semibold text-emerald-800">Vận hành (chủ sở hữu)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <GameInput
                      label="Doanh thu (VND)"
                      type="number"
                      min={1}
                      value={revenueAmount}
                      onChange={(e) => setRevenueAmount(e.target.value)}
                    />
                    <GameInput
                      label="Ghi chú"
                      value={revenueNote}
                      onChange={(e) => setRevenueNote(e.target.value)}
                      placeholder="Nguồn thu"
                    />
                    <GameButton
                      variant="primary"
                      onClick={() => collectRevenue.mutate(selectedCompany.id)}
                      disabled={collectRevenue.isPending}
                    >
                      {collectRevenue.isPending ? '...' : 'Ghi nhận doanh thu'}
                    </GameButton>
                  </div>
                  <div className="space-y-1">
                    <GameInput
                      label="OPEX (VND)"
                      type="number"
                      min={1}
                      value={opexAmount}
                      onChange={(e) => setOpexAmount(e.target.value)}
                    />
                    <GameInput
                      label="Ghi chú"
                      value={opexNote}
                      onChange={(e) => setOpexNote(e.target.value)}
                      placeholder="Chi phí"
                    />
                    <GameButton
                      variant="outline"
                      onClick={() => payOpex.mutate(selectedCompany.id)}
                      disabled={payOpex.isPending}
                    >
                      {payOpex.isPending ? '...' : 'Chi OPEX'}
                    </GameButton>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Doanh thu/OPEX cập nhật quỹ công ty (1 lần tối đa 5 tỷ ₫ doanh thu). OPEX bị chặn
                  nếu quỹ không đủ.
                </p>
              </div>
            )}

            {canManage && selectedCompany.status === 'active' && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">IPO (chủ sở hữu)</p>
                <div className="grid grid-cols-3 gap-2">
                  <GameInput
                    label="Mã CK"
                    value={ipoSymbol}
                    onChange={(e) => setIpoSymbol(e.target.value)}
                    placeholder="EFLS"
                  />
                  <GameInput
                    label="Giá CP"
                    type="number"
                    value={ipoPrice}
                    onChange={(e) => setIpoPrice(e.target.value)}
                  />
                  <GameInput
                    label="Tổng CP"
                    type="number"
                    value={ipoShares}
                    onChange={(e) => setIpoShares(e.target.value)}
                  />
                </div>
                <GameButton
                  variant="primary"
                  onClick={() => ipoCompany.mutate(selectedCompany.id)}
                  disabled={ipoCompany.isPending || !ipoSymbol.trim()}
                >
                  {ipoCompany.isPending ? '...' : 'Niêm yết IPO'}
                </GameButton>
              </div>
            )}

            {canManage &&
              (selectedCompany.status === 'active' || selectedCompany.status === 'ipo') && (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-700">Cổ tức (chủ sở hữu)</p>
                  <div className="flex gap-2">
                    <GameInput
                      label="Số tiền / cổ phiếu"
                      type="number"
                      min={1}
                      value={divPerShare}
                      onChange={(e) => setDivPerShare(e.target.value)}
                    />
                    <div className="flex items-end">
                      <GameButton
                        variant="outline"
                        onClick={() => payDividend.mutate(selectedCompany.id)}
                        disabled={payDividend.isPending}
                      >
                        {payDividend.isPending ? '...' : 'Phát cổ tức'}
                      </GameButton>
                    </div>
                  </div>
                </div>
              )}

            {selectedCompany.status === 'ipo' && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                <p className="text-xs font-semibold text-amber-800">Thâu tóm (&gt;51% cổ phần)</p>
                <p className="text-[11px] text-slate-600">
                  Buyer phải sở hữu &gt;51% cổ phiếu công ty.
                </p>
                <GameInput
                  label="Character ID người thâu tóm (mặc định: bạn)"
                  value={takeoverBuyerId}
                  onChange={(e) => setTakeoverBuyerId(e.target.value)}
                  placeholder={me?.id ?? 'Character ID'}
                />
                <GameButton
                  variant="outline"
                  onClick={() => takeoverCompany.mutate(selectedCompany.id)}
                  disabled={takeoverCompany.isPending}
                >
                  {takeoverCompany.isPending ? '...' : 'Thực hiện thâu tóm'}
                </GameButton>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Cổ đông</p>
              {detailLoading ? (
                <p className="text-xs text-slate-500">Đang tải cổ đông...</p>
              ) : topShareholders.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có dữ liệu cổ đông.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-1 pr-2">Cổ đông</th>
                        <th className="py-1 pr-2 text-right">Cổ phần</th>
                        <th className="py-1 text-right">Tỉ lệ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topShareholders.map((s) => (
                        <tr key={s.characterId}>
                          <td className="py-1 pr-2">
                            {s.characterName}
                            {s.isOwner && (
                              <span className="ml-1 text-[10px] font-semibold text-emerald-700">
                                (CT)
                              </span>
                            )}
                            {s.isMe && (
                              <span className="ml-1 text-[10px] font-semibold text-sky-700">
                                (bạn)
                              </span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-right font-mono">
                            {s.shares.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-1 text-right font-mono">{s.percentage.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canManage && detail?.isOwner && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Nhân sự (chủ sở hữu)</p>
                {employeesLoading ? (
                  <p className="text-xs text-slate-500">Đang tải nhân sự...</p>
                ) : activeEmployees.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Chưa có nhân sự đang làm việc. (Hiện hỗ trợ xem/sa thải hợp đồng gắn công ty;
                    tuyển dụng tự động sẽ mở rộng thêm.)
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeEmployees.map((e) => (
                      <div
                        key={e.employmentId}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs"
                      >
                        <div>
                          <div className="font-medium text-slate-800">{e.characterName}</div>
                          <div className="text-slate-500">
                            {e.jobTitle} · {formatMoney(e.salary.amount)}/kỳ
                          </div>
                        </div>
                        <GameButton
                          variant="outline"
                          onClick={() =>
                            fireEmployee.mutate({
                              companyId: selectedCompany.id,
                              employmentId: e.employmentId,
                            })
                          }
                          disabled={fireEmployee.isPending}
                        >
                          Sa thải
                        </GameButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canManage && selectedCompany.status !== 'bankrupt' && (
              <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                <p className="text-xs font-semibold text-rose-800">Giải thể công ty</p>
                <p className="text-[11px] text-slate-600">
                  Chuyển công ty sang trạng thái phá sản/giải thể (không thể hoàn tác).
                </p>
                <GameButton
                  variant="outline"
                  onClick={() => {
                    if (
                      confirm(
                        `Giải thể "${selectedCompany.name}"? Hành động này không thể hoàn tác.`,
                      )
                    ) {
                      dissolveCompany.mutate(selectedCompany.id);
                    }
                  }}
                  disabled={dissolveCompany.isPending}
                >
                  {dissolveCompany.isPending ? '...' : 'Giải thể công ty'}
                </GameButton>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
