import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type { IndustryType, RecruitmentOverviewDto } from '@efls/contracts';
import { apiRequest } from '../shared/api/httpClient';
import { formatMoney } from '../shared/lib/format';
import { Panel } from '../shared/ui/Panel';
import { Badge } from '../shared/ui/Badge';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
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

function industryLabel(v: string): string {
  return INDUSTRIES.find((i) => i.value === v)?.label ?? v;
}

export function RecruitmentPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery<RecruitmentOverviewDto>({
    queryKey: ['recruitment', 'jobs'],
    queryFn: () => apiRequest<RecruitmentOverviewDto>('/api/v1/recruitment/jobs'),
  });

  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('technology_ai');
  const [salary, setSalary] = useState('8000000');
  const [requiredDegree, setRequiredDegree] = useState('');
  const [minCredit, setMinCredit] = useState('0');
  const [openings, setOpenings] = useState('1');

  const myCompanies = data?.myCompanies ?? [];
  const selectedCompany = companyId || myCompanies[0]?.id || '';

  const createJob = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/recruitment/jobs', {
        method: 'POST',
        body: JSON.stringify({
          companyId: selectedCompany,
          title: title.trim(),
          industry,
          baseSalary: { amount: Number(salary) || 0, currency: 'VND' },
          requiredDegree: requiredDegree.trim() || null,
          minCreditScore: Number(minCredit) || 0,
          energyCost: 10,
          openings: Math.max(1, Number(openings) || 1),
        }),
      }),
    onSuccess: async () => {
      toast({ title: 'Đã đăng tin tuyển dụng', description: 'Tin tuyển dụng của công ty đã được hiển thị.', variant: 'success' });
      setTitle('');
      setRequiredDegree('');
      await qc.invalidateQueries({ queryKey: ['recruitment'] });
    },
    onError: (e: any) => toast({ title: 'Đăng tuyển thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const applyJob = useMutation({
    mutationFn: (jobId: string) => apiRequest(`/api/v1/recruitment/jobs/${jobId}/apply`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: 'Ứng tuyển thành công', description: 'Bạn đã được nhận việc. Hãy kiểm tra thông tin việc làm.', variant: 'success' });
      await qc.invalidateQueries({ queryKey: ['recruitment'] });
      await qc.invalidateQueries({ queryKey: ['characters'] });
    },
    onError: (e: any) => toast({ title: 'Ứng tuyển thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const jobs = data?.jobs ?? [];
  const canApply = !!data?.canApplyJobs;
  const applyBlocker = data?.applyBlocker ?? null;

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => Number(b.canApply) - Number(a.canApply) || b.openings - a.openings);
  }, [jobs]);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-600">Đang tải trang tuyển dụng...</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-rose-600">Không thể tải dữ liệu tuyển dụng. <button className="underline" onClick={() => void refetch()}>Thử lại</button></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tuyển dụng"
        description="Bảng tin tuyển dụng từ các nhân vật/công ty. Chủ công ty có thể đăng tuyển; nhân vật có thể ứng tuyển nếu đáp ứng yêu cầu vị trí (có bằng cấp/chứng chỉ khi được yêu cầu), không giới hạn vị trí làm việc."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Tin tuyển dụng đang mở" borderColor="emerald">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={canApply ? 'success' : 'warning'}>{canApply ? 'Bạn đủ điều kiện ứng tuyển' : 'Không đủ điều kiện ứng tuyển'}</Badge>
              {applyBlocker && <span className="text-slate-600">{applyBlocker}</span>}
              {data?.employment && (
                <span className="text-slate-600">Việc làm hiện tại: <b>{data.employment.title}</b> ({formatMoney(data.employment.salary.amount)}/tháng)</span>
              )}
            </div>

            {sortedJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Chưa có tin tuyển dụng nào từ các công ty.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedJobs.map((job) => (
                  <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{job.title}</h3>
                          {job.isMine && <Badge variant="default">Tin của bạn</Badge>}
                          <Badge variant={job.canApply ? 'success' : job.eligible ? 'warning' : 'error'}>
                            {job.canApply ? 'Có thể ứng tuyển' : job.eligible ? 'Đủ yêu cầu vị trí' : 'Chưa đạt yêu cầu'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm text-slate-700">
                          <span className="font-medium">{job.companyName ?? 'Công ty'}</span>
                          {job.ownerName ? <span className="text-slate-500"> · Chủ sở hữu: {job.ownerName}</span> : null}
                        </div>
                        <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                          <div>Ngành: <span className="text-slate-800">{industryLabel(job.industry)}</span></div>
                          <div>Lương cơ bản: <span className="font-mono font-semibold text-emerald-700">{formatMoney(job.baseSalary.amount)}</span></div>
                          <div>Chỉ tiêu còn lại: <span className="font-semibold text-slate-800">{job.openings}</span></div>
                          <div>Yêu cầu bằng cấp: <span className="text-slate-800">{job.requiredDegree || 'Không yêu cầu'}</span></div>
                          <div>Điểm tín dụng tối thiểu: <span className="text-slate-800">{job.minCreditScore}</span></div>
                          <div>Năng lượng tiêu hao: <span className="text-slate-800">{job.energyCost}</span></div>
                        </div>
                        {job.blocker && !job.canApply && (
                          <div className="mt-2 text-[11px] text-amber-700">{job.blocker}</div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <GameButton
                          variant={job.canApply ? 'primary' : 'outline'}
                          size="sm"
                          disabled={!job.canApply || applyJob.isPending}
                          onClick={() => applyJob.mutate(job.id)}
                          title={!canApply ? (applyBlocker || 'Không đủ điều kiện ứng tuyển') : !job.eligible ? (job.blocker || 'Chưa đáp ứng yêu cầu vị trí') : 'Ứng tuyển vị trí này'}
                        >
                          {applyJob.isPending ? 'Đang xử lý...' : job.isMine ? 'Tin của công ty bạn' : 'Ứng tuyển'}
                        </GameButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Đăng tin tuyển dụng" borderColor="default">
            {!data?.canPostJobs ? (
              <p className="text-sm text-slate-500">
                Chỉ nhân vật đang sở hữu công ty (hoạt động/IPO) mới có thể đăng tin tuyển dụng. Hãy thành lập công ty tại trang Doanh nghiệp.
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedCompany) return;
                  createJob.mutate();
                }}
              >
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-500">Công ty đăng tuyển</label>
                  <select
                    value={selectedCompany}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    {myCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <GameInput label="Vị trí / Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Nhân viên kinh doanh" required />
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-500">Ngành</label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value as IndustryType)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>
                <GameInput label="Lương cơ bản (VND/tháng)" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} required />
                <GameInput label="Yêu cầu bằng cấp (mã bằng, tuỳ chọn)" value={requiredDegree} onChange={(e) => setRequiredDegree(e.target.value)} placeholder="VD: BK_HUST" />
                <div className="grid grid-cols-2 gap-2">
                  <GameInput label="Điểm tín dụng tối thiểu" type="number" min={0} value={minCredit} onChange={(e) => setMinCredit(e.target.value)} />
                  <GameInput label="Số lượng tuyển" type="number" min={1} value={openings} onChange={(e) => setOpenings(e.target.value)} />
                </div>
                <GameButton type="submit" variant="primary" className="w-full" disabled={createJob.isPending || !title.trim() || !selectedCompany}>
                  {createJob.isPending ? 'Đang đăng...' : 'Đăng tin tuyển dụng'}
                </GameButton>
                <p className="text-[11px] text-slate-500">Tin đăng sẽ hiển thị cho người chơi khác trong trang Tuyển dụng (công ty đang hoạt động/IPO).</p>
              </form>
            )}
          </Panel>

          <Panel title="Điều kiện ứng tuyển" borderColor="amber">
            <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
              <li><b>Chưa có việc làm đang hoạt động</b> (mỗi nhân vật chỉ làm 1 việc tại một thời điểm).</li>
              <li>Đáp ứng yêu cầu của vị trí: có <b>bằng cấp/chứng chỉ</b> (nếu vị trí yêu cầu) và đủ <b>điểm tín dụng</b> (nếu có).</li>
              <li><b>Không giới hạn</b> do sở hữu công ty hay vị trí làm việc — chỉ cần đáp ứng yêu cầu/bằng của vị trí.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
