import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompanyDto,
  CompanyEmployeesDto,
  CompanyHrAccountingDto,
  CompanyOverviewDto,
  CompanyPremisesOptionsDto,
  IndustryType,
} from '@efls/contracts';
import { apiRequest, createIdempotencyKey } from '../../shared/api/httpClient';
import { useToast } from '../../shared/ui/Toast';
import { useDialog } from '../../shared/ui/DialogContext';
import { money } from './businessPage.shared';

export function useBusinessPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('Công nghệ - Trí tuệ nhân tạo');
  const [capital, setCapital] = useState('10000000');
  const [premisesKey, setPremisesKey] = useState('');
  const [relocatePremisesKey, setRelocatePremisesKey] = useState('');
  const [confirmCreate, setConfirmCreate] = useState<{ idempotencyKey: string; name: string; industry: IndustryType; capital: number; premisesLabel: string } | null>(null);

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
  const [ownerSalaryInput, setOwnerSalaryInput] = useState('0');
  const [offerTotalShares, setOfferTotalShares] = useState('100000');
  const [offerPrice, setOfferPrice] = useState('10000');
  const [offerHours, setOfferHours] = useState('24');
  const [buyOfferShares, setBuyOfferShares] = useState<Record<string, string>>({});
  const [groupName, setGroupName] = useState('');
  const [groupHoldingCompanyId, setGroupHoldingCompanyId] = useState('');
  const [groupMemberCompanyId, setGroupMemberCompanyId] = useState('');
  const [groupAddById, setGroupAddById] = useState<Record<string, string>>({});
  const [buyoutCompanyId, setBuyoutCompanyId] = useState('');
  const [buyoutPrice, setBuyoutPrice] = useState('10000');
  const [buyoutHours, setBuyoutHours] = useState('24');
  const [buyoutTenderShares, setBuyoutTenderShares] = useState<Record<string, string>>({});
  const [mergerSurvivorId, setMergerSurvivorId] = useState('');
  const [mergerTargetId, setMergerTargetId] = useState('');
  const [suggestionPlan, setSuggestionPlan] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'finance' | 'hr' | 'equity'>('overview');
  const [revenuePeriodSearch, setRevenuePeriodSearch] = useState('');
  const [editingSalary, setEditingSalary] = useState<
    | { targetType: 'employee' | 'staff'; targetId: string; value: string; reason: string }
    | null
  >(null);

  const { data: me } = useQuery<{ id: string; fullName: string; cash?: { amount: number } }>({
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
  useEffect(() => { setSuggestionPlan(null); setDetailTab('overview'); setEditingSalary(null); }, [selectedId]);

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

  useEffect(() => {
    if (hrAcc?.ownerRole?.salary?.amount != null) {
      setOwnerSalaryInput(String(hrAcc.ownerRole.salary.amount));
    }
  }, [selectedId, hrAcc?.ownerRole?.salary?.amount]);

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
    mutationFn: ({ idempotencyKey }: { idempotencyKey: string }) => {
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
        headers: { 'X-Idempotency-Key': idempotencyKey },
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
      setConfirmCreate(null);
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
        body: JSON.stringify({ buyerCccd: takeoverBuyerCccd.replace(/\s+/g, '') || (me as any)?.cccd.trim() || me?.id }),
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

  const updateEmployeeSalary = useMutation({
    mutationFn: (input: { companyId: string; employmentId: string; amount: number; reason?: string }) =>
      apiRequest<CompanyHrAccountingDto>(
        `/api/v1/corporations/${input.companyId}/employees/${input.employmentId}/salary`,
        {
          method: 'PUT',
          body: JSON.stringify({
            salary: money(Math.max(0, Math.floor(input.amount))),
            reason: input.reason?.trim() || undefined,
          }),
        },
      ),
    onSuccess: async (hr) => {
      if (selectedId) {
        queryClient.setQueryData(['corporations', 'hr-accounting', selectedId], hr);
      }
      setEditingSalary(null);
      toast({ title: 'Đã cập nhật lương nhân viên', description: 'Mức lương mới sẽ áp dụng từ kỳ trả lương tiếp theo.' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['corporations', 'employees', selectedId] }),
        queryClient.invalidateQueries({ queryKey: ['corporations', 'hr-accounting', selectedId] }),
      ]);
    },
    onError: (e: any) =>
      toast({ title: 'Cập nhật lương thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const updateStaffSalary = useMutation({
    mutationFn: (input: { companyId: string; staffId: string; amount: number; reason?: string }) =>
      apiRequest<CompanyHrAccountingDto>(
        `/api/v1/corporations/${input.companyId}/staff/${input.staffId}/salary`,
        {
          method: 'PUT',
          body: JSON.stringify({
            salary: money(Math.max(0, Math.floor(input.amount))),
            reason: input.reason?.trim() || undefined,
          }),
        },
      ),
    onSuccess: async (hr) => {
      if (selectedId) {
        queryClient.setQueryData(['corporations', 'hr-accounting', selectedId], hr);
      }
      setEditingSalary(null);
      toast({ title: 'Đã cập nhật lương nhân sự AI', description: 'Mức lương mới sẽ áp dụng từ kỳ trả lương tiếp theo.' });
      await queryClient.invalidateQueries({ queryKey: ['corporations', 'hr-accounting', selectedId] });
    },
    onError: (e: any) =>
      toast({ title: 'Cập nhật lương thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
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

  const setOwnerSalary = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest<CompanyHrAccountingDto>(`/api/v1/corporations/${companyId}/owner-salary`, {
        method: 'PUT',
        body: JSON.stringify({ salary: money(Math.max(0, Math.floor(Number(ownerSalaryInput) || 0))) }),
      }),
    onSuccess: async (hr) => {
      queryClient.setQueryData(['corporations', 'hr-accounting', selectedId], hr);
      toast({ title: 'Đã cập nhật lương chủ doanh nghiệp', description: 'Lương chi từ quỹ công ty vào ngày đầu mỗi tháng game (nếu đủ quỹ).' });
      await invalidate();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['corporations', 'detail', selectedId] }),
        queryClient.invalidateQueries({ queryKey: ['corporations', 'employees', selectedId] }),
      ]);
    },
    onError: (e: any) => toast({ title: 'Cập nhật lương thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
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
  const revenueSettlements = hrAcc?.revenueSettlements ?? [];
  const revenuePeriodQuery = revenuePeriodSearch.trim().toLowerCase();
  const filteredRevenueSettlements = !revenuePeriodQuery
    ? revenueSettlements
    : revenueSettlements.filter((s) => {
        const ym = `${s.gameYear}-${String(s.gameMonth).padStart(2, '0')}`.toLowerCase();
        const statusText = s.filed ? String(s.filingStatus ?? 'đã khai').toLowerCase() : 'chưa khai';
        return (
          s.periodKey.toLowerCase().includes(revenuePeriodQuery) ||
          ym.includes(revenuePeriodQuery) ||
          String(s.gameYear).includes(revenuePeriodQuery) ||
          statusText.includes(revenuePeriodQuery)
        );
      });
  const payrollForecast = hrAcc?.payrollForecast;

  const { data: groupOverview, isLoading: groupsLoading } = useQuery<any>({
    queryKey: ['corporations', 'groups'],
    queryFn: () => apiRequest('/api/v1/corporations/groups/overview'),
    staleTime: 10_000,
  });
  const { data: buyoutOverview } = useQuery<any>({
    queryKey: ['corporations', 'buyouts'],
    queryFn: () => apiRequest('/api/v1/corporations/buyouts'),
    staleTime: 10_000,
  });

  const invalidateMna = async () => {
    await Promise.all([
      invalidate(),
      queryClient.invalidateQueries({ queryKey: ['corporations', 'groups'] }),
      queryClient.invalidateQueries({ queryKey: ['corporations', 'buyouts'] }),
      queryClient.invalidateQueries({ queryKey: ['corporations', 'share-offerings'] }),
    ]);
  };

  const createGroup = useMutation({
    mutationFn: () => apiRequest('/api/v1/corporations/groups', {
      method: 'POST',
      body: JSON.stringify({ name: groupName.trim(), holdingCompanyId: groupHoldingCompanyId }),
    }),
    onSuccess: async () => {
      toast({ title: 'Đã tạo tập đoàn' });
      setGroupName('');
      await invalidateMna();
    },
    onError: (e: any) => toast({ title: 'Tạo tập đoàn thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });
  const dissolveGroup = useMutation({
    mutationFn: (groupId: string) => apiRequest(`/api/v1/corporations/groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: async () => { toast({ title: 'Đã giải tán tập đoàn' }); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Giải tán thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });
  const addGroupMember = useMutation({
    mutationFn: ({ groupId, companyId }: { groupId: string; companyId: string }) =>
      apiRequest(`/api/v1/corporations/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ companyId }) }),
    onSuccess: async (_d, vars) => {
      toast({ title: 'Đã thêm công ty vào tập đoàn' });
      setGroupAddById((p) => ({ ...p, [vars.groupId]: '' }));
      setGroupMemberCompanyId('');
      await invalidateMna();
    },
    onError: (e: any) => toast({ title: 'Thêm thành viên thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });
  const removeGroupMember = useMutation({
    mutationFn: ({ groupId, companyId }: { groupId: string; companyId: string }) =>
      apiRequest(`/api/v1/corporations/groups/${groupId}/members/${companyId}`, { method: 'DELETE' }),
    onSuccess: async () => { toast({ title: 'Đã gỡ công ty khỏi tập đoàn' }); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Gỡ thành viên thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const createBuyout = useMutation({
    mutationFn: () => apiRequest('/api/v1/corporations/buyouts', {
      method: 'POST',
      body: JSON.stringify({
        companyId: buyoutCompanyId,
        pricePerShare: money(Math.max(1, Math.floor(Number(buyoutPrice) || 0))),
        durationHours: Math.max(1, Math.floor(Number(buyoutHours) || 24)),
        allowSqueezeOut: true,
      }),
    }),
    onSuccess: async () => { toast({ title: 'Đã tạo đề nghị mua lại' }); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Tạo đề nghị mua lại thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });
  const tenderBuyout = useMutation({
    mutationFn: ({ offerId, shares }: { offerId: string; shares?: number }) =>
      apiRequest(`/api/v1/corporations/buyouts/${offerId}/tender`, { method: 'POST', body: JSON.stringify(shares ? { shares } : {}) }),
    onSuccess: async () => { toast({ title: 'Đã bán cổ phần theo đề nghị mua lại' }); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Thao tác thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });
  const cancelBuyout = useMutation({
    mutationFn: (offerId: string) => apiRequest(`/api/v1/corporations/buyouts/${offerId}/cancel`, { method: 'POST' }),
    onSuccess: async () => { toast({ title: 'Đã hủy đề nghị mua lại' }); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Hủy thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });
  const squeezeOutBuyout = useMutation({
    mutationFn: (offerId: string) => apiRequest(`/api/v1/corporations/buyouts/${offerId}/squeeze-out`, { method: 'POST' }),
    onSuccess: async () => { toast({ title: 'Đã ép mua cổ đông thiểu số' }); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Ép mua thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const mergeCompanies = useMutation({
    mutationFn: () => apiRequest('/api/v1/corporations/mergers', {
      method: 'POST',
      body: JSON.stringify({ survivorCompanyId: mergerSurvivorId, mergedCompanyId: mergerTargetId }),
    }),
    onSuccess: async () => { toast({ title: 'Đã sáp nhập công ty' }); setMergerTargetId(''); await invalidateMna(); },
    onError: (e: any) => toast({ title: 'Sáp nhập thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  return {
    confirm, queryClient, toast,
    createOpen, setCreateOpen,
    selectedId, setSelectedId,
    name, setName,
    industry, setIndustry,
    capital, setCapital,
    premisesKey, setPremisesKey,
    relocatePremisesKey, setRelocatePremisesKey,
    confirmCreate, setConfirmCreate,
    investAmount, setInvestAmount,
    ipoSymbol, setIpoSymbol,
    ipoPrice, setIpoPrice,
    ipoShares, setIpoShares,
    takeoverBuyerCccd, setTakeoverBuyerCccd,
    opexAmount, setOpexAmount,
    opexNote, setOpexNote,
    roleFocus, setRoleFocus,
    headcount, setHeadcount,
    entryType, setEntryType,
    entryAmount, setEntryAmount,
    declaredAmount, setDeclaredAmount,
    entryDesc, setEntryDesc,
    entryEvasion, setEntryEvasion,
    filingPeriod, setFilingPeriod,
    declaredRevenueInput, setDeclaredRevenueInput,
    filingNotes, setFilingNotes,
    usePersonalFundsForShortfall, setUsePersonalFundsForShortfall,
    retainPctInput, setRetainPctInput,
    ownerSalaryInput, setOwnerSalaryInput,
    offerTotalShares, setOfferTotalShares,
    offerPrice, setOfferPrice,
    offerHours, setOfferHours,
    buyOfferShares, setBuyOfferShares,
    groupName, setGroupName,
    groupHoldingCompanyId, setGroupHoldingCompanyId,
    groupMemberCompanyId, setGroupMemberCompanyId,
    groupAddById, setGroupAddById,
    buyoutCompanyId, setBuyoutCompanyId,
    buyoutPrice, setBuyoutPrice,
    buyoutHours, setBuyoutHours,
    buyoutTenderShares, setBuyoutTenderShares,
    mergerSurvivorId, setMergerSurvivorId,
    mergerTargetId, setMergerTargetId,
    suggestionPlan, setSuggestionPlan,
    detailTab, setDetailTab,
    revenuePeriodSearch, setRevenuePeriodSearch,
    editingSalary, setEditingSalary,
    me,
    overview, isLoading, error, refetch,
    premisesOptions, premisesLoading,
    detail, detailLoading,
    selectedCompany, canManage,
    employeesData, employeesLoading,
    hrAcc, hrAccLoading,
    shareOfferings, marketOfferings,
    companies, myCompanies, totalValuation, myValuation,
    premisesMap,
    createCompany, relocatePremises, investCompany, ipoCompany, takeoverCompany,
    payOpex, dissolveCompany, fireEmployee,
    createHiringPlan, decideCandidate, applyHiringPlan, dismissHiringPlan, fireStaff,
    updateEmployeeSalary, updateStaffSalary,
    addLedgerEntry, createFiling, setRevenueRetain, setOwnerSalary,
    createShareOffering, buyShareOffering,
    topShareholders, activeEmployees, staff, ledger, filings, revenueSettlements,
    revenuePeriodQuery, filteredRevenueSettlements, payrollForecast,
    groupOverview, groupsLoading, buyoutOverview,
    invalidateMna,
    createGroup, dissolveGroup, addGroupMember, removeGroupMember,
    createBuyout, tenderBuyout, cancelBuyout, squeezeOutBuyout, mergeCompanies,
  };
}
