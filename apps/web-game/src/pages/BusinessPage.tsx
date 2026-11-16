import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
  const [relocatePremisesKey, setRelocatePremisesKey] = useState('');

  const [investAmount, setInvestAmount] = useState('1000000');
  const [ipoSymbol, setIpoSymbol] = useState('');
  const [ipoPrice, setIpoPrice] = useState('10000');
  const [ipoShares, setIpoShares] = useState('1000000');
  const [takeoverBuyerCccd, setTakeoverBuyerCccd] = useState('');
  const [opexAmount, setOpexAmount] = useState('2000000');
  const [opexNote, setOpexNote] = useState('');

  // HR / AI recruitment
  const [roleFocus, setRoleFocus] = useState('Vận hành & kinh doanh');
  const [headcount, setHeadcount] = useState('3');

  // Ledger / tax
  const [entryType, setEntryType] = useState<(typeof ENTRY_TYPES)[number]['value']>('opex');
  const [entryAmount, setEntryAmount] = useState('1000000');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [entryDesc, setEntryDesc] = useState('');
  const [entryEvasion, setEntryEvasion] = useState(false);
  const [filingPeriod, setFilingPeriod] = useState('');
  const [declaredRevenueInput, setDeclaredRevenueInput] = useState('0');
  const [filingNotes, setFilingNotes] = useState('');
  const [usePersonalFundsForShortfall, setUsePersonalFundsForShortfall] = useState(false);
  const [retainPctInput, setRetainPctInput] = useState('0');
  const [offerTotalShares, setOfferTotalShares] = useState('100000');
  const [offerPrice, setOfferPrice] = useState('10000');
  const [offerHours, setOfferHours] = useState('24');
  const [buyOfferShares, setBuyOfferShares] = useState<Record<string, string>>({});
  const [suggestionPlan, setSuggestionPlan] = useState<any | null>(null);

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
  useEffect(() => { setSuggestionPlan(null); }, [selectedId]);

  useEffect(() => {
    if (detail && typeof (detail as any).revenueRetainPct === 'number') {
      setRetainPctInput(String((detail as any).revenueRetainPct));
    }
  }, [detail?.id, (detail as any)?.revenueRetainPct]);

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

  const { data: shareOfferings } = useQuery<any[]>({
    queryKey: ['corporations', 'share-offerings', selectedId],
    queryFn: () => apiRequest<any[]>(`/api/v1/corporations/${selectedId}/share-offerings`),
    enabled: !!selectedId,
  });
  const { data: marketOfferings } = useQuery<any[]>({
    queryKey: ['corporations', 'share-offerings', 'market'],
    queryFn: () => apiRequest<any[]>('/api/v1/corporations/share-offerings'),
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

  const relocatePremises = useMutation({
    mutationFn: (companyId: string) => {
      const selected = premisesMap.get(relocatePremisesKey);
      if (!selected) throw new Error('Vui lòng chọn trụ sở mới cho công ty.');
      const premises =
        selected.type === 'land_core'
          ? { type: 'land_core' as const, corePropertyId: selected.id }
          : selected.type === 'land_province'
            ? { type: 'land_province' as const, provinceLandPropertyId: selected.id }
            : { type: 'company_property' as const, companyPropertyId: selected.id };
      return apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/premises`, {
        method: 'POST',
        body: JSON.stringify({ premises }),
      });
    },
    onSuccess: async (c) => {
      toast({ title: 'Đã chọn trụ sở mới', description: `${c.name}: ${c.premises?.label ?? 'Đã cập nhật địa điểm công ty.'}` });
      setRelocatePremisesKey('');
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['corporations', 'premises-options'] }),
        queryClient.invalidateQueries({ queryKey: ['corporations', c.id] }),
      ]);
    },
    onError: (e: any) =>
      toast({ title: 'Không thể chọn trụ sở mới', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const investCompany = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyDto>(`/api/v1/corporations/${companyId}/invest`, {
        method: 'POST',
        body: JSON.stringify({ amount: money(Number(investAmount) || 0) }),
      }),
    onSuccess: async (c) => {
      toast({ title: 'Nạp vốn thành công', description: `Đã bơm quỹ cho "${c.name}".` });
      await invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Nạp vốn thất bại', description: e.message, variant: 'error' }),
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
      apiRequest<any>(`/api/v1/corporations/${companyId}/hiring-plans`, {
        method: 'POST',
        body: JSON.stringify({
          roleFocus: roleFocus.trim() || 'Vận hành',
          headcount: Math.max(1, Math.min(20, Number(headcount) || 3)),
        }),
      }),
    onSuccess: async (plan) => {
      setSuggestionPlan(plan);
      toast({ title: 'AI đã đề xuất ứng viên', description: 'Phiên gợi ý tạm thời đã sẵn sàng (sẽ mất khi tuyển/từ chối xong hoặc đóng).' });
    },
    onError: (e: Error) =>
      toast({ title: 'Tạo kế hoạch thất bại', description: e.message, variant: 'error' }),
  });

  const decideCandidate = useMutation({
    mutationFn: (input: { companyId: string; planId: string; candidateId: string; decision: 'approved' | 'rejected' }) =>
      apiRequest<{ plan: any | null }>(
        `/api/v1/corporations/${input.companyId}/hiring-plans/${input.planId}/candidates/${input.candidateId}/decision`,
        { method: 'POST', body: JSON.stringify({ decision: input.decision }) },
      ),
    onSuccess: async (res, vars) => {
      setSuggestionPlan(res?.plan ?? null);
      if (vars.decision === 'rejected') toast({ title: 'Đã từ chối ứng viên', description: 'Gợi ý đã được loại bỏ.' });
    },
    onError: (e: Error) => toast({ title: 'Cập nhật thất bại', description: e.message, variant: 'error' }),
  });

  const applyHiringPlan = useMutation({
    mutationFn: (input: { companyId: string; planId: string }) =>
      apiRequest<{ hired: number; plan: null }>(`/api/v1/corporations/${input.companyId}/hiring-plans/${input.planId}/apply`, { method: 'POST' }),
    onSuccess: async (res) => {
      setSuggestionPlan(null);
      toast({ title: 'Đã tuyển dụng', description: `Đã tuyển ${res?.hired ?? 0} ứng viên. Gợi ý tạm đã được xóa.` });
      await queryClient.invalidateQueries({ queryKey: ['corporations', 'hr-accounting', selectedId] });
    },
    onError: (e: Error) => toast({ title: 'Áp dụng thất bại', description: e.message, variant: 'error' }),
  });

  const dismissHiringPlan = useMutation({
    mutationFn: (input: { companyId: string; planId: string }) =>
      apiRequest(`/api/v1/corporations/${input.companyId}/hiring-plans/${input.planId}/dismiss`, { method: 'POST' }),
    onSuccess: async () => {
      setSuggestionPlan(null);
      toast({ title: 'Đã đóng gợi ý', description: 'Phiên gợi ý AI đã được xóa.' });
    },
    onError: (e: Error) => toast({ title: 'Đóng gợi ý thất bại', description: e.message, variant: 'error' }),
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
          period: filingPeriod.trim() || undefined,
          declaredRevenue: money(Number(declaredRevenueInput) || 0),
          usePersonalFundsForShortfall,
          notes: filingNotes.trim() || undefined,
        }),
      }),
    onSuccess: async () => {
      toast({
        title: 'Đã nộp khai thuế kỳ 30 ngày',
        description: 'Đã nộp thuế và hệ thống tự động xử lý chia cổ tức (nếu có).',
      });
      setFilingNotes('');
      await invalidate();
      await queryClient.invalidateQueries({
        queryKey: ['corporations', 'hr-accounting', selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Khai thuế thất bại', description: e.message, variant: 'error' }),
  });

  const setRevenueRetain = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/v1/corporations/${companyId}/revenue-retain`, {
        method: 'PUT',
        body: JSON.stringify({ retainPct: Number(retainPctInput) || 0 }),
      }),
    onSuccess: async () => {
      toast({ title: 'Đã cập nhật tỉ lệ giữ lại doanh thu', description: 'Áp dụng cho các kỳ chốt 30 ngày tiếp theo.' });
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['corporations', 'detail', selectedId] });
    },
    onError: (e: Error) => toast({ title: 'Cập nhật thất bại', description: e.message, variant: 'error' }),
  });

  const createShareOffering = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/v1/corporations/${companyId}/share-offerings`, {
        method: 'POST',
        body: JSON.stringify({
          totalShares: Number(offerTotalShares) || 0,
          pricePerShare: money(Number(offerPrice) || 0),
          durationHours: Number(offerHours) || 0,
        }),
      }),
    onSuccess: async () => {
      toast({ title: 'Đã tạo đợt chào bán cổ phần', description: 'Người mua có thể mua theo cơ chế ai trước được trước.' });
      await queryClient.invalidateQueries({ queryKey: ['corporations', 'share-offerings'] });
      await invalidate();
    },
    onError: (e: Error) => toast({ title: 'Tạo đợt chào bán thất bại', description: e.message, variant: 'error' }),
  });

  const buyShareOffering = useMutation({
    mutationFn: ({ offeringId, shares }: { offeringId: string; shares: number }) =>
      apiRequest(`/api/v1/corporations/share-offerings/${offeringId}/buy`, {
        method: 'POST',
        body: JSON.stringify({ shares }),
      }),
    onSuccess: async () => {
      toast({ title: 'Mua cổ phần thành công', description: 'Tiền đã chuyển vào quỹ công ty và tỉ lệ cổ đông được cập nhật.' });
      await queryClient.invalidateQueries({ queryKey: ['corporations'] });
      await queryClient.invalidateQueries({ queryKey: ['characters', 'me'] });
    },
    onError: (e: Error) => toast({ title: 'Mua cổ phần thất bại', description: e.message, variant: 'error' }),
  });

  const topShareholders = useMemo(() => detail?.shareholders ?? [], [detail]);
  const activeEmployees = (employeesData?.employees ?? []).filter((e) => e.status === 'active');
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thành lập công ty" size="2xl">
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

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-600">Địa điểm / cơ sở công ty (bắt buộc)</label>
                <p className="mt-1 text-[11px] text-slate-500">
                  Chọn <b>đất nền đang sở hữu</b> (bao gồm đất trống hoặc trụ sở đã hợp thửa ≥ 2 ô liền nhau và xây dựng “Công ty”) hoặc chọn <b>bất động sản đã xây dựng thuộc công ty khác</b> để đặt trụ sở.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['corporations', 'premises-options'] })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">Làm mới</button>
              </div>
            </div>

            {premisesLoading ? (
              <p className="text-xs text-slate-500">Đang tải địa điểm khả dụng từ bất động sản/bản đồ...</p>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Chọn địa điểm/cơ sở (combo box)</label>
                <select
                  value={premisesKey}
                  onChange={(e) => setPremisesKey(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">-- Chọn địa điểm thành lập công ty --</option>
                  <optgroup label="Đất nền / trụ sở đã hợp thửa & xây dựng công ty (sở hữu của bạn)">
                    {(premisesOptions?.land ?? []).length === 0 ? (
                      <option value="" disabled>Không có đất nền hoặc trụ sở công ty (≥ 2 ô liền nhau, đã xây dựng &quot;Công ty&quot;) phù hợp</option>
                    ) : (
                      (premisesOptions?.land ?? []).map((o) => {
                        const key = `${o.type}:${o.id}`;
                        const suffix = o.type === 'land_province'
                          ? ` · ${o.provinceName ?? o.provinceCode ?? 'Tỉnh/thành'}`
                          : ' · Hà Nội';
                        return <option key={key} value={key}>{o.label}{suffix}</option>;
                      })
                    )}
                  </optgroup>
                  <optgroup label="Bất động sản thuộc công ty khác (đặt trụ sở)">
                    {(premisesOptions?.companyProperties ?? []).length === 0 ? (
                      <option value="" disabled>Không có bất động sản công ty khác khả dụng</option>
                    ) : (
                      (premisesOptions?.companyProperties ?? []).map((o) => {
                        const key = `${o.type}:${o.id}`;
                        return <option key={key} value={key}>{o.label}{o.hostCompanyName ? ` · ${o.hostCompanyName}` : ''}</option>;
                      })
                    )}
                  </optgroup>
                </select>
                <div className="text-[11px] text-slate-500">
                  Bao gồm: đất nền trống đang sở hữu và <b>ô đất hợp thửa từ 2 ô liền nhau trở lên đã xây dựng “Công ty (trụ sở)”</b> (tại Thành phố/Bản đồ) hoặc bất động sản đã xây dựng thuộc công ty khác.
                </div>
                {premisesKey && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800">
                    Đã chọn: <b>{(() => {
                      const all = [...(premisesOptions?.land ?? []), ...(premisesOptions?.companyProperties ?? [])];
                      const found = all.find((o) => `${o.type}:${o.id}` === premisesKey);
                      return found?.label ?? premisesKey;
                    })()}</b>
                  </div>
                )}
              </div>
            )}

            {!premisesLoading && (premisesOptions?.land?.length ?? 0) === 0 && (premisesOptions?.companyProperties?.length ?? 0) === 0 && (
              <p className="text-[11px] text-amber-700">
                Chưa có địa điểm khả dụng. Hãy sở hữu đất nền/trụ sở công ty (đã hợp thửa và xây dựng) hoặc sử dụng bất động sản đã xây dựng thuộc công ty khác.
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
              <div className="flex justify-between gap-2 sm:col-span-2 sm:block"><span className="text-slate-500">Địa điểm/cơ sở</span><div className="font-medium text-right sm:text-left break-words">
                <div>{selectedCompany.premises?.label ?? '— (công ty cũ, chưa gắn địa điểm)'}</div>
                {selectedCompany.premises && (
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {selectedCompany.premises.type === 'company_property' ? (
                      <>Liên kết Bất động sản (thuộc công ty: {selectedCompany.premises.hostCompanyName ?? '—'}) · <Link to="/real-estate" className="underline text-emerald-700">Mở Bất động sản</Link></>
                    ) : (
                      <>Liên kết Thành phố/Bản đồ{selectedCompany.premises.provinceCode ? ` · Tỉnh/thành: ${selectedCompany.premises.provinceCode}` : ''} · <Link to="/" className="underline text-emerald-700">Mở Thành phố/Bản đồ</Link></>
                    )}
                  </div>
                )}
                {selectedCompany.isOwner && selectedCompany.premises?.needsReselection && selectedCompany.status !== 'bankrupt' && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-left text-[11px] text-amber-900 space-y-2">
                    <div className="font-semibold">⚠️ Cần chọn trụ sở mới cho công ty</div>
                    <div>{selectedCompany.premises.invalidReason || 'Công trình/địa điểm trụ sở đã bị phá dỡ hoặc không còn hợp lệ.'}</div>
                    <div className="text-[10px] text-amber-800">Chọn từ dữ liệu bất động sản đang sở hữu (lọc <b>lô gốc</b>, không gồm lô thành viên đã hợp thửa), tương tự lựa chọn tài sản khi vay.</div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <select
                        className="flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                        value={relocatePremisesKey}
                        onChange={(e) => setRelocatePremisesKey(e.target.value)}
                      >
                        <option value="">-- Chọn trụ sở mới --</option>
                        <optgroup label="Đất nền / trụ sở công ty (sở hữu, lô gốc)">
                          {(premisesOptions?.land ?? []).map((o) => (
                            <option key={`reloc-${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Bất động sản thuộc công ty khác">
                          {(premisesOptions?.companyProperties ?? []).map((o) => (
                            <option key={`reloc-${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.label}</option>
                          ))}
                        </optgroup>
                      </select>
                      <button
                        type="button"
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        disabled={relocatePremises.isPending || !relocatePremisesKey}
                        onClick={() => relocatePremises.mutate(selectedCompany.id)}
                      >
                        {relocatePremises.isPending ? 'Đang cập nhật...' : 'Xác nhận trụ sở mới'}
                      </button>
                    </div>
                  </div>
                )}
              </div></div>
            </div>

            {selectedCompany.status !== 'ipo' && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Nạp vốn / Bơm quỹ công ty</p>
                <p className="text-[11px] text-slate-500">Chuyển tiền từ ví cá nhân vào quỹ công ty (dùng cho OPEX, thuế, chi trả trong kỳ). Công ty đã IPO không sử dụng nạp vốn trực tiếp.</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <GameInput
                      label="Số tiền nạp (VND)"
                      type="number"
                      min={1}
                      value={investAmount}
                      onChange={(e) => setInvestAmount(e.target.value)}
                    />
                  </div>
                  <GameButton
                    variant="primary"
                    onClick={() => investCompany.mutate(selectedCompany.id)}
                    disabled={investCompany.isPending || selectedCompany.status === 'bankrupt'}
                  >
                    {investCompany.isPending ? '...' : 'Nạp vốn'}
                  </GameButton>
                </div>
              </div>
            )}

            {canManage && selectedCompany.status !== 'bankrupt' && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
                <p className="text-xs font-semibold text-emerald-800">Vận hành (chủ sở hữu)</p>
                <p className="text-[11px] text-slate-600">Doanh thu được hệ thống tự động tính/chốt mỗi 30 ngày game theo ngành. Bạn có thể cấu hình % giữ lại trong quỹ công ty (phần còn lại chuyển về ví chủ sở hữu, áp dụng kỳ tiếp theo). Chủ sở hữu chi OPEX và nộp thuế từ quỹ công ty.</p>
                <div className="rounded-lg border border-emerald-100 bg-white p-2 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-700">2B. Tỉ lệ giữ lại doanh thu tự động vào quỹ công ty</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 sm:max-w-xs">
                      <GameInput label="% giữ lại trong quỹ công ty (0-100)" type="number" min={0} max={100} value={retainPctInput} onChange={(e) => setRetainPctInput(e.target.value)} />
                    </div>
                    <GameButton variant="outline" onClick={() => setRevenueRetain.mutate(selectedCompany.id)} disabled={setRevenueRetain.isPending}>
                      {setRevenueRetain.isPending ? '...' : 'Lưu tỉ lệ (kỳ sau)'}
                    </GameButton>
                  </div>
                  <p className="text-[11px] text-slate-500">Hiện tại: {(selectedCompany as any).revenueRetainPct ?? 0}% giữ lại quỹ công ty, {100 - Number((selectedCompany as any).revenueRetainPct ?? 0)}% trả về ví chủ sở hữu.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2 sm:max-w-md">
                    <GameInput
                      label="OPEX (VND) - trừ từ quỹ công ty"
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
                  <p className="text-xs font-semibold text-sky-900">Đề xuất tuyển dụng AI (tạm thời)</p>
                  {hrAccLoading && <span className="text-[11px] text-slate-500">Đang tải...</span>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_auto] sm:items-end">
                  <GameInput label="Nhu cầu/vị trí" value={roleFocus} onChange={(e) => setRoleFocus(e.target.value)} placeholder="VD: Kế toán, bán hàng..." />
                  <GameInput label="Số lượng" type="number" min={1} max={20} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
                  <GameButton variant="primary" onClick={() => createHiringPlan.mutate(selectedCompany.id)} disabled={createHiringPlan.isPending || selectedCompany.status === 'bankrupt'} className="w-full sm:w-auto">
                    {createHiringPlan.isPending ? 'AI đang sắp...' : 'Nhờ AI đề xuất'}
                  </GameButton>
                </div>
                <p className="text-[11px] text-slate-600">Danh mục gợi ý chỉ hiển thị khi bấm “Nhờ AI đề xuất” và là phiên tạm thời: mất khi tuyển dụng thành công, khi từ chối/loại bỏ hết ứng viên, hoặc khi đóng (không lưu trữ lâu dài).</p>

                {suggestionPlan ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-800">Gợi ý: {suggestionPlan.roleFocus} · {suggestionPlan.headcount} người</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">tạm thời</Badge>
                        <GameButton variant="outline" onClick={() => dismissHiringPlan.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id })} disabled={dismissHiringPlan.isPending}>
                          {dismissHiringPlan.isPending ? '...' : 'Đóng/Bỏ gợi ý'}
                        </GameButton>
                      </div>
                    </div>
                    {suggestionPlan.rationale && <p className="text-[11px] text-slate-600">{suggestionPlan.rationale}</p>}
                    <div className="space-y-1.5">
                      {(suggestionPlan.candidates ?? []).map((c: any) => (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800">{c.fullName} · {c.roleTitle} ({c.seniority})</div>
                            <div className="text-slate-500">Lương đề xuất: {formatMoney(c.proposedSalary?.amount ?? c.proposedSalary ?? 0)} · Fit: {c.fitScore}/100</div>
                            {c.riskNote && <div className="text-[11px] text-amber-700">Rủi ro: {c.riskNote}</div>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant={c.status === 'approved' ? 'success' : 'default'}>{c.status}</Badge>
                            <GameButton variant="primary" onClick={() => decideCandidate.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id, candidateId: c.id, decision: 'approved' })} disabled={decideCandidate.isPending}>Duyệt</GameButton>
                            <GameButton variant="outline" onClick={() => decideCandidate.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id, candidateId: c.id, decision: 'rejected' })} disabled={decideCandidate.isPending}>Từ chối</GameButton>
                          </div>
                        </div>
                      ))}
                      {(suggestionPlan.candidates ?? []).length === 0 && <p className="text-[11px] text-slate-500">Không còn ứng viên gợi ý.</p>}
                    </div>
                    <GameButton variant="primary" onClick={() => applyHiringPlan.mutate({ companyId: selectedCompany.id, planId: suggestionPlan.id })} disabled={applyHiringPlan.isPending}>
                      {applyHiringPlan.isPending ? '...' : 'Áp dụng tuyển (ứng viên đã duyệt)'}
                    </GameButton>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">Chưa có phiên gợi ý nào. Nhấn “Nhờ AI đề xuất” để tạo gợi ý tạm thời.</p>
                )}
              </div>
            )}

            {canManage && detail?.isOwner && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Nhân sự (gộp: hợp đồng + AI tuyển)</p>
                <p className="text-[11px] text-slate-500">Danh sách gộp; mỗi nhân sự có chú thích nguồn.</p>
                {(employeesLoading || hrAccLoading) ? (
                  <p className="text-xs text-slate-500">Đang tải...</p>
                ) : (activeEmployees.length === 0 && staff.length === 0) ? (
                  <p className="text-xs text-slate-500">Chưa có nhân sự đang làm việc.</p>
                ) : (
                  <div className="space-y-1.5">
                    {activeEmployees.map((e) => (
                      <div key={`emp-${e.employmentId}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                        <div>
                          <div className="font-medium text-slate-800">{e.characterName} <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">Hợp đồng</span></div>
                          <div className="text-slate-500">{e.jobTitle} · {formatMoney(e.salary.amount)}/kỳ</div>
                        </div>
                        <GameButton variant="outline" onClick={() => fireEmployee.mutate({ companyId: selectedCompany.id, employmentId: e.employmentId })} disabled={fireEmployee.isPending}>Sa thải</GameButton>
                      </div>
                    ))}
                    {staff.map((s) => (
                      <div key={`ai-${s.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-2 py-1.5 text-xs border border-sky-100">
                        <div>
                          <div className="font-medium text-slate-800">{s.fullName} <span className="ml-1 rounded bg-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">AI tuyển</span></div>
                          <div className="text-slate-500">{s.roleTitle} · {formatMoney(s.salary.amount)}/kỳ</div>
                        </div>
                        <GameButton variant="outline" onClick={() => fireStaff.mutate({ companyId: selectedCompany.id, staffId: s.id })} disabled={fireStaff.isPending}>Sa thải</GameButton>
                      </div>
                    ))}
                  </div>
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

            {selectedCompany.status === 'ipo' && (
              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/40 p-3">
                <p className="text-xs font-semibold text-sky-800">Đợt chào bán cổ phần (IPO / gọi vốn thêm)</p>
                <p className="text-[11px] text-slate-600">Chủ sở hữu tạo đợt phát hành cổ phần mới (giá cố định, có thời hạn). Mọi người chơi có thể mua, ai mua trước được trước. Tiền về quỹ công ty, tổng cổ phần tăng và tỉ lệ cổ đông được cập nhật.</p>
                {canManage && (
                  <div className="rounded-lg border border-sky-100 bg-white p-2 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-700">Tạo đợt chào bán (chủ sở hữu)</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <GameInput label="Số cổ phần" type="number" min={1} value={offerTotalShares} onChange={(e)=>setOfferTotalShares(e.target.value)} />
                      <GameInput label="Giá/CP (VND)" type="number" min={1} value={offerPrice} onChange={(e)=>setOfferPrice(e.target.value)} />
                      <GameInput label="Thời hạn (giờ)" type="number" min={1} value={offerHours} onChange={(e)=>setOfferHours(e.target.value)} />
                    </div>
                    <GameButton variant="primary" onClick={() => createShareOffering.mutate(selectedCompany.id)} disabled={createShareOffering.isPending}>{createShareOffering.isPending ? '...' : 'Tạo đợt chào bán'}</GameButton>
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-700">Danh sách đợt chào bán</p>
                  {(shareOfferings ?? []).length === 0 ? <p className="text-[11px] text-slate-500">Chưa có đợt chào bán.</p> : (shareOfferings ?? []).map((o: any) => {
                    const open = o.status === 'open' && new Date(o.endsAt).getTime() > Date.now() && Number(o.remainingShares) > 0;
                    const qtyStr = buyOfferShares[o.id] ?? '1';
                    return (
                      <div key={o.id} className="rounded-md border border-slate-200 bg-white p-2 text-[11px] space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{formatMoney(o.pricePerShare?.amount ?? 0)}/CP · còn {Number(o.remainingShares).toLocaleString('vi-VN')}/{Number(o.totalShares).toLocaleString('vi-VN')}</span>
                          <Badge variant={open ? 'success' : 'default'}>{open ? 'open' : o.status}</Badge>
                        </div>
                        <div className="text-slate-500">Hết hạn: {new Date(o.endsAt).toLocaleString('vi-VN')}</div>
                        {open && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="w-32"><GameInput label="Số CP mua" type="number" min={1} value={qtyStr} onChange={(e)=>setBuyOfferShares(prev=>({...prev,[o.id]:e.target.value}))} /></div>
                            <GameButton variant="outline" onClick={() => buyShareOffering.mutate({ offeringId: o.id, shares: Number(qtyStr) || 1 })} disabled={buyShareOffering.isPending}>{buyShareOffering.isPending ? '...' : 'Mua'}</GameButton>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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

