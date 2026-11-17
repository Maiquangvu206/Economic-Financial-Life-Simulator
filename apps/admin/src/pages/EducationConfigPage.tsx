import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { adminRequest } from '../shared/api/httpClient';
import { useDialog } from '../shared/ui/DialogContext';

type Money = { amount: number; currency: 'VND' };
type AdminUniversityDto = { id: string; name: string; degreeCode: string; field: string; tuition: Money; durationMonths: number; postGradSalary?: Money | null };
type AdminJobDto = { id: string; title: string; industry: string; baseSalary: Money; requiredDegree: string | null; minCreditScore: number; energyCost: number; openings: number };
type AdminEducationConfigDto = { universities: AdminUniversityDto[]; jobs: AdminJobDto[] };

const INDUSTRY_LABEL: Record<string, string> = {
  finance_banking: 'Tài chính - Ngân hàng',
  technology_ai: 'Công nghệ & AI',
  real_estate: 'Bất động sản',
  logistics: 'Logistics',
  healthcare: 'Y tế',
  education: 'Giáo dục',
  agriculture: 'Nông nghiệp',
  manufacturing: 'Sản xuất',
  energy: 'Năng lượng',
  energy_mining: 'Năng lượng & Khai khoáng',
  entertainment: 'Giải trí',
  hospitality: 'Du lịch - Khách sạn',
  retail: 'Bán lẻ',
};
function industryLabel(v: string) { return INDUSTRY_LABEL[v] ?? v; }

const INDUSTRIES = [
  'finance_banking','technology_ai','real_estate','logistics','healthcare','education','agriculture','manufacturing','energy','entertainment','hospitality','retail'
];

const UNIVERSITY_NAME_LABEL: Record<string, string> = {
  'City Law Academy': 'Học viện Luật Thành phố',
  'Institute of Technology': 'Học viện Công nghệ',
  'Metro Business School': 'Trường Kinh doanh Đô thị',
};
const DEGREE_CODE_LABEL: Record<string, string> = {
  law: 'Luật',
  computer_science: 'Khoa học máy tính',
  business: 'Kinh tế / Kinh doanh',
};
function universityNameLabel(name: string) {
  for (const [en, vi] of Object.entries(UNIVERSITY_NAME_LABEL)) {
    if (name.toLowerCase().includes(en.toLowerCase())) return name.replace(new RegExp(en, 'i'), vi);
  }
  return name;
}
function degreeCodeLabel(code: string) {
  return DEGREE_CODE_LABEL[code?.toLowerCase?.()] ?? code;
}

type UniForm = { name: string; degreeCode: string; field: string; tuitionMinor: string; durationMonths: string; postGradSalaryMinor: string };
type JobForm = { title: string; industry: string; baseSalaryMinor: string; requiredDegree: string; minCreditScore: string; energyCost: string; openings: string };

const emptyUni: UniForm = { name: '', degreeCode: '', field: 'education', tuitionMinor: '0', durationMonths: '12', postGradSalaryMinor: '' };
const emptyJob: JobForm = { title: '', industry: 'education', baseSalaryMinor: '0', requiredDegree: '', minCreditScore: '0', energyCost: '10', openings: '1' };

function fmtMoney(amount: number) {
  return `${(amount ?? 0).toLocaleString('vi-VN')} ₫`;
}

export function EducationConfigPage() {
  const { confirm } = useDialog();
  const { data, isLoading, error, refetch } = useQuery<AdminEducationConfigDto>({
    queryKey: ['admin','education','config'],
    queryFn: () => adminRequest<AdminEducationConfigDto>('/api/v1/admin/education/config'),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [editingUni, setEditingUni] = useState<AdminUniversityDto | null>(null);
  const [uniForm, setUniForm] = useState<UniForm>(emptyUni);
  const [editingJob, setEditingJob] = useState<AdminJobDto | null>(null);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJob);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const universities = data?.universities ?? [];
  const jobs = data?.jobs ?? [];
  const degreeOptions = useMemo(() => Array.from(new Set(universities.map(u => u.degreeCode))).sort(), [universities]);

  function notify(type: 'ok' | 'err', text: string) { setMsg({ type, text }); setTimeout(() => setMsg(null), 3500); }
  function startEditUni(u: AdminUniversityDto) {
    setEditingUni(u);
    setUniForm({ name: u.name, degreeCode: u.degreeCode, field: u.field, tuitionMinor: String(u.tuition?.amount ?? 0), durationMonths: String(u.durationMonths), postGradSalaryMinor: u.postGradSalary ? String(u.postGradSalary.amount) : '' });
  }
  function resetUni() { setEditingUni(null); setUniForm(emptyUni); }
  function startEditJob(j: AdminJobDto) {
    setEditingJob(j);
    setJobForm({ title: j.title, industry: j.industry, baseSalaryMinor: String(j.baseSalary?.amount ?? 0), requiredDegree: j.requiredDegree ?? '', minCreditScore: String(j.minCreditScore ?? 0), energyCost: String(j.energyCost ?? 10), openings: String(j.openings ?? 1) });
  }
  function resetJob() { setEditingJob(null); setJobForm(emptyJob); }

  async function saveUni(e: React.FormEvent) {
    e.preventDefault();
    setBusy('uni');
    try {
      const body = {
        name: uniForm.name.trim(), degreeCode: uniForm.degreeCode.trim(), field: uniForm.field,
        tuitionMinor: Math.max(0, Math.round(Number(uniForm.tuitionMinor || 0))),
        durationMonths: Math.max(1, Math.round(Number(uniForm.durationMonths || 1))),
        ...(uniForm.postGradSalaryMinor !== '' ? { postGradSalaryMinor: Math.max(0, Math.round(Number(uniForm.postGradSalaryMinor || 0))) } : {}),
      };
      if (!body.name || !body.degreeCode) throw new Error('Tên trường và mã ngành/bằng cấp là bắt buộc.');
      if (editingUni) await adminRequest(`/api/v1/admin/education/universities/${editingUni.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminRequest('/api/v1/admin/education/universities', { method: 'POST', body: JSON.stringify(body) });
      notify('ok', editingUni ? 'Đã cập nhật trường/ngành.' : 'Đã thêm trường/ngành.');
      resetUni(); await refetch();
    } catch (err: any) { notify('err', err?.message || 'Không thể lưu trường/ngành.'); } finally { setBusy(null); }
  }
  async function removeUni(id: string) {
    if (!(await confirm({ title: 'Xóa trường/ngành này?', type: 'danger', confirmText: 'Xóa' }))) return;
    setBusy(`del-uni-${id}`);
    try { await adminRequest(`/api/v1/admin/education/universities/${id}`, { method: 'DELETE' }); notify('ok', 'Đã xóa trường/ngành.'); await refetch(); }
    catch (err: any) { notify('err', err?.message || 'Không thể xóa (có thể đang được tham chiếu).'); } finally { setBusy(null); }
  }
  async function saveJob(e: React.FormEvent) {
    e.preventDefault();
    setBusy('job');
    try {
      const body = {
        title: jobForm.title.trim(), industry: jobForm.industry,
        baseSalaryMinor: Math.max(0, Math.round(Number(jobForm.baseSalaryMinor || 0))),
        requiredDegree: jobForm.requiredDegree.trim() || null,
        minCreditScore: Math.round(Number(jobForm.minCreditScore || 0)),
        energyCost: Math.max(0, Math.round(Number(jobForm.energyCost || 0))),
        openings: Math.max(0, Math.round(Number(jobForm.openings || 0))),
      };
      if (!body.title) throw new Error('Tên công việc là bắt buộc.');
      if (editingJob) await adminRequest(`/api/v1/admin/education/jobs/${editingJob.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminRequest('/api/v1/admin/education/jobs', { method: 'POST', body: JSON.stringify(body) });
      notify('ok', editingJob ? 'Đã cập nhật công việc/mức lương.' : 'Đã thêm công việc/mức lương.');
      resetJob(); await refetch();
    } catch (err: any) { notify('err', err?.message || 'Không thể lưu công việc.'); } finally { setBusy(null); }
  }
  async function removeJob(id: string) {
    if (!(await confirm({ title: 'Xóa công việc này?', type: 'danger', confirmText: 'Xóa' }))) return;
    setBusy(`del-job-${id}`);
    try { await adminRequest(`/api/v1/admin/education/jobs/${id}`, { method: 'DELETE' }); notify('ok', 'Đã xóa công việc.'); await refetch(); }
    catch (err: any) { notify('err', err?.message || 'Không thể xóa.'); } finally { setBusy(null); }
  }

  const totalTuitionPreview = Math.max(0, Math.round(Number(uniForm.tuitionMinor || 0))) * Math.max(1, Math.round(Number(uniForm.durationMonths || 1)));

  return (
    <div className="space-y-5">
      <PageHeader title="Cấu hình Giáo dục & Đại học" />

      {msg && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${msg.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {msg.type === 'ok' ? '✓ ' : '⚠ '}{msg.text}
        </div>
      )}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được cấu hình: {(error as any)?.message || 'Lỗi'}</div>}
      {isLoading && <div className="text-sm text-slate-600">Đang tải cấu hình giáo dục...</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">{editingUni ? 'Sửa trường/ngành' : 'Thêm trường/ngành'}</h2>
          <form onSubmit={saveUni} className="space-y-3 text-sm">
            <label className="block text-xs text-slate-700">Tên trường<input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={uniForm.name} onChange={e=>setUniForm({...uniForm,name:e.target.value})} /></label>
            <label className="block text-xs text-slate-700">Mã ngành/bằng cấp<input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={uniForm.degreeCode} onChange={e=>setUniForm({...uniForm,degreeCode:e.target.value})} placeholder="Ví dụ: CNTT, KINH_TE" /></label>
            <label className="block text-xs text-slate-700">Ngành / Lĩnh vực<select className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={uniForm.field} onChange={e=>setUniForm({...uniForm,field:e.target.value})}>{INDUSTRIES.map(i=><option key={i} value={i}>{industryLabel(i)}</option>)}</select></label>
            <label className="block text-xs text-slate-700">Học phí/tháng (VNĐ)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={uniForm.tuitionMinor} onChange={e=>setUniForm({...uniForm,tuitionMinor:e.target.value})} /></label>
            <div className="text-[11px] text-slate-500">Tổng học phí = học phí/tháng × thời gian học: <span className="font-mono font-semibold text-emerald-700">{fmtMoney(totalTuitionPreview)}</span></div>
            <label className="block text-xs text-slate-700">Thời gian học (tháng)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={uniForm.durationMonths} onChange={e=>setUniForm({...uniForm,durationMonths:e.target.value})} /></label>
            <label className="block text-xs text-slate-700">Mức lương sau tốt nghiệp (VNĐ, tùy chọn - áp dụng việc làm theo bằng cấp)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={uniForm.postGradSalaryMinor} onChange={e=>setUniForm({...uniForm,postGradSalaryMinor:e.target.value})} /></label>
            <div className="flex gap-2 justify-end pt-1">
              {editingUni && <button type="button" onClick={resetUni} className="rounded-xl px-4 py-2 text-xs text-slate-600 hover:bg-slate-100">Hủy</button>}
              <button disabled={busy==='uni'} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60">{busy==='uni'?'Đang lưu...':(editingUni?'Cập nhật':'Thêm trường/ngành')}</button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Danh sách trường/ngành ({universities.length})</h2>
          <div className="space-y-2 max-h-[460px] overflow-auto pr-1">
            {universities.map(u => (
              <div key={u.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between gap-2 text-sm">
                <div>
                  <div className="font-semibold text-slate-800">{universityNameLabel(u.name)} <span className="text-xs font-mono text-emerald-700">({degreeCodeLabel(u.degreeCode)})</span></div>
                  <div className="text-xs text-slate-600 mt-0.5">Ngành: {industryLabel(u.field)} · Học phí: {fmtMoney(u.tuition.amount)}/tháng · {u.durationMonths} tháng · Tổng: {fmtMoney(u.tuition.amount * u.durationMonths)}</div>
                  <div className="text-xs text-slate-600">Lương sau tốt nghiệp: {u.postGradSalary ? fmtMoney(u.postGradSalary.amount) : '—'}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={()=>startEditUni(u)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-white">Sửa</button>
                  <button disabled={busy===`del-uni-${u.id}`} onClick={()=>void removeUni(u.id)} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60">Xóa</button>
                </div>
              </div>
            ))}
            {universities.length===0 && !isLoading && <div className="text-xs text-slate-500 text-center py-4">Chưa có trường/ngành.</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">{editingJob ? 'Sửa công việc / mức lương' : 'Thêm công việc / mức lương sau tốt nghiệp'}</h2>
          <form onSubmit={saveJob} className="space-y-3 text-sm">
            <label className="block text-xs text-slate-700">Tên công việc<input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.title} onChange={e=>setJobForm({...jobForm,title:e.target.value})} /></label>
            <label className="block text-xs text-slate-700">Ngành / Lĩnh vực<select className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.industry} onChange={e=>setJobForm({...jobForm,industry:e.target.value})}>{INDUSTRIES.map(i=><option key={i} value={i}>{industryLabel(i)}</option>)}</select></label>
            <label className="block text-xs text-slate-700">Mức lương cơ bản (VNĐ)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.baseSalaryMinor} onChange={e=>setJobForm({...jobForm,baseSalaryMinor:e.target.value})} /></label>
            <label className="block text-xs text-slate-700">Bằng cấp yêu cầu (không bắt buộc)<input list="degree-codes-admin" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.requiredDegree} onChange={e=>setJobForm({...jobForm,requiredDegree:e.target.value})} placeholder="Chọn hoặc nhập mã bằng cấp" /><datalist id="degree-codes-admin">{degreeOptions.map(d=><option key={d} value={d} />)}</datalist></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs text-slate-700">Điểm tín dụng<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.minCreditScore} onChange={e=>setJobForm({...jobForm,minCreditScore:e.target.value})} /></label>
              <label className="block text-xs text-slate-700">Năng lượng<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.energyCost} onChange={e=>setJobForm({...jobForm,energyCost:e.target.value})} /></label>
              <label className="block text-xs text-slate-700">Số vị trí<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" value={jobForm.openings} onChange={e=>setJobForm({...jobForm,openings:e.target.value})} /></label>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              {editingJob && <button type="button" onClick={resetJob} className="rounded-xl px-4 py-2 text-xs text-slate-600 hover:bg-slate-100">Hủy</button>}
              <button disabled={busy==='job'} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60">{busy==='job'?'Đang lưu...':(editingJob?'Cập nhật':'Thêm công việc')}</button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Danh sách công việc & mức lương sau tốt nghiệp ({jobs.length})</h2>
          <div className="space-y-2 max-h-[460px] overflow-auto pr-1">
            {jobs.map(j => (
              <div key={j.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between gap-2 text-sm">
                <div>
                  <div className="font-semibold text-slate-800">{j.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">Ngành: {industryLabel(j.industry)} · Lương: {fmtMoney(j.baseSalary.amount)} · Yêu cầu bằng: {j.requiredDegree ? degreeCodeLabel(j.requiredDegree) : '—'}</div>
                  <div className="text-xs text-slate-600">Tín dụng ≥ {j.minCreditScore} · Năng lượng {j.energyCost} · Vị trí {j.openings}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={()=>startEditJob(j)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-white">Sửa</button>
                  <button disabled={busy===`del-job-${j.id}`} onClick={()=>void removeJob(j.id)} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60">Xóa</button>
                </div>
              </div>
            ))}
            {jobs.length===0 && !isLoading && <div className="text-xs text-slate-500 text-center py-4">Chưa có công việc.</div>}
          </div>
        </div>
      </div>

</div>
  );
}
