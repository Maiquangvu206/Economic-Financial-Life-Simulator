import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type { IndustryType, RecruitmentJobDto, RecruitmentOverviewDto } from '@efls/contracts';
import { apiRequest } from '../shared/api/httpClient';
import { Panel } from '../shared/ui/Panel';
import { Badge } from '../shared/ui/Badge';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { toast } from '../shared/ui/Toast';
import { useDialog } from '../shared/ui/DialogContext';

function moneyText(m: { amount: number }) {
  return `${Number(m.amount || 0).toLocaleString('vi-VN')} ₫`;
}

const INDUSTRIES: Array<{ value: IndustryType; label: string }> = [
  { value: 'real_estate', label: 'Bất động sản' },
  { value: 'finance_banking', label: 'Tài chính - Ngân hàng' },
  { value: 'technology_ai', label: 'Công nghệ - AI' },
  { value: 'agritech', label: 'Nông nghiệp công nghệ' },
  { value: 'healthcare_pharma', label: 'Y tế - Dược phẩm' },
  { value: 'entertainment_media', label: 'Giải trí - Truyền thông' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'energy_mining', label: 'Năng lượng - Khai khoáng' },
  { value: 'education', label: 'Giáo dục' },
  { value: 'underworld_services', label: 'Dịch vụ ngầm' },
];

function statusLabel(job: RecruitmentJobDto) {
  if (job.postingStatus === 'closed') return 'Đã đóng';
  if (job.postingStatus === 'deleted') return 'Đã xóa';
  return 'Đang mở';
}

export function RecruitmentPage() {
  const { confirm } = useDialog();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<RecruitmentOverviewDto>({
    queryKey: ['recruitment', 'jobs'],
    queryFn: () => apiRequest<RecruitmentOverviewDto>('/api/v1/recruitment/jobs'),
  });

  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('technology_ai');
  const [salary, setSalary] = useState('12000000');
  const [openings, setOpenings] = useState('1');
  const [requiredDegree, setRequiredDegree] = useState('');
  const [minCreditScore, setMinCreditScore] = useState('0');
  const [energyCost, setEnergyCost] = useState('10');

  const myCompanies = data?.myCompanies ?? [];
  const effectiveCompanyId = companyId || myCompanies[0]?.id || '';

  const invalidateRecruitment = async () => {
    await qc.invalidateQueries({ queryKey: ['recruitment'] });
  };

  const createJob = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/recruitment/jobs', {
        method: 'POST',
        body: JSON.stringify({
          companyId: effectiveCompanyId,
          title: title.trim(),
          industry,
          baseSalary: { amount: Number(salary) || 0, currency: 'VND' },
          requiredDegree: requiredDegree.trim() || null,
          minCreditScore: Number(minCreditScore) || 0,
          energyCost: Number(energyCost) || 0,
          openings: Number(openings) || 1,
        }),
      }),
    onSuccess: async () => {
      toast({ title: 'Đã đăng tin tuyển dụng', description: 'Tin tuyển dụng của công ty đã được hiển thị.', variant: 'success' });
      setTitle('');
      setRequiredDegree('');
      await invalidateRecruitment();
    },
    onError: (e: any) => toast({ title: 'Đăng tuyển thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const applyJob = useMutation({
    mutationFn: (jobId: string) => apiRequest(`/api/v1/recruitment/jobs/${jobId}/apply`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: 'Ứng tuyển thành công', description: 'Bạn đã được nhận việc. Hãy kiểm tra thông tin việc làm.', variant: 'success' });
      await invalidateRecruitment();
      await qc.invalidateQueries({ queryKey: ['careers'] });
    },
    onError: (e: any) => toast({ title: 'Ứng tuyển thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const closeJob = useMutation({
    mutationFn: (jobId: string) => apiRequest(`/api/v1/recruitment/jobs/${jobId}/close`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: 'Đã đóng đợt tuyển', description: 'Đợt tuyển đã chuyển sang trạng thái đóng. Sau ít nhất 1 ngày game bạn có thể xóa.', variant: 'success' });
      await invalidateRecruitment();
    },
    onError: (e: any) => toast({ title: 'Không thể đóng đợt tuyển', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const deleteJob = useMutation({
    mutationFn: (jobId: string) => apiRequest(`/api/v1/recruitment/jobs/${jobId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: 'Đã xóa đợt tuyển', description: 'Đợt tuyển đã được xóa.', variant: 'success' });
      await invalidateRecruitment();
    },
    onError: (e: any) => toast({ title: 'Không thể xóa đợt tuyển', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const jobs = data?.jobs ?? [];
  const employment = data?.employment;
  const canPostJobs = data?.canPostJobs ?? false;
  const canApply = data?.canApplyJobs ?? false;
  const applyBlocker = data?.applyBlocker ?? null;

  const stats = useMemo(() => {
    const open = jobs.filter((j) => j.postingStatus === 'open').length;
    const closedMine = jobs.filter((j) => j.isMine && j.postingStatus === 'closed').length;
    return { total: jobs.length, open, closedMine };
  }, [jobs]);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-600">Đang tải trang tuyển dụng...</div>;
  }
  if (error || !data) {
    return <div className="p-6 text-sm text-rose-600">Không thể tải dữ liệu tuyển dụng. <button className="underline" onClick={() => void refetch()}>Thử lại</button></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tuyển dụng"
        description="Bảng tin tuyển dụng từ các công ty. Chủ công ty có thể đăng/đóng/xóa đợt tuyển (mở → đóng → chờ ≥ 1 ngày game → xóa). Nhân vật có thể ứng tuyển nếu đáp ứng yêu cầu và đợt tuyển đang mở."
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-4">
          <Panel title="Tin tuyển dụng" borderColor="emerald">
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              <Badge variant={canApply ? 'success' : 'warning'}>{canApply ? 'Bạn đủ điều kiện ứng tuyển' : 'Không đủ điều kiện ứng tuyển'}</Badge>
              {employment ? <Badge variant="default">Đang làm: {employment.title}</Badge> : <Badge variant="default">Chưa có việc làm</Badge>}
              <Badge variant="default">Tin hiển thị: {stats.total}</Badge>
              <Badge variant="success">Đang mở: {stats.open}</Badge>
              {stats.closedMine > 0 ? <Badge variant="warning">Tin của bạn (đã đóng): {stats.closedMine}</Badge> : null}
              {applyBlocker ? <span className="text-slate-600">{applyBlocker}</span> : null}
            </div>

            <div className="space-y-3">
              {jobs.length === 0 ? (
                <div className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-300 p-4 bg-slate-50/50">
                  Chưa có tin tuyển dụng nào.
                </div>
              ) : (
                jobs.map((job) => {
                  const isActing = (closeJob.isPending && closeJob.variables === job.id) || (deleteJob.isPending && deleteJob.variables === job.id) || (applyJob.isPending && applyJob.variables === job.id);
                  return (
                    <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{job.title}</h3>
                            <Badge variant={job.postingStatus === 'open' ? 'success' : job.postingStatus === 'closed' ? 'warning' : 'default'}>
                              {statusLabel(job)}
                            </Badge>
                            {job.postingStatus === 'open' ? (
                              <Badge variant={job.canApply ? 'success' : job.eligible ? 'default' : 'warning'}>
                                {job.canApply ? 'Có thể ứng tuyển' : job.eligible ? 'Đủ yêu cầu vị trí' : 'Chưa đạt yêu cầu'}
                              </Badge>
                            ) : null}
                            {job.isMine ? <Badge variant="default">Tin của bạn</Badge> : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {job.companyName ? `Công ty: ${job.companyName}` : 'Công ty'}{job.ownerName ? ` • Chủ: ${job.ownerName}` : ''}
                          </div>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><div className="text-slate-500">Lương</div><div className="font-semibold text-slate-800">{moneyText(job.baseSalary)}</div></div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><div className="text-slate-500">Ngành</div><div className="font-semibold text-slate-800">{job.industry}</div></div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><div className="text-slate-500">Chỉ tiêu</div><div className="font-semibold text-slate-800">{job.openings}</div></div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><div className="text-slate-500">Tín dụng tối thiểu</div><div className="font-semibold text-slate-800">{job.minCreditScore}</div></div>
                          </div>
                          <div className="mt-2 text-xs text-slate-600">
                            Yêu cầu bằng cấp/chứng chỉ: <span className="font-medium text-slate-800">{job.requiredDegree || 'Không yêu cầu'}</span>
                            {job.blocker ? <span className="ml-2 text-amber-700">• {job.blocker}</span> : null}
                          </div>
                          {job.isMine && job.postingStatus === 'closed' ? (
                            <div className="mt-2 text-[11px] text-slate-600 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                              Đã đóng{job.closedAt ? ` lúc ${new Date(job.closedAt).toLocaleString('vi-VN')}` : ''}.
                              {job.canDelete ? ' Đã đủ 1 ngày game — có thể xóa.' : ' Cần chờ ít nhất 1 ngày game kể từ khi đóng để xóa.'}
                              {job.deleteEligibleAt ? ` (${job.deleteEligibleAt})` : ''}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex sm:flex-col gap-2 sm:min-w-[190px]">
                          {job.postingStatus === 'open' && !job.isMine ? (
                            <GameButton
                              variant="primary"
                              size="sm"
                              className="w-full"
                              disabled={!job.canApply || isActing}
                              onClick={() => applyJob.mutate(job.id)}
                              title={!canApply ? (applyBlocker || 'Không đủ điều kiện ứng tuyển') : !job.eligible ? (job.blocker || 'Chưa đáp ứng yêu cầu vị trí') : 'Ứng tuyển vị trí này'}
                            >
                              {applyJob.isPending && applyJob.variables === job.id ? 'Đang xử lý...' : 'Ứng tuyển'}
                            </GameButton>
                          ) : null}

                          {job.isMine && job.postingStatus === 'open' ? (
                            <>
                              <GameButton
                                variant="outline"
                                size="sm"
                                className="w-full"
                                disabled={!job.canClose || isActing}
                                onClick={() => closeJob.mutate(job.id)}
                                title="Đóng đợt tuyển (ngừng nhận ứng viên). Sau ≥ 1 ngày game mới có thể xóa."
                              >
                                {closeJob.isPending && closeJob.variables === job.id ? 'Đang đóng...' : 'Đóng đợt tuyển'}
                              </GameButton>
                              <div className="text-[11px] text-slate-500 text-center"></div>
                            </>
                          ) : null}

                          {job.isMine && job.postingStatus === 'closed' ? (
                            <GameButton
                              variant={job.canDelete ? 'danger' : 'outline'}
                              size="sm"
                              className="w-full"
                              disabled={!job.canDelete || isActing}
                              onClick={async () => {
                                if (!job.canDelete) return;
                                const ok = await confirm({
                                  title: 'Xóa đợt tuyển này?',
                                  type: 'danger',
                                  confirmText: 'Xóa vĩnh viễn',
                                  message: 'Hành động này không thể hoàn tác.',
                                });
                                if (!ok) return;
                                deleteJob.mutate(job.id);
                              }}
                              title={job.canDelete ? 'Xóa đợt tuyển' : 'Chưa đủ 1 ngày game kể từ khi đóng'}
                            >
                              {deleteJob.isPending && deleteJob.variables === job.id ? 'Đang xóa...' : job.canDelete ? 'Xóa đợt tuyển' : 'Chờ 1 ngày game để xóa'}
                            </GameButton>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Đăng tin tuyển dụng" borderColor="default">
            {!canPostJobs ? (
              <div className="text-sm text-slate-600">
                Chỉ nhân vật đang sở hữu công ty (hoạt động/IPO) mới có thể đăng tin tuyển dụng. Hãy thành lập công ty tại trang Doanh nghiệp.
              </div>
            ) : (
              <div className="space-y-3">
                {myCompanies.length > 1 ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-700">Công ty đăng tuyển</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={effectiveCompanyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                    >
                      {myCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    Công ty: <span className="font-medium text-slate-800">{myCompanies[0]?.name}</span>
                  </div>
                )}

                <GameInput label="Tiêu đề vị trí" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Nhân viên kế toán, Kỹ sư vận hành..." />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-700">Ngành</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value as IndustryType)}
                    >
                      {INDUSTRIES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <GameInput label="Lương cơ bản (VND)" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <GameInput label="Số lượng tuyển" type="number" min={1} value={openings} onChange={(e) => setOpenings(e.target.value)} />
                  <GameInput label="Tín dụng tối thiểu" type="number" min={0} value={minCreditScore} onChange={(e) => setMinCreditScore(e.target.value)} />
                  <GameInput label="Năng lượng" type="number" min={0} value={energyCost} onChange={(e) => setEnergyCost(e.target.value)} />
                </div>
                <GameInput label="Yêu cầu bằng cấp/chứng chỉ" value={requiredDegree} onChange={(e) => setRequiredDegree(e.target.value)} placeholder="VD: uni_bachelor_tech hoặc để trống" />

                <GameButton
                  variant="primary"
                  onClick={() => {
                    if (!effectiveCompanyId) return toast({ title: 'Thiếu công ty', description: 'Vui lòng chọn công ty đăng tuyển.', variant: 'error' });
                    if (!title.trim()) return toast({ title: 'Thiếu tiêu đề', description: 'Vui lòng nhập tiêu đề vị trí.', variant: 'error' });
                    createJob.mutate();
                  }}
                  disabled={createJob.isPending}
                  className="w-full"
                >
                  {createJob.isPending ? 'Đang đăng...' : 'Đăng tin tuyển dụng'}
                </GameButton>
                
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
