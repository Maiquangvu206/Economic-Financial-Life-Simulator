import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type {
  IndustryType,
  RecruitmentJobApplicationDto,
  RecruitmentJobDto,
  RecruitmentOverviewDto,
} from '@efls/contracts';
import { apiRequest } from '../shared/api/httpClient';
import { Panel } from '../shared/ui/Panel';
import { Badge } from '../shared/ui/Badge';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { toast } from '../shared/ui/Toast';
import { useDialog } from '../shared/ui/DialogContext';
import { formatGameDate, formatMoney } from '../shared/lib/format';

function moneyText(m: { amount: number }) {
  return formatMoney(Number(m.amount || 0));
}

const INDUSTRIES: Array<{ value: IndustryType; label: string }> = [
  { value: 'Bất động sản', label: 'Bất động sản' },
  { value: 'Tài chính - Ngân hàng', label: 'Tài chính - Ngân hàng' },
  { value: 'Công nghệ - Trí tuệ nhân tạo', label: 'Công nghệ - Trí tuệ nhân tạo' },
  { value: 'Công nghệ nông nghiệp', label: 'Công nghệ nông nghiệp' },
  { value: 'Y tế - Dược phẩm', label: 'Y tế - Dược phẩm' },
  { value: 'Giải trí - Truyền thông', label: 'Giải trí - Truyền thông' },
  { value: 'Hậu cần', label: 'Hậu cần' },
  { value: 'Năng lượng - Khoáng sản', label: 'Năng lượng - Khoáng sản' },
  { value: 'Giáo dục', label: 'Giáo dục' },
  { value: 'Dịch vụ thế giới ngầm', label: 'Dịch vụ thế giới ngầm' },
];

function jobStatusLabel(job: RecruitmentJobDto) {
  if (job.postingStatus === 'closed') return 'Đã đóng';
  if (job.postingStatus === 'deleted') return 'Đã xóa';
  return 'Đang mở';
}

function appStatusLabel(status: RecruitmentJobApplicationDto['status']) {
  switch (status) {
    case 'pending':
      return 'Chờ duyệt';
    case 'approved':
      return 'Đã duyệt';
    case 'rejected':
      return 'Từ chối';
    case 'cancelled':
      return 'Đã hủy';
    default:
      return status;
  }
}

function appStatusVariant(status: RecruitmentJobApplicationDto['status']): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'error';
  return 'default';
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
}

export function RecruitmentPage() {
  const { confirm, prompt } = useDialog();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'jobs' | 'employer'>('jobs');

  const { data, isLoading, error, refetch } = useQuery<RecruitmentOverviewDto>({
    queryKey: ['recruitment', 'jobs'],
    queryFn: () => apiRequest<RecruitmentOverviewDto>('/api/v1/recruitment/jobs'),
  });

  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('Công nghệ - Trí tuệ nhân tạo');
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
      toast({
        title: 'Đã gửi hồ sơ ứng tuyển',
        description: 'Hồ sơ của bạn đang chờ chủ doanh nghiệp duyệt. Bạn sẽ được thông báo khi có kết quả.',
        variant: 'success',
      });
      await invalidateRecruitment();
      await qc.invalidateQueries({ queryKey: ['careers'] });
    },
    onError: (e: any) => toast({ title: 'Gửi hồ sơ thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const closeJob = useMutation({
    mutationFn: (jobId: string) => apiRequest(`/api/v1/recruitment/jobs/${jobId}/close`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: 'Đã đóng đợt tuyển', description: 'Đợt tuyển đã chuyển sang trạng thái đóng. Hồ sơ chờ duyệt (nếu có) sẽ bị hủy.', variant: 'success' });
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

  const decideApplication = useMutation({
    mutationFn: (input: { applicationId: string; decision: 'approve' | 'reject'; note?: string | null }) =>
      apiRequest(`/api/v1/recruitment/applications/${input.applicationId}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision: input.decision, note: input.note ?? undefined }),
      }),
    onSuccess: async (_res, vars) => {
      toast({
        title: vars.decision === 'approve' ? 'Đã duyệt hồ sơ' : 'Đã từ chối hồ sơ',
        description:
          vars.decision === 'approve'
            ? 'Ứng viên đã được nhận việc và hệ thống đã tạo hợp đồng lao động.'
            : 'Hồ sơ ứng tuyển đã được từ chối.',
        variant: 'success',
      });
      await invalidateRecruitment();
      await qc.invalidateQueries({ queryKey: ['careers'] });
    },
    onError: (e: any) =>
      toast({ title: 'Xử lý hồ sơ thất bại', description: e?.problem?.detail || e?.message, variant: 'error' }),
  });

  const resignEmployment = useMutation({
    mutationFn: () => apiRequest('/api/v1/jobs/resign', { method: 'POST' }),
    onSuccess: async () => {
      toast({
        title: 'Đã gửi yêu cầu thôi việc',
        description: 'Bạn đang trong thời gian báo trước 10 ngày game. Sau khi hết hạn, bạn sẽ chính thức nghỉ việc.',
        variant: 'success',
      });
      await invalidateRecruitment();
      await qc.invalidateQueries({ queryKey: ['careers'] });
    },
    onError: (e: any) =>
      toast({
        title: 'Không thể xin thôi việc',
        description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.',
        variant: 'error',
      }),
  });

  const jobs = data?.jobs ?? [];
  const employment = data?.employment;
  const canPostJobs = data?.canPostJobs ?? false;
  const canApply = data?.canApplyJobs ?? false;
  const applyBlocker = data?.applyBlocker ?? null;
  const myApplications = data?.myApplications ?? [];
  const incomingApplications = data?.incomingApplications ?? [];

  const candidateJobs = useMemo(() => jobs.filter((j) => !j.isMine), [jobs]);
  const myJobs = useMemo(() => jobs.filter((j) => j.isMine), [jobs]);
  const pendingIncoming = useMemo(
    () => incomingApplications.filter((a) => a.status === 'pending'),
    [incomingApplications],
  );

  const stats = useMemo(() => {
    const open = jobs.filter((j) => j.postingStatus === 'open').length;
    const pendingMine = myApplications.filter((a) => a.status === 'pending').length;
    return { total: jobs.length, open, pendingMine, pendingIncoming: pendingIncoming.length };
  }, [jobs, myApplications, pendingIncoming.length]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tuyển dụng" />
        <Panel title="Đang tải dữ liệu" borderColor="default">
          <p className="text-sm text-slate-600">Đang tải trang tuyển dụng...</p>
        </Panel>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tuyển dụng" />
        <Panel title="Lỗi tải dữ liệu" borderColor="rose">
          <p className="text-sm text-rose-700">Không thể tải dữ liệu tuyển dụng. Vui lòng kiểm tra kết nối và thử lại.</p>
          <div className="mt-3">
            <GameButton variant="outline" size="sm" onClick={() => void refetch()}>
              Thử lại
            </GameButton>
          </div>
        </Panel>
      </div>
    );
  }

  const renderJobMeta = (job: RecruitmentJobDto, showOwnerPendingCount = false) => (
    <>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
          <div className="text-slate-500">Lương</div>
          <div className="font-semibold text-slate-800">{moneyText(job.baseSalary)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
          <div className="text-slate-500">Ngành</div>
          <div className="font-semibold text-slate-800">{job.industry}</div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
          <div className="text-slate-500">Chỉ tiêu</div>
          <div className="font-semibold text-slate-800">{job.openings}</div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
          <div className="text-slate-500">Tín dụng tối thiểu</div>
          <div className="font-semibold text-slate-800">{job.minCreditScore}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-600">
        Yêu cầu bằng cấp/chứng chỉ:{' '}
        <span className="font-medium text-slate-800">{job.requiredDegree || 'Không yêu cầu'}</span>
        {job.blocker ? <span className="ml-2 text-amber-700">• {job.blocker}</span> : null}
      </div>
      {showOwnerPendingCount && job.isMine && (job.pendingApplicationsCount ?? 0) > 0 ? (
        <div className="mt-2 text-xs text-amber-700 font-medium">Hồ sơ chờ duyệt: {job.pendingApplicationsCount}</div>
      ) : null}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Tuyển dụng" />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {[
          { key: 'jobs' as const, label: 'Việc làm & hồ sơ của tôi' },
          { key: 'employer' as const, label: 'Nhà tuyển dụng & duyệt hồ sơ' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
            {tab.key === 'jobs' && stats.pendingMine > 0 ? (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {stats.pendingMine}
              </span>
            ) : null}
            {tab.key === 'employer' && stats.pendingIncoming > 0 ? (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                {stats.pendingIncoming}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'jobs' && (
        <div className="space-y-4">
          <Panel title="Trạng thái ứng tuyển của bạn" borderColor="emerald">
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={canApply ? 'success' : 'warning'}>
                    {canApply ? 'Bạn có thể gửi hồ sơ ứng tuyển' : 'Không thể ứng tuyển hiện tại'}
                  </Badge>
                  <Badge variant="default">Tin hiển thị: {candidateJobs.length}</Badge>
                  <Badge variant="success">Đang mở: {stats.open}</Badge>
                  {stats.pendingMine > 0 ? <Badge variant="warning">Hồ sơ chờ duyệt: {stats.pendingMine}</Badge> : null}
                  {applyBlocker ? <span className="text-slate-600">{applyBlocker}</span> : null}
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Khi ứng tuyển vào vị trí của người chơi/chủ doanh nghiệp, bạn sẽ <b>gửi hồ sơ chờ duyệt</b>. Chỉ khi chủ doanh nghiệp duyệt,
                  bạn mới chính thức nhận việc.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Việc làm hiện tại</p>
                    {employment ? (
                      <>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{employment.title}</p>
                          {employment.status === 'active' ? <Badge variant="success">Đang làm việc</Badge> : null}
                          {employment.status === 'notice_pending' ? (
                            <Badge variant="warning">
                              Đang báo trước nghỉ việc (Còn {Math.max(0, employment.daysUntilResign ?? 0)} ngày game)
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                          {employment.companyName ? <div>Công ty: <span className="font-medium text-slate-800">{employment.companyName}</span></div> : null}
                          <div>Lương: <span className="font-medium text-slate-800">{moneyText(employment.salary)}</span></div>
                          {employment.status === 'notice_pending' && employment.effectiveResignGameYear != null && employment.effectiveResignGameDay != null ? (
                            <div>Hiệu lực nghỉ việc: {formatGameDate(employment.effectiveResignGameDay, employment.effectiveResignGameYear)}</div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-slate-600">Chưa có việc làm hiện tại.</p>
                    )}
                  </div>

                  {employment ? (
                    <div className="sm:min-w-[220px] space-y-2">
                      {employment.status === 'active' && (employment.isOwnerRole || employment.isCompanyOwner) ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Cần chuyển giao hoặc giải thể công ty trước khi rời vị trí.
                        </div>
                      ) : null}

                      {employment.status === 'active' && !employment.isOwnerRole && !employment.isCompanyOwner ? (
                        <GameButton
                          variant="outline"
                          size="sm"
                          className="w-full border-rose-300 text-rose-700 hover:bg-rose-50"
                          disabled={resignEmployment.isPending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Xác nhận xin thôi việc?',
                              type: 'warning',
                              confirmText: 'Xin thôi việc',
                              cancelText: 'Hủy',
                              message:
                                'Bạn cần báo trước 10 ngày game trước khi chính thức nghỉ việc. Lương kỳ hiện tại sẽ được thanh toán theo tỷ lệ số ngày đã làm thực tế.',
                            });
                            if (!ok) return;
                            resignEmployment.mutate();
                          }}
                        >
                          {resignEmployment.isPending ? 'Đang xử lý...' : 'Xin thôi việc'}
                        </GameButton>
                      ) : null}

                      {employment.status === 'notice_pending' ? (
                        <p className="text-xs text-slate-600">
                          Bạn vẫn làm việc bình thường trong thời gian báo trước và có thể nhận việc mới sau khi chính thức nghỉ việc.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Hồ sơ ứng tuyển của tôi" borderColor="default">
            {myApplications.length === 0 ? (
              <p className="text-sm text-slate-600">Bạn chưa gửi hồ sơ ứng tuyển nào.</p>
            ) : (
              <div className="space-y-2">
                {myApplications.map((app) => (
                  <div key={app.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{app.jobTitle}</p>
                          <Badge variant={appStatusVariant(app.status)}>{appStatusLabel(app.status)}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {app.companyName ? `Công ty: ${app.companyName}` : 'Công ty'} • Gửi lúc: {fmtDateTime(app.createdAt)}
                        </p>
                        {app.salary ? (
                          <p className="mt-0.5 text-xs text-slate-600">Lương đề xuất: {moneyText(app.salary)}</p>
                        ) : null}
                        {app.decisionNote ? (
                          <p className="mt-1 text-xs text-slate-700">
                            Ghi chú xử lý: <span className="font-medium">{app.decisionNote}</span>
                          </p>
                        ) : null}
                      </div>
                      {app.decidedAt ? <div className="text-[11px] text-slate-500">Xử lý: {fmtDateTime(app.decidedAt)}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Tin tuyển dụng" borderColor="emerald">
            <div className="space-y-3">
              {candidateJobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 bg-slate-50/60 space-y-2">
                  <p className="text-sm font-medium text-slate-800">Chưa có tin tuyển dụng phù hợp</p>
                  <p className="text-xs text-slate-600">
                    Hiện chưa có đợt tuyển dụng mở để bạn ứng tuyển. Bạn có thể làm mới danh sách hoặc kiểm tra lại sau.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <GameButton variant="outline" size="sm" onClick={() => void refetch()}>
                      Làm mới danh sách
                    </GameButton>
                  </div>
                </div>
              ) : (
                candidateJobs.map((job) => {
                  const isActing = applyJob.isPending && applyJob.variables === job.id;
                  const hasPending = !!job.hasPendingApplication;
                  return (
                    <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{job.title}</h3>
                            <Badge variant={job.postingStatus === 'open' ? 'success' : job.postingStatus === 'closed' ? 'warning' : 'default'}>
                              {jobStatusLabel(job)}
                            </Badge>
                            {hasPending ? <Badge variant="warning">Đang chờ duyệt</Badge> : null}
                            {job.postingStatus === 'open' && !hasPending ? (
                              <Badge variant={job.canApply ? 'success' : job.eligible ? 'default' : 'warning'}>
                                {job.canApply ? 'Có thể gửi hồ sơ' : job.eligible ? 'Đủ yêu cầu vị trí' : 'Chưa đạt yêu cầu'}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {job.companyName ? `Công ty: ${job.companyName}` : 'Công ty'}
                            {job.ownerName ? ` • Chủ: ${job.ownerName}` : ''}
                          </div>
                          {renderJobMeta(job)}
                        </div>
                        <div className="flex sm:flex-col gap-2 sm:min-w-[190px]">
                          {job.postingStatus === 'open' ? (
                            <GameButton
                              variant="primary"
                              size="sm"
                              className="w-full"
                              disabled={!job.canApply || isActing || hasPending}
                              onClick={() => applyJob.mutate(job.id)}
                              title={
                                hasPending
                                  ? 'Bạn đã gửi hồ sơ và đang chờ duyệt'
                                  : !canApply
                                    ? (applyBlocker || 'Không đủ điều kiện ứng tuyển')
                                    : !job.eligible
                                      ? (job.blocker || 'Chưa đáp ứng yêu cầu vị trí')
                                      : 'Gửi hồ sơ ứng tuyển (chờ duyệt)'
                              }
                            >
                              {isActing ? 'Đang gửi...' : hasPending ? 'Đã gửi hồ sơ' : 'Gửi hồ sơ'}
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
      )}

      {activeTab === 'employer' && (
        <div className="space-y-4">
          {!canPostJobs ? (
            <Panel title="Nhà tuyển dụng" borderColor="default">
              <p className="text-sm text-slate-600">
                Chỉ nhân vật đang sở hữu công ty (hoạt động/IPO) mới có thể đăng tin tuyển dụng và duyệt hồ sơ ứng viên. Hãy thành lập công ty tại trang Doanh nghiệp.
              </p>
            </Panel>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.95fr]">
              <div className="space-y-4">
                <Panel title="Hồ sơ ứng tuyển cần duyệt" borderColor="amber">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={pendingIncoming.length > 0 ? 'warning' : 'default'}>
                      Chờ duyệt: {pendingIncoming.length}
                    </Badge>
                    <Badge variant="default">Tổng hồ sơ nhận được: {incomingApplications.length}</Badge>
                  </div>
                  {incomingApplications.length === 0 ? (
                    <p className="text-sm text-slate-600">Chưa có hồ sơ ứng tuyển nào.</p>
                  ) : (
                    <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                      {incomingApplications.map((app) => {
                        const isPending = app.status === 'pending';
                        const isActing =
                          decideApplication.isPending && decideApplication.variables?.applicationId === app.id;
                        return (
                          <div key={app.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900">
                                    {app.applicantName || 'Ứng viên'}{' '}
                                    {app.applicantCccd ? (
                                      <span className="text-xs font-normal text-slate-500">({app.applicantCccd})</span>
                                    ) : null}
                                  </p>
                                  <Badge variant={appStatusVariant(app.status)}>{appStatusLabel(app.status)}</Badge>
                                </div>
                                <p className="mt-0.5 text-xs text-slate-700">
                                  Vị trí: <span className="font-medium">{app.jobTitle}</span>
                                  {app.companyName ? ` • ${app.companyName}` : ''}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-600">
                                  Gửi lúc: {fmtDateTime(app.createdAt)}
                                  {app.salary ? ` • Lương: ${moneyText(app.salary)}` : ''}
                                </p>
                                {app.decisionNote ? (
                                  <p className="mt-1 text-xs text-slate-600">Ghi chú: {app.decisionNote}</p>
                                ) : null}
                              </div>
                              <div className="flex gap-2 sm:flex-col sm:min-w-[150px]">
                                {isPending ? (
                                  <>
                                    <GameButton
                                      variant="primary"
                                      size="sm"
                                      className="w-full"
                                      disabled={isActing}
                                      onClick={async () => {
                                        const ok = await confirm({
                                          title: 'Duyệt hồ sơ ứng tuyển?',
                                          type: 'success',
                                          confirmText: 'Duyệt & nhận việc',
                                          message: `Duyệt và nhận ${app.applicantName || 'ứng viên'} vào vị trí "${app.jobTitle}"? Hệ thống sẽ tạo hợp đồng lao động nếu đủ điều kiện.`,
                                        });
                                        if (!ok) return;
                                        decideApplication.mutate({ applicationId: app.id, decision: 'approve' });
                                      }}
                                    >
                                      {isActing && decideApplication.variables?.decision === 'approve'
                                        ? 'Đang duyệt...'
                                        : 'Duyệt'}
                                    </GameButton>
                                    <GameButton
                                      variant="outline"
                                      size="sm"
                                      className="w-full"
                                      disabled={isActing}
                                      onClick={async () => {
                                        const reason = await prompt({
                                          title: 'Từ chối hồ sơ ứng tuyển?',
                                          message: `Nhập lý do từ chối (tùy chọn) cho hồ sơ của ${app.applicantName || 'ứng viên'}.`,
                                          placeholder: 'Lý do từ chối (tùy chọn)',
                                          confirmText: 'Từ chối hồ sơ',
                                          cancelText: 'Hủy',
                                          type: 'warning',
                                          multiline: true,
                                        });
                                        if (reason === null) return;
                                        decideApplication.mutate({
                                          applicationId: app.id,
                                          decision: 'reject',
                                          note: reason.trim() || null,
                                        });
                                      }}
                                    >
                                      {isActing && decideApplication.variables?.decision === 'reject'
                                        ? 'Đang xử lý...'
                                        : 'Từ chối'}
                                    </GameButton>
                                  </>
                                ) : (
                                  <div className="text-[11px] text-slate-500 text-right sm:text-center">
                                    Đã xử lý{app.decidedAt ? ` ${fmtDateTime(app.decidedAt)}` : ''}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>

                <Panel title="Tin tuyển dụng của công ty tôi" borderColor="emerald">
                  {myJobs.length === 0 ? (
                    <p className="text-sm text-slate-600">Bạn chưa đăng tin tuyển dụng nào.</p>
                  ) : (
                    <div className="space-y-3">
                      {myJobs.map((job) => {
                        const isActing =
                          (closeJob.isPending && closeJob.variables === job.id) ||
                          (deleteJob.isPending && deleteJob.variables === job.id);
                        return (
                          <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-semibold text-slate-900">{job.title}</h3>
                                  <Badge
                                    variant={
                                      job.postingStatus === 'open'
                                        ? 'success'
                                        : job.postingStatus === 'closed'
                                          ? 'warning'
                                          : 'default'
                                    }
                                  >
                                    {jobStatusLabel(job)}
                                  </Badge>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">{job.companyName || 'Công ty của bạn'}</div>
                                {renderJobMeta(job, true)}
                                {job.postingStatus === 'closed' ? (
                                  <div className="mt-2 text-[11px] text-slate-600 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                                    Đã đóng{job.closedAt ? ` lúc ${fmtDateTime(job.closedAt)}` : ''}.
                                    {job.canDelete
                                      ? ' Đã đủ 1 ngày game — có thể xóa.'
                                      : ' Cần chờ ít nhất 1 ngày game kể từ khi đóng để xóa.'}
                                    {job.deleteEligibleAt ? ` (${job.deleteEligibleAt})` : ''}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex sm:flex-col gap-2 sm:min-w-[190px]">
                                {job.postingStatus === 'open' ? (
                                  <GameButton
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    disabled={!job.canClose || isActing}
                                    onClick={() => closeJob.mutate(job.id)}
                                    title="Đóng đợt tuyển (ngừng nhận hồ sơ). Hồ sơ chờ duyệt sẽ bị hủy."
                                  >
                                    {closeJob.isPending && closeJob.variables === job.id ? 'Đang đóng...' : 'Đóng đợt tuyển'}
                                  </GameButton>
                                ) : null}
                                {job.postingStatus === 'closed' ? (
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
                                        confirmText: 'Xóa',
                                        message: 'Hành động này không thể hoàn tác.',
                                      });
                                      if (!ok) return;
                                      deleteJob.mutate(job.id);
                                    }}
                                    title={job.canDelete ? 'Xóa đợt tuyển' : 'Chưa đủ 1 ngày game kể từ khi đóng'}
                                  >
                                    {deleteJob.isPending && deleteJob.variables === job.id
                                      ? 'Đang xóa...'
                                      : job.canDelete
                                        ? 'Xóa đợt tuyển'
                                        : 'Chờ 1 ngày game để xóa'}
                                  </GameButton>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              </div>

              <div className="space-y-4">
                <Panel title="Đăng tin tuyển dụng" borderColor="default">
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
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.status})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        Công ty: <span className="font-medium text-slate-800">{myCompanies[0]?.name}</span>
                      </div>
                    )}

                    <GameInput
                      label="Tiêu đề vị trí"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="VD: Nhân viên kế toán, Kỹ sư vận hành..."
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-sm">
                        <span className="mb-1 block text-slate-700">Ngành</span>
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={industry}
                          onChange={(e) => setIndustry(e.target.value as IndustryType)}
                        >
                          {INDUSTRIES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <GameInput
                        label="Lương cơ bản (VND)"
                        type="number"
                        min={0}
                        value={salary}
                        onChange={(e) => setSalary(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <GameInput
                        label="Số lượng tuyển"
                        type="number"
                        min={1}
                        value={openings}
                        onChange={(e) => setOpenings(e.target.value)}
                      />
                      <GameInput
                        label="Tín dụng tối thiểu"
                        type="number"
                        min={0}
                        value={minCreditScore}
                        onChange={(e) => setMinCreditScore(e.target.value)}
                      />
                      <GameInput
                        label="Năng lượng"
                        type="number"
                        min={0}
                        value={energyCost}
                        onChange={(e) => setEnergyCost(e.target.value)}
                      />
                    </div>
                    <GameInput
                      label="Yêu cầu bằng cấp/chứng chỉ"
                      value={requiredDegree}
                      onChange={(e) => setRequiredDegree(e.target.value)}
                      placeholder="VD: uni_bachelor_tech hoặc để trống"
                    />

                    <GameButton
                      variant="primary"
                      onClick={() => {
                        if (!effectiveCompanyId)
                          return toast({ title: 'Thiếu công ty', description: 'Vui lòng chọn công ty đăng tuyển.', variant: 'error' });
                        if (!title.trim())
                          return toast({ title: 'Thiếu tiêu đề', description: 'Vui lòng nhập tiêu đề vị trí.', variant: 'error' });
                        createJob.mutate();
                      }}
                      disabled={createJob.isPending}
                      className="w-full"
                    >
                      {createJob.isPending ? 'Đang đăng...' : 'Đăng tin tuyển dụng'}
                    </GameButton>
                    <p className="text-[11px] text-slate-500">
                      Người chơi ứng tuyển sẽ gửi hồ sơ chờ bạn duyệt. Chỉ khi bạn duyệt, ứng viên mới nhận việc và trừ chỉ tiêu tuyển.
                    </p>
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
