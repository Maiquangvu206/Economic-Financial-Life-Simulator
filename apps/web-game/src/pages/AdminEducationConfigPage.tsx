import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { useToast } from '../shared/ui/Toast';
import type { AdminEducationConfigDto, AdminUniversityDto, AdminJobDto } from '@efls/contracts';

const INDUSTRIES = [
  'finance_banking','technology_ai','real_estate','logistics','healthcare','education','agriculture','manufacturing','energy','entertainment','hospitality','retail'
];

type UniForm = { name: string; degreeCode: string; field: string; tuitionMinor: string; durationMonths: string; postGradSalaryMinor: string };
type JobForm = { title: string; industry: string; baseSalaryMinor: string; requiredDegree: string; minCreditScore: string; energyCost: string; openings: string };

const emptyUni: UniForm = { name: '', degreeCode: '', field: 'education', tuitionMinor: '0', durationMonths: '12', postGradSalaryMinor: '' };
const emptyJob: JobForm = { title: '', industry: 'education', baseSalaryMinor: '0', requiredDegree: '', minCreditScore: '0', energyCost: '10', openings: '1' };

export function AdminEducationConfigPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<AdminEducationConfigDto>({
    queryKey: ['admin','education','config'],
    queryFn: () => apiRequest<AdminEducationConfigDto>('/api/v1/admin/education/config'),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [editingUni, setEditingUni] = useState<AdminUniversityDto | null>(null);
  const [uniForm, setUniForm] = useState<UniForm>(emptyUni);
  const [editingJob, setEditingJob] = useState<AdminJobDto | null>(null);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJob);

  const universities = data?.universities ?? [];
  const jobs = data?.jobs ?? [];
  const degreeOptions = useMemo(() => Array.from(new Set(universities.map(u => u.degreeCode))).sort(), [universities]);

  function startEditUni(u: AdminUniversityDto) {
    setEditingUni(u);
    setUniForm({
      name: u.name, degreeCode: u.degreeCode, field: u.field,
      tuitionMinor: String(u.tuition?.amount ?? 0),
      durationMonths: String(u.durationMonths),
      postGradSalaryMinor: u.postGradSalary ? String(u.postGradSalary.amount) : '',
    });
  }
  function resetUni() { setEditingUni(null); setUniForm(emptyUni); }

  async function saveUni(e: React.FormEvent) {
    e.preventDefault();
    setBusy('uni');
    try {
      const body = {
        name: uniForm.name.trim(),
        degreeCode: uniForm.degreeCode.trim(),
        field: uniForm.field,
        tuitionMinor: Math.max(0, Math.round(Number(uniForm.tuitionMinor || 0))),
        durationMonths: Math.max(1, Math.round(Number(uniForm.durationMonths || 1))),
        ...(uniForm.postGradSalaryMinor !== '' ? { postGradSalaryMinor: Math.max(0, Math.round(Number(uniForm.postGradSalaryMinor || 0))) } : {}),
      };
      if (!body.name || !body.degreeCode) throw new Error('Tên trường và mã ngành/bằng cấp là bắt buộc.');
      if (editingUni) {
        await apiRequest(`/api/v1/admin/education/universities/${editingUni.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast({ title: 'Đã cập nhật trường/ngành', description: body.name, variant: 'success' });
      } else {
        await apiRequest('/api/v1/admin/education/universities', { method: 'POST', body: JSON.stringify(body) });
        toast({ title: 'Đã thêm trường/ngành', description: body.name, variant: 'success' });
      }
      resetUni();
      await refetch();
    } catch (err: any) {
      toast({ title: 'Lỗi lưu trường/ngành', description: err?.message || 'Không thể lưu.', variant: 'error' });
    } finally { setBusy(null); }
  }

  async function removeUni(id: string) {
    if (!confirm('Xóa trường/ngành này?')) return;
    setBusy(`del-uni-${id}`);
    try {
      await apiRequest(`/api/v1/admin/education/universities/${id}`, { method: 'DELETE' });
      toast({ title: 'Đã xóa', description: 'Đã xóa trường/ngành.', variant: 'success' });
      await refetch();
    } catch (err: any) {
      toast({ title: 'Không thể xóa', description: err?.message || 'Có thể đang được tham chiếu.', variant: 'error' });
    } finally { setBusy(null); }
  }

  function startEditJob(j: AdminJobDto) {
    setEditingJob(j);
    setJobForm({
      title: j.title, industry: j.industry, baseSalaryMinor: String(j.baseSalary?.amount ?? 0),
      requiredDegree: j.requiredDegree ?? '', minCreditScore: String(j.minCreditScore ?? 0),
      energyCost: String(j.energyCost ?? 10), openings: String(j.openings ?? 1),
    });
  }
  function resetJob() { setEditingJob(null); setJobForm(emptyJob); }

  async function saveJob(e: React.FormEvent) {
    e.preventDefault();
    setBusy('job');
    try {
      const body = {
        title: jobForm.title.trim(),
        industry: jobForm.industry,
        baseSalaryMinor: Math.max(0, Math.round(Number(jobForm.baseSalaryMinor || 0))),
        requiredDegree: jobForm.requiredDegree.trim() || null,
        minCreditScore: Math.round(Number(jobForm.minCreditScore || 0)),
        energyCost: Math.max(0, Math.round(Number(jobForm.energyCost || 0))),
        openings: Math.max(0, Math.round(Number(jobForm.openings || 0))),
      };
      if (!body.title) throw new Error('Tên công việc là bắt buộc.');
      if (editingJob) {
        await apiRequest(`/api/v1/admin/education/jobs/${editingJob.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast({ title: 'Đã cập nhật công việc/lương', description: body.title, variant: 'success' });
      } else {
        await apiRequest('/api/v1/admin/education/jobs', { method: 'POST', body: JSON.stringify(body) });
        toast({ title: 'Đã thêm công việc/lương', description: body.title, variant: 'success' });
      }
      resetJob();
      await refetch();
    } catch (err: any) {
      toast({ title: 'Lỗi lưu công việc', description: err?.message || 'Không thể lưu.', variant: 'error' });
    } finally { setBusy(null); }
  }

  async function removeJob(id: string) {
    if (!confirm('Xóa công việc này?')) return;
    setBusy(`del-job-${id}`);
    try {
      await apiRequest(`/api/v1/admin/education/jobs/${id}`, { method: 'DELETE' });
      toast({ title: 'Đã xóa', description: 'Đã xóa công việc.', variant: 'success' });
      await refetch();
    } catch (err: any) {
      toast({ title: 'Không thể xóa', description: err?.message || 'Có thể đang được tham chiếu.', variant: 'error' });
    } finally { setBusy(null); }
  }

  if (isLoading) return <div className="p-6 text-sm text-slate-600">Đang tải cấu hình giáo dục...</div>;

  return (
    <div className="space-y-5">
      <PageHeader title="Cấu hình Giáo dục (Admin)" description="Thiết lập ngành/trường, học phí, thời gian học và mức lương sau tốt nghiệp." />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={editingUni ? 'Sửa trường/ngành' : 'Thêm trường/ngành'} borderColor="emerald">
          <form onSubmit={saveUni} className="space-y-3">
            <GameInput label="Tên trường" value={uniForm.name} onChange={(e) => setUniForm({ ...uniForm, name: e.target.value })} />
            <GameInput label="Mã ngành/bằng cấp (degree_code)" value={uniForm.degreeCode} onChange={(e) => setUniForm({ ...uniForm, degreeCode: e.target.value })} />
            <div>
              <label className="text-xs font-medium text-slate-700">Ngành/Lĩnh vực (field)</label>
              <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={uniForm.field} onChange={(e) => setUniForm({ ...uniForm, field: e.target.value })}>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <GameInput label="Học phí/tháng (VNĐ)" type="number" value={uniForm.tuitionMinor} onChange={(e) => setUniForm({ ...uniForm, tuitionMinor: e.target.value })} />
            <div className="text-[11px] text-slate-500 -mt-1">Tổng học phí = học phí/tháng × thời gian học: <span className="font-mono text-emerald-700">{formatMoney(Math.max(0, Math.round(Number(uniForm.tuitionMinor || 0))) * Math.max(1, Math.round(Number(uniForm.durationMonths || 1))))}</span></div>
            <GameInput label="Thời gian học (tháng)" type="number" value={uniForm.durationMonths} onChange={(e) => setUniForm({ ...uniForm, durationMonths: e.target.value })} />
            <GameInput label="Mức lương sau tốt nghiệp (VNĐ, tùy chọn - áp dụng cho việc làm theo bằng cấp)" type="number" value={uniForm.postGradSalaryMinor} onChange={(e) => setUniForm({ ...uniForm, postGradSalaryMinor: e.target.value })} />
            <div className="flex gap-2 justify-end">
              {editingUni && <button type="button" onClick={resetUni} className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">Hủy</button>}
              <GameButton variant="primary" loading={busy==='uni'} disabled={busy==='uni'}>{editingUni ? 'Cập nhật' : 'Thêm trường/ngành'}</GameButton>
            </div>
          </form>
        </Panel>

        <Panel title="Danh sách trường/ngành" borderColor="default">
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {universities.map(u => (
              <div key={u.id} className="rounded-xl border border-slate-200 p-3 bg-white/50 flex items-start justify-between gap-2">
                <div className="text-sm">
                  <div className="font-semibold text-slate-800">{u.name} <span className="text-xs font-mono text-emerald-700">({u.degreeCode})</span></div>
                  <div className="text-xs text-slate-600 mt-0.5">Ngành: {u.field} · Học phí: {formatMoney(u.tuition.amount)}/tháng · Thời gian: {u.durationMonths} tháng · Tổng: {formatMoney(u.tuition.amount * u.durationMonths)}</div>
                  <div className="text-xs text-slate-600">Lương sau tốt nghiệp: {u.postGradSalary ? formatMoney(u.postGradSalary.amount) : '—'}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <GameButton size="sm" variant="outline" onClick={() => startEditUni(u)}>Sửa</GameButton>
                  <GameButton size="sm" variant="danger" disabled={busy===`del-uni-${u.id}`} onClick={() => void removeUni(u.id)}>Xóa</GameButton>
                </div>
              </div>
            ))}
            {universities.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Chưa có trường/ngành.</div>}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={editingJob ? 'Sửa công việc / mức lương' : 'Thêm công việc / mức lương'} borderColor="amber">
          <form onSubmit={saveJob} className="space-y-3">
            <GameInput label="Tên công việc" value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} />
            <div>
              <label className="text-xs font-medium text-slate-700">Ngành/Lĩnh vực</label>
              <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={jobForm.industry} onChange={(e) => setJobForm({ ...jobForm, industry: e.target.value })}>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <GameInput label="Mức lương cơ bản (VNĐ)" type="number" value={jobForm.baseSalaryMinor} onChange={(e) => setJobForm({ ...jobForm, baseSalaryMinor: e.target.value })} />
            <div>
              <label className="text-xs font-medium text-slate-700">Yêu cầu bằng cấp (required_degree, tùy chọn)</label>
              <input list="degree-codes" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={jobForm.requiredDegree} onChange={(e) => setJobForm({ ...jobForm, requiredDegree: e.target.value })} placeholder="vd: BK_HUST" />
              <datalist id="degree-codes">{degreeOptions.map(d => <option key={d} value={d} />)}</datalist>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <GameInput label="Điểm tín dụng tối thiểu" type="number" value={jobForm.minCreditScore} onChange={(e) => setJobForm({ ...jobForm, minCreditScore: e.target.value })} />
              <GameInput label="Năng lượng" type="number" value={jobForm.energyCost} onChange={(e) => setJobForm({ ...jobForm, energyCost: e.target.value })} />
              <GameInput label="Số vị trí" type="number" value={jobForm.openings} onChange={(e) => setJobForm({ ...jobForm, openings: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              {editingJob && <button type="button" onClick={resetJob} className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">Hủy</button>}
              <GameButton variant="primary" loading={busy==='job'} disabled={busy==='job'}>{editingJob ? 'Cập nhật' : 'Thêm công việc'}</GameButton>
            </div>
          </form>
        </Panel>

        <Panel title="Danh sách công việc & mức lương sau tốt nghiệp" borderColor="default">
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {jobs.map(j => (
              <div key={j.id} className="rounded-xl border border-slate-200 p-3 bg-white/50 flex items-start justify-between gap-2">
                <div className="text-sm">
                  <div className="font-semibold text-slate-800">{j.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">Ngành: {j.industry} · Lương: {formatMoney(j.baseSalary.amount)} · Yêu cầu bằng: {j.requiredDegree || '—'}</div>
                  <div className="text-xs text-slate-600">Tín dụng ≥ {j.minCreditScore} · Năng lượng {j.energyCost} · Vị trí {j.openings}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <GameButton size="sm" variant="outline" onClick={() => startEditJob(j)}>Sửa</GameButton>
                  <GameButton size="sm" variant="danger" disabled={busy===`del-job-${j.id}`} onClick={() => void removeJob(j.id)}>Xóa</GameButton>
                </div>
              </div>
            ))}
            {jobs.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Chưa có công việc.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
