import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type {
  CompanyDto,
  CompanyEmployeesDto,
  CompanyHrAccountingDto,
  CompanyOverviewDto,
  CompanyPremisesOptionsDto,
  IndustryType,
} from '@efls/contracts';
import { apiRequest } from '../shared/api/httpClient';
import { formatCompact, formatMoney } from '../shared/lib/format';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { CCCDLookupInput } from '../shared/identity/CCCDLookupInput';
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

const ENTRY_TYPES = [
  { value: 'revenue', label: 'Doanh thu' },
  { value: 'opex', label: 'OPEX' },
  { value: 'payroll', label: 'Lương' },
  { value: 'tax', label: 'Thuế' },
  { value: 'adjustment', label: 'Điều chỉnh' },
  { value: 'fine', label: 'Phạt' },
  { value: 'bribe', label: 'Chi phí "lách luật"' },
  { value: 'other', label: 'Khác' },
] as const;

export function BusinessPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('technology_ai');
  const [capital, setCapital] = useState('10000000');
  const [premisesKey, setPremisesKey] = useState('');

  const [investAmount, setInvestAmount] = useState('1000000');
  const [ipoSymbol, setIpoSymbol] = useState('');
  const [ipoPrice, setIpoPrice] = useState('10000');
  const [ipoShares, setIpoShares] = useState('1000000');
  const [divPerShare, setDivPerShare] = useState('100');
  const [takeoverBuyerCccd, setTakeoverBuyerCccd] = useState('');
  const [revenueAmount, setRevenueAmount] = useState('5000000');
  const [revenueNote, setRevenueNote] = useState('');
  const [opexAmount, setOpexAmount] = useState('2000000');
  const [opexNote, setOpexNote] = useState('');

  // HR / AI recruitment
  const [roleFocus, setRoleFocus] = useState('Vận hành & kinh doanh');
  const [headcount, setHeadcount] = useState('3');

  // Ledger / tax
  const [entryType, setEntryType] = useState<(typeof ENTRY_TYPES)[number]['value']>('revenue');
  const [entryAmount, setEntryAmount] = useState('1000000');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [entryDesc, setEntryDesc] = useState('');
  const [entryEvasion, setEntryEvasion] = useState(false);
  const [filingPeriod, setFilingPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  });
  const [declareFull, setDeclareFull] = useState(true);
  const [declaredRevenueAdj, setDeclaredRevenueAdj] = useState('');
  const [declaredExpenseAdj, setDeclaredExpenseAdj] = useState('');
  const [filingNotes, setFilingNotes] = useState('');

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

  const { data: premisesOptions, isLoading: premisesLoading } = useQuery<CompanyPremisesOptionsDto>({
    queryKey: ['corporations', 'premises-options'],
    queryFn: () => apiRequest<CompanyPremisesOptionsDto>('/api/v1/corporations/premises-options'),
    enabled: createOpen,
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

  const { data: hrAcc, isLoading: hrAccLoading } = useQuery<CompanyHrAccountingDto>({
    queryKey: ['corporations', 'hr-accounting', selectedId],
    queryFn: () =>
      apiRequest<CompanyHrAccountingDto>(`/api/v1/corporations/${selectedId}/hr-accounting`),
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

  const premisesMap = useMemo(() => {
    const m = new Map<string, { type: 'land_core' | 'land_province' | 'company_property'; id: string }>();
    for (const o of premisesOptions?.land ?? []) m.set(`${o.type}:${o.id}`, { type: o.type, id: o.id });
    for (const o of premisesOptions?.companyProperties ?? []) m.set(`${o.type}:${o.id}`, { type: o.type, id: o.id });
    return m;
  }, [premisesOptions]);

  const createCompany = useMutation({
    mutationFn: () => {
      const selected = premisesMap.get(premisesKey);
      if (!selected) throw new Error('Vui lòng chọn địa điểm/cơ sở để thành lập công ty.');
      const premises =
        selected.type === 'land_core'
          ? { type: 'land_core' as const, corePropertyId: selected.id }
          : selected.type === 'land_province'
            ? { type: 'land_province' as const, provinceLandPropertyId: selected.id }
            : { type: 'company_property' as const, companyPropertyId: selected.id };
      return apiRequest<CompanyDto>('/api/v1/corporations', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          industry,
          initialCapital: money(Number(capital) || 0),
          premises,
        }),
      });
    },
    onSuccess: async (c) => {
      toast({ title: 'Đã thành lập công ty', description: `Công ty "${c.name}" đã được tạo.` });
      setCreateOpen(false);
      setName('');
      setPremisesKey('');
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['corporations', 'premises-options'] }),
      ]);
      setSelectedId(c.id);
    },
    onError: (e: any) =>
      toast({ title: 'Thành lập thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
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
        body: JSON.stringify({ buyerCccd: takeoverBuyerCccd.replace(/\s+/g,'') || (me as any)?.cccd.trim() || me?.id }),
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

  const createHiringPlan = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/v1/corporations/${companyId}/hiring-plans`, {
        method: 'POST',
        body: JSON.stringify({
          roleFocus: roleFocus.trim() || 'Vận hành',
          headcount: Math.max(1, Math.min(20, Number(headcount) || 3)),
        }),
      }),
    onSuccess: async () => {
      toast({
        title: 'AI đã đề xuất ứng viên',
        description: 'Danh sách ứng viên đã sẵn sàng để bạn duyệt.',
      });
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Tạo kế hoạch thất bại', description: e.message, variant: 'error' }),
  });

  const decideCandidate = useMutation({
    mutationFn: (input: {
      companyId: string;
      planId: string;
      candidateId: string;
      decision: 'approved' | 'rejected';
    }) =>
      apiRequest(
        `/api/v1/corporations/${input.companyId}/hiring-plans/${input.planId}/candidates/${input.candidateId}/decision`,
        { method: 'POST', body: JSON.stringify({ decision: input.decision }) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Cập nhật thất bại', description: e.message, variant: 'error' }),
  });

  const applyHiringPlan = useMutation({
    mutationFn: (input: { companyId: string; planId: string }) =>
      apiRequest(`/api/v1/corporations/${input.companyId}/hiring-plans/${input.planId}/apply`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      toast({ title: 'Đã tuyển dụng', description: 'Các ứng viên đã duyệt đã được tuyển.' });
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Áp dụng thất bại', description: e.message, variant: 'error' }),
  });

  const fireStaff = useMutation({
    mutationFn: (input: { companyId: string; staffId: string }) =>
      apiRequest(`/api/v1/corporations/${input.companyId}/staff/${input.staffId}/fire`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      toast({ title: 'Đã sa thải', description: 'Nhân sự AI-tuyển đã được chấm dứt.' });
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Sa thải thất bại', description: e.message, variant: 'error' }),
  });

  const addLedgerEntry = useMutation({
    mutationFn: (companyId: string) => {
      const amt = Number(entryAmount) || 0;
      const dec = declaredAmount.trim() ? Number(declaredAmount) : undefined;
      return apiRequest(`/api/v1/corporations/${companyId}/ledger`, {
        method: 'POST',
        body: JSON.stringify({
          entryType,
          amount: money(amt),
          declaredAmount: dec != null ? money(dec) : undefined,
          description: entryDesc.trim() || undefined,
          isEvasion: entryEvasion || (dec != null && dec !== amt),
          applyToCash: true,
        }),
      });
    },
    onSuccess: async () => {
      toast({ title: 'Đã ghi sổ', description: 'Bút toán đã được ghi nhận.' });
      setEntryDesc('');
      await invalidate();
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Ghi sổ thất bại', description: e.message, variant: 'error' }),
  });

  const createFiling = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/v1/corporations/${companyId}/tax-filings`, {
        method: 'POST',
        body: JSON.stringify({
          period: filingPeriod.trim(),
          declareFull,
          adjustmentDeclaredRevenue: declaredRevenueAdj.trim()
            ? money(Number(declaredRevenueAdj))
            : undefined,
          adjustmentDeclaredExpense: declaredExpenseAdj.trim()
            ? money(Number(declaredExpenseAdj))
            : undefined,
          notes: filingNotes.trim() || undefined,
        }),
      }),
    onSuccess: async () => {
      toast({
        title: 'Đã nộp khai thuế',
        description: 'Hồ sơ khai thuế doanh nghiệp đã được ghi nhận.',
      });
      setFilingNotes('');
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Khai thuế thất bại', description: e.message, variant: 'error' }),
  });

  const topShareholders = useMemo(() => detail?.shareholders ?? [], [detail]);
  const activeEmployees = (employeesData?.employees ?? []).filter((e) => e.status === 'active');
  const plans = hrAcc?.plans ?? [];
  const staff = hrAcc?.staff?.filter((s) => s.status === 'active') ?? [];
  const ledger = hrAcc?.ledger;
  const filings = hrAcc?.filings ?? [];

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
          description="Thành lập, vận hành, tuyển dụng AI (duyệt), sổ cái/kế toán & khai thuế, đầu tư, IPO, cổ tức, thâu tóm, giải thể. Server authoritative."
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
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
                    <span className="font-medium text-slate-800 break-words">{c.name}</span>
                    <span className="shrink-0">{statusBadge(c.status)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">{industryLabel(c.industry)}</span>
                    <span className="shrink-0">{formatCompact(c.valuation.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <div className="min-w-0 xl:col-span-2">
          <Panel title="Thị trường doanh nghiệp" borderColor="default">
            {companies.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có công ty nào được thành lập.</p>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <table className="min-w-[680px] w-full text-sm">
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thành lập công ty" size="lg">
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

          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <label className="text-[11px] uppercase tracking-wider text-slate-600">Địa điểm / cơ sở công ty (bắt buộc)</label>
            <p className="text-[11px] text-slate-500">
              Khi thành lập công ty, bạn phải có <b>đất nền</b> để xây dựng công ty hoặc <b>bất động sản đã xây dựng thuộc công ty khác</b> để đặt trụ sở.
              Có thể mua/đấu giá và sở hữu đất nền tại trang <b>Thành phố</b>, sau đó quay lại đây để chọn.
            </p>
            <select
              value={premisesKey}
              onChange={(e) => setPremisesKey(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              required
            >
              <option value="">{premisesLoading ? 'Đang tải địa điểm khả dụng...' : '-- Chọn đất nền / trụ sở --'}</option>
              {(premisesOptions?.land?.length ?? 0) > 0 && (
                <optgroup label="Đất nền đang sở hữu (xây dựng công ty)">
                  {(premisesOptions?.land ?? []).map((o) => (
                    <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {(premisesOptions?.companyProperties?.length ?? 0) > 0 && (
                <optgroup label="Bất động sản thuộc công ty khác (đặt trụ sở)">
                  {(premisesOptions?.companyProperties ?? []).map((o) => (
                    <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {!premisesLoading && (premisesOptions?.land?.length ?? 0) === 0 && (premisesOptions?.companyProperties?.length ?? 0) === 0 && (
              <p className="text-[11px] text-amber-700">
                Bạn chưa có địa điểm phù hợp. Hãy sở hữu một lô <b>đất nền trống</b> (trang Thành phố / bản đồ tỉnh-thành) hoặc chọn một <b>bất động sản đã xây dựng thuộc công ty khác</b> đang khả dụng.
              </p>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            Vốn sẽ được trừ từ ví cá nhân của bạn khi thành lập.
          </p>
          <div className="flex justify-end">
            <GameButton
              variant="primary"
              type="submit"
              disabled={createCompany.isPending || !name.trim() || !premisesKey}
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
        size="2xl"
      >
        {!selectedCompany ? (
          <p className="text-sm text-slate-500">
            {detailLoading ? 'Đang tải...' : 'Không tìm thấy công ty.'}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Ngành</span><div className="font-medium text-right sm:text-left">{industryLabel(selectedCompany.industry)}</div></div>
              <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Chủ sở hữu</span><div className="font-medium text-right sm:text-left break-words">{selectedCompany.ownerName}</div></div>
              <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Trạng thái</span><div>{statusBadge(selectedCompany.status)}</div></div>
              <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Mã CK</span><div className="font-mono">{selectedCompany.tickerSymbol ?? '—'}</div></div>
              <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Định giá</span><div className="font-mono text-right sm:text-left">{formatMoney(selectedCompany.valuation.amount)}</div></div>
              <div className="flex justify-between gap-2 sm:block"><span className="text-slate-500">Quỹ công ty</span><div className="font-mono text-right sm:text-left">{formatMoney(selectedCompany.cash.amount)}</div></div>
              <div className="flex justify-between gap-2 sm:col-span-2 sm:block"><span className="text-slate-500">Địa điểm/cơ sở</span><div className="font-medium text-right sm:text-left break-words">{selectedCompany.premises?.label ?? '— (công ty cũ, chưa gắn địa điểm)'}</div></div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700">Đầu tư vốn</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <GameInput
                    label="Số tiền (VND)"
                    type="number"
                    min={1}
                    value={investAmount}
                    onChange={(e) => setInvestAmount(e.target.value)}
                  />
                </div>
                <GameButton
                  variant="primary"
                  onClick={() => investCompany.mutate(selectedCompany.id)}
                  disabled={investCompany.isPending || selectedCompany.status !== 'active'}
                >
                  {investCompany.isPending ? '...' : 'Đầu tư'}
                </GameButton>
              </div>
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
              </div>
            )}

            {canManage && detail?.isOwner && (
              <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-sky-900">
                    Tuyển dụng AI (AI sắp xếp, bạn duyệt)
                  </p>
                  {hrAccLoading && <span className="text-[11px] text-slate-500">Đang tải...</span>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_auto] sm:items-end">
                  <GameInput
                    label="Nhu cầu/vị trí"
                    value={roleFocus}
                    onChange={(e) => setRoleFocus(e.target.value)}
                    placeholder="VD: Kế toán, bán hàng..."
                  />
                  <GameInput
                    label="Số lượng"
                    type="number"
                    min={1}
                    max={20}
                    value={headcount}
                    onChange={(e) => setHeadcount(e.target.value)}
                  />
                  <GameButton
                    variant="primary"
                    onClick={() => createHiringPlan.mutate(selectedCompany.id)}
                    disabled={createHiringPlan.isPending || selectedCompany.status === 'bankrupt'}
                    className="w-full sm:w-auto"
                  >
                    {createHiringPlan.isPending ? 'AI đang sắp...' : 'Nhờ AI đề xuất'}
                  </GameButton>
                </div>
                <p className="text-[11px] text-slate-600">
                  AI chỉ đề xuất ứng viên; bạn cần duyệt từng người và bấm “Áp dụng tuyển” để tuyển
                  chính thức.
                </p>

                {plans.slice(0, 3).map((plan) => (
                  <div
                    key={plan.id}
                    className="space-y-2 rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-800">
                        Kế hoạch: {plan.roleFocus} · {plan.headcount} người
                      </span>
                      <Badge
                        variant={
                          plan.status === 'applied'
                            ? 'success'
                            : plan.status === 'pending'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        {plan.status}
                      </Badge>
                    </div>
                    {plan.rationale && (
                      <p className="text-[11px] text-slate-600">{plan.rationale}</p>
                    )}
                    <div className="space-y-1.5">
                      {plan.candidates.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800">
                              {c.fullName} · {c.roleTitle} ({c.seniority})
                            </div>
                            <div className="text-slate-500">
                              Lương đề xuất: {formatMoney(c.proposedSalary.amount)} · Fit:{' '}
                              {c.fitScore}/100
                            </div>
                            {c.riskNote && (
                              <div className="text-[11px] text-amber-700">Rủi ro: {c.riskNote}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={
                                c.status === 'approved' || c.status === 'hired'
                                  ? 'success'
                                  : c.status === 'rejected'
                                    ? 'error'
                                    : 'default'
                              }
                            >
                              {c.status}
                            </Badge>
                            {plan.status !== 'applied' && c.status !== 'hired' && (
                              <>
                                <GameButton
                                  variant="primary"
                                  onClick={() =>
                                    decideCandidate.mutate({
                                      companyId: selectedCompany.id,
                                      planId: plan.id,
                                      candidateId: c.id,
                                      decision: 'approved',
                                    })
                                  }
                                  disabled={decideCandidate.isPending}
                                >
                                  Duyệt
                                </GameButton>
                                <GameButton
                                  variant="outline"
                                  onClick={() =>
                                    decideCandidate.mutate({
                                      companyId: selectedCompany.id,
                                      planId: plan.id,
                                      candidateId: c.id,
                                      decision: 'rejected',
                                    })
                                  }
                                  disabled={decideCandidate.isPending}
                                >
                                  Từ chối
                                </GameButton>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {plan.status !== 'applied' && (
                      <GameButton
                        variant="primary"
                        onClick={() =>
                          applyHiringPlan.mutate({ companyId: selectedCompany.id, planId: plan.id })
                        }
                        disabled={applyHiringPlan.isPending}
                      >
                        {applyHiringPlan.isPending ? '...' : 'Áp dụng tuyển (ứng viên đã duyệt)'}
                      </GameButton>
                    )}
                  </div>
                ))}
                {plans.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    Chưa có kế hoạch tuyển dụng AI. Nhấn “Nhờ AI đề xuất”.
                  </p>
                )}

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-700">Nhân sự đã tuyển (AI)</p>
                  {staff.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Chưa có nhân sự AI-tuyển đang làm việc.
                    </p>
                  ) : (
                    staff.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs border border-slate-100"
                      >
                        <div>
                          <div className="font-medium text-slate-800">{s.fullName}</div>
                          <div className="text-slate-500">
                            {s.roleTitle} · {formatMoney(s.salary.amount)}/kỳ
                          </div>
                        </div>
                        <GameButton
                          variant="outline"
                          onClick={() =>
                            fireStaff.mutate({ companyId: selectedCompany.id, staffId: s.id })
                          }
                          disabled={fireStaff.isPending}
                        >
                          Sa thải
                        </GameButton>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {canManage && detail?.isOwner && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-3">
                <p className="text-xs font-semibold text-amber-900">
                  Sổ cái / Kế toán & Khai thuế (trốn thuế, lách luật)
                </p>
                {ledger && (
                  <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                    <div>
                      Doanh thu thực tế: <b>{formatMoney(ledger.totals.revenue.amount)}</b>
                    </div>
                    <div>
                      Chi phí thực tế: <b>{formatMoney(ledger.totals.expense.amount)}</b>
                    </div>
                    <div>
                      Lợi nhuận: <b>{formatMoney(ledger.totals.profit.amount)}</b>
                    </div>
                    <div>
                      Khai DT: <b>{formatMoney(ledger.totals.declaredRevenue.amount)}</b>
                    </div>
                    <div>
                      Khai CP: <b>{formatMoney(ledger.totals.declaredExpense.amount)}</b>
                    </div>
                    <div>
                      Chênh lệch (tax gap):{' '}
                      <b className="text-rose-700">{formatMoney(ledger.totals.taxGap.amount)}</b>
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Ghi bút toán (có thể khai báo khác thực tế)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] uppercase tracking-wider text-slate-500">
                        Loại
                      </label>
                      <select
                        value={entryType}
                        onChange={(e) => setEntryType(e.target.value as any)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
                      >
                        {ENTRY_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <GameInput
                      label="Số tiền thực tế (VND)"
                      type="number"
                      min={0}
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(e.target.value)}
                    />
                    <GameInput
                      label="Số tiền khai báo (để trống = như thực tế)"
                      type="number"
                      min={0}
                      value={declaredAmount}
                      onChange={(e) => setDeclaredAmount(e.target.value)}
                    />
                    <GameInput
                      label="Diễn giải"
                      value={entryDesc}
                      onChange={(e) => setEntryDesc(e.target.value)}
                      placeholder="Hóa đơn, ghi chú..."
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={entryEvasion}
                      onChange={(e) => setEntryEvasion(e.target.checked)}
                    />
                    Đánh dấu khai báo lệch/trốn thuế/lách luật (tăng rủi ro kiểm toán)
                  </label>
                  <GameButton
                    variant="primary"
                    onClick={() => addLedgerEntry.mutate(selectedCompany.id)}
                    disabled={addLedgerEntry.isPending || selectedCompany.status === 'bankrupt'}
                  >
                    {addLedgerEntry.isPending ? '...' : 'Ghi sổ & áp dụng quỹ'}
                  </GameButton>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Lập hồ sơ khai thuế doanh nghiệp
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <GameInput
                      label="Kỳ kê khai"
                      value={filingPeriod}
                      onChange={(e) => setFilingPeriod(e.target.value)}
                      placeholder="2026-Q1"
                    />
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 mt-5">
                      <input
                        type="checkbox"
                        checked={declareFull}
                        onChange={(e) => setDeclareFull(e.target.checked)}
                      />
                      Khai đúng toàn bộ theo sổ (bỏ chọn để tự khai lệch)
                    </label>
                    <GameInput
                      label="Doanh thu khai (tùy chọn)"
                      type="number"
                      value={declaredRevenueAdj}
                      onChange={(e) => setDeclaredRevenueAdj(e.target.value)}
                      placeholder="Để trống = theo sổ/khai full"
                    />
                    <GameInput
                      label="Chi phí khai (tùy chọn)"
                      type="number"
                      value={declaredExpenseAdj}
                      onChange={(e) => setDeclaredExpenseAdj(e.target.value)}
                      placeholder="Để trống = theo sổ/khai full"
                    />
                  </div>
                  <GameInput
                    label="Ghi chú/lý do"
                    value={filingNotes}
                    onChange={(e) => setFilingNotes(e.target.value)}
                    placeholder="Giải trình, chi phí hợp lệ..."
                  />
                  <p className="text-[11px] text-slate-500">
                    Thuế tạm tính 10% trên (DT khai - CP khai). Khai lệch làm tăng điểm rủi ro kiểm
                    toán.
                  </p>
                  <GameButton
                    variant="primary"
                    onClick={() => createFiling.mutate(selectedCompany.id)}
                    disabled={createFiling.isPending || selectedCompany.status === 'bankrupt'}
                  >
                    {createFiling.isPending ? '...' : 'Nộp hồ sơ khai thuế'}
                  </GameButton>
                </div>

                {filings.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-700">
                      Hồ sơ khai thuế gần đây
                    </p>
                    {filings.slice(0, 5).map((f) => (
                      <div
                        key={f.id}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{f.period}</span>
                          <Badge
                            variant={
                              f.riskScore >= 60
                                ? 'error'
                                : f.riskScore >= 30
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            Rủi ro {f.riskScore}
                          </Badge>
                        </div>
                        <div className="text-slate-600">
                          Thuế: {formatMoney(f.taxDue.amount)} · DT khai/thực:{' '}
                          {formatMoney(f.declaredRevenue.amount)}/
                          {formatMoney(f.actualRevenue.amount)} · CP khai/thực:{' '}
                          {formatMoney(f.declaredExpense.amount)}/
                          {formatMoney(f.actualExpense.amount)}
                        </div>
                        {f.notes && <div className="text-slate-500">{f.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {ledger && ledger.entries.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-700">Bút toán gần đây</p>
                    <div className="max-h-40 overflow-auto space-y-1">
                      {ledger.entries.slice(0, 10).map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1 text-[11px] border border-slate-100"
                        >
                          <div>
                            <span className="font-medium">{e.entryType}</span> ·{' '}
                            {e.description || '—'}
                            {e.isEvasion && <span className="ml-1 text-rose-700">(lệch khai)</span>}
                          </div>
                          <div className="text-right">
                            <div>TT: {formatMoney(e.amount.amount)}</div>
                            <div className="text-slate-500">
                              Khai: {formatMoney(e.declaredAmount.amount)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {canManage && detail?.isOwner && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Nhân sự (hợp đồng)</p>
                {employeesLoading ? (
                  <p className="text-xs text-slate-500">Đang tải...</p>
                ) : activeEmployees.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có nhân sự hợp đồng đang làm việc.</p>
                ) : (
                  activeEmployees.map((e) => (
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
                  ))
                )}
              </div>
            )}

            {canManage && selectedCompany.status === 'active' && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">IPO (chủ sở hữu)</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <GameInput
                        label="Số tiền / cổ phiếu"
                        type="number"
                        min={1}
                        value={divPerShare}
                        onChange={(e) => setDivPerShare(e.target.value)}
                      />
                    </div>
                    <GameButton
                      variant="outline"
                      onClick={() => payDividend.mutate(selectedCompany.id)}
                      disabled={payDividend.isPending}
                      className="w-full sm:w-auto"
                    >
                      {payDividend.isPending ? '...' : 'Phát cổ tức'}
                    </GameButton>
                  </div>
                </div>
              )}

            {selectedCompany.status === 'ipo' && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                <p className="text-xs font-semibold text-amber-800">Thâu tóm (&gt;51% cổ phần)</p>
                <CCCDLookupInput
                  label="CCCD người thâu tóm (để trống nếu là bạn)"
                  value={takeoverBuyerCccd}
                  onChange={setTakeoverBuyerCccd}
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
                <div className="overflow-auto max-h-[50vh]">
                  <table className="min-w-[360px] w-full text-xs">
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
                    )
                      dissolveCompany.mutate(selectedCompany.id);
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
