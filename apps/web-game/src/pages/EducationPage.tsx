import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { useToast } from '../shared/ui/Toast';
import type { CareersOverviewExtDto, UnlockedFeature, EarlyGraduateResultDto, EarlyGraduateStartResponse } from '@efls/contracts';

const UNLOCK_LABEL: Record<UnlockedFeature, string> = {
  ipo: 'Mở khóa IPO công ty',
  self_defense: 'Tự bào chữa tại tòa',
  lower_audit_risk: 'Giảm rủi ro kiểm toán thuế',
  board_seat: 'Ghế HĐQT doanh nghiệp',
};

export function EducationPage() {
  const { toast } = useToast();
  const { data: overview, isLoading, refetch } = useQuery<CareersOverviewExtDto>({
    queryKey: ['education', 'overview'],
    queryFn: () => apiRequest<CareersOverviewExtDto>('/api/v1/education/overview'),
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<EarlyGraduateStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<EarlyGraduateResultDto | null>(null);

  const universities = overview?.universities ?? [];
  const degrees = overview?.degrees ?? [];
  const unlocked = overview?.unlockedFeatures ?? [];

  async function handleEnroll(universityId: string) {
    setBusy(universityId);
    try {
      await apiRequest('/api/v1/education/enroll', { method: 'POST', body: JSON.stringify({ universityId }) });
      toast({ title: 'Ghi danh thành công', description: 'Bạn đã ghi danh và đóng học phí.', variant: 'success' });
      void refetch();
    } catch (e: any) {
      toast({ title: 'Không thể ghi danh', description: e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally { setBusy(null); }
  }

  async function handleGraduate(degreeId: string) {
    setBusy(degreeId);
    try {
      await apiRequest('/api/v1/education/graduate', { method: 'POST', body: JSON.stringify({ degreeId }) });
      toast({ title: 'Tốt nghiệp', description: 'Chúc mừng bạn đã tốt nghiệp.', variant: 'success' });
      void refetch();
    } catch (e: any) {
      toast({ title: 'Chưa thể tốt nghiệp', description: e?.message || 'Chưa đến thời hạn hoặc có lỗi.', variant: 'error' });
    } finally { setBusy(null); }
  }

  async function startEarlyTest(degreeId: string) {
    setBusy(`start-${degreeId}`);
    setResult(null);
    try {
      const res = await apiRequest<EarlyGraduateStartResponse>('/api/v1/education/early-graduate/start', {
        method: 'POST', body: JSON.stringify({ degreeId }),
      });
      setActiveTest(res);
      setAnswers({});
      toast({ title: 'Đã tạo bài kiểm tra', description: '5 câu trắc nghiệm cơ bản do AI sinh theo ngành/lĩnh vực. Hãy hoàn thành và nộp bài.', variant: 'success' });
    } catch (e: any) {
      toast({ title: 'Không thể bắt đầu bài kiểm tra', description: e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally { setBusy(null); }
  }

  async function submitEarlyTest() {
    if (!activeTest) return;
    const unanswered = activeTest.questions.filter(q => typeof answers[q.id] !== 'number');
    if (unanswered.length > 0) {
      toast({ title: 'Chưa hoàn thành', description: `Vui lòng trả lời đủ ${activeTest.questions.length} câu trước khi nộp bài.`, variant: 'error' });
      return;
    }
    setBusy(`submit-${activeTest.testId}`);
    try {
      const res = await apiRequest<EarlyGraduateResultDto>('/api/v1/education/early-graduate/submit', {
        method: 'POST',
        body: JSON.stringify({
          degreeId: activeTest.degreeId,
          testId: activeTest.testId,
          answers: activeTest.questions.map(q => ({ questionId: q.id, selectedIndex: answers[q.id] })),
        }),
      });
      setResult(res);
      toast({ title: res.passed ? 'Đạt - Tốt nghiệp sớm' : 'Chưa đạt', description: res.message, variant: res.passed ? 'success' : 'error' });
      if (res.passed) {
        setActiveTest(null);
        setAnswers({});
      }
      void refetch();
    } catch (e: any) {
      toast({ title: 'Nộp bài thất bại', description: e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally { setBusy(null); }
  }

  const activeDegree = useMemo(() => degrees.find(d => d.id === activeTest?.degreeId), [degrees, activeTest]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Giáo dục & Bằng cấp" description="Đang tải hồ sơ học vấn..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Giáo dục & Bằng cấp"
        description="Ghi danh đại học, học tập và tốt nghiệp. Đạt 2/3 thời gian khóa học có thể làm bài kiểm tra (5 câu trắc nghiệm cơ bản do AI sinh theo ngành/lĩnh vực) để ra trường sớm."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Bằng cấp" value={degrees.length} hint="Bằng đang theo học / đã tốt nghiệp" tone="positive" />
        <StatCard label="Học phí đã đóng" value={formatMoney(overview?.tuitionPaidTotal ?? 0)} hint="Tổng học phí đã nộp (học phí/tháng × thời gian học)" />
        <StatCard label="Tính năng đã mở" value={unlocked.length} hint={unlocked.length > 0 ? unlocked.map((f) => UNLOCK_LABEL[f]).join(', ') : 'Tốt nghiệp để mở khóa'} />
      </div>

      {activeTest && (
        <Panel title={activeTest.title || 'Bài kiểm tra tốt nghiệp sớm'} borderColor="amber">
          <div className="space-y-4">
            <div className="text-sm text-slate-700">
              Bài kiểm tra <span className="font-semibold">{activeDegree?.degreeCode || activeTest.degreeId}</span>{activeDegree?.universityName ? ` - ${activeDegree.universityName}` : ''}: <span className="font-medium">{activeTest.totalQuestions} câu trắc nghiệm cơ bản</span> do AI sinh theo ngành/lĩnh vực. Cần đạt ≥ {activeTest.requiredScore}/100 để tốt nghiệp sớm.
              <div className="text-xs text-slate-500 mt-1">Hết hạn: {new Date(activeTest.expiresAt).toLocaleString('vi-VN')}</div>
            </div>
            <div className="space-y-4">
              {activeTest.questions.map((q, idx) => (
                <div key={q.id} className="rounded-xl border border-slate-200 bg-white/60 p-3">
                  <div className="font-medium text-slate-800 mb-2">Câu {idx + 1}. {q.question}</div>
                  <div className="space-y-1.5">
                    {q.options.map((opt, oi) => {
                      const checked = answers[q.id] === oi;
                      return (
                        <label key={oi} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${checked ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <input type="radio" name={`q-${q.id}`} className="mt-0.5" checked={checked} onChange={() => setAnswers(prev => ({ ...prev, [q.id]: oi }))} />
                          <span><span className="font-semibold mr-1">{String.fromCharCode(65 + oi)}.</span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {result && !result.passed && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                Kết quả: {result.message}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setActiveTest(null); setAnswers({}); }} className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">Đóng</button>
              <GameButton variant="primary" onClick={() => void submitEarlyTest()} loading={busy === `submit-${activeTest.testId}`} disabled={!!busy}>Nộp bài</GameButton>
            </div>
          </div>
        </Panel>
      )}

      {result && result.passed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {result.message}
        </div>
      )}

      <div className="grid gap-4">
        <Panel title="Bằng cấp của bạn">
          <div className="space-y-3">
            {degrees.length > 0 ? (
              degrees.map((d) => {
                const now = Date.now();
                const gradAt = d.graduatesAt ? new Date(d.graduatesAt).getTime() : 0;
                const due = d.status === 'enrolled' && gradAt > 0 && now >= gradAt;
                const canEarly = !!d.canEarlyGraduate && d.status === 'enrolled' && !due;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{d.degreeCode ?? '—'}</span>
                        {d.universityName && <span className="text-xs text-slate-600">{d.universityName}</span>}
                        <Badge variant={d.status === 'graduated' ? 'success' : 'warning'}>{d.status === 'graduated' ? 'Đã tốt nghiệp' : 'Đang theo học'}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Ghi danh {d.enrolledAt ? new Date(d.enrolledAt).toLocaleDateString('vi-VN') : '—'} · Tốt nghiệp {d.graduatesAt ? new Date(d.graduatesAt).toLocaleDateString('vi-VN') : '—'}
                      </div>
                      {d.status === 'enrolled' && (
                        <div className="mt-1 text-[11px] text-slate-600">
                          Tiến độ: <span className="font-mono font-semibold text-emerald-700">{(d.progressPct ?? 0).toFixed(1)}%</span>
                          {typeof d.earlyGraduateMinProgressPct === 'number' && <> · Điều kiện thi sớm: ≥ {d.earlyGraduateMinProgressPct}% thời gian</>}
                          {canEarly && <span className="ml-1 text-amber-700 font-semibold">· Đủ điều kiện thi tốt nghiệp sớm (5 câu trắc nghiệm AI theo ngành)</span>}
                          {due && <span className="ml-1 text-emerald-700 font-semibold">· Đã đủ thời gian tốt nghiệp</span>}
                        </div>
                      )}
                    </div>
                    {d.status === 'enrolled' && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {canEarly && (
                          <GameButton variant="outline" size="sm" disabled={!!busy} onClick={() => void startEarlyTest(d.id)}>
                            {busy === `start-${d.id}` ? 'Đang tạo đề…' : 'Làm bài thi tốt nghiệp sớm'}
                          </GameButton>
                        )}
                        <GameButton variant="primary" size="sm" disabled={!!busy} onClick={() => void handleGraduate(d.id)} title={due ? 'Tốt nghiệp đúng hạn' : 'Khả dụng khi đủ thời gian (hoặc thi tốt nghiệp sớm nếu đủ 2/3)'}>
                          {busy === d.id ? 'Đang xử lý…' : 'Tốt nghiệp'}
                        </GameButton>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">Chưa ghi danh trường nào.</div>
            )}
          </div>
        </Panel>

        <Panel title="Trường đại học / Ngành học" borderColor="emerald">
          <div className="space-y-3">
            {universities.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{u.name ?? '—'}</span>
                    <Badge variant="default">{u.degreeCode ?? ''}</Badge>
                    {u.field && <span className="text-[11px] text-slate-500">Ngành/Lĩnh vực: {u.field}</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Học phí {formatMoney(u.tuition?.amount ?? 0)}/tháng · Thời gian {u.durationMonths ?? 0} tháng · Tổng {formatMoney((u.tuition?.amount ?? 0) * (u.durationMonths ?? 0))}
                  </div>
                </div>
                <GameButton variant={u.enrolled ? 'outline' : 'primary'} size="sm" disabled={busy === u.id || u.enrolled || !!busy} onClick={() => void handleEnroll(u.id)}>
                  {u.enrolled ? 'Đã ghi danh' : busy === u.id ? 'Đang xử lý…' : 'Ghi danh'}
                </GameButton>
              </div>
            ))}
            {universities.length === 0 && <div className="text-center py-4 text-xs text-slate-500">Đang tải danh sách trường...</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
