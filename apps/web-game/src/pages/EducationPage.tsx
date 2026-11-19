import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { GameInput } from '../shared/ui/GameInput';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { useToast } from '../shared/ui/Toast';
import { useDialog } from '../shared/ui/DialogContext';
import type {
  CareersOverviewExtDto,
  UnlockedFeature,
  EarlyGraduateResultDto,
  EarlyGraduateStartResponse,
} from '@efls/contracts';

const UNLOCK_LABEL: Record<UnlockedFeature, string> = {
  ipo: 'Mở khóa IPO công ty',
  self_defense: 'Tự bào chữa tại tòa',
  lower_audit_risk: 'Giảm rủi ro kiểm toán thuế',
  board_seat: 'Ghế HĐQT doanh nghiệp',
};

const DEGREE_CODE_LABEL: Record<string, string> = {
  law: 'Luật',
  computer_science: 'Khoa học máy tính',
  business: 'Kinh tế / Kinh doanh',
  education: 'Giáo dục',
};

function degreeCodeLabel(code?: string | null) {
  if (!code) return '—';
  const key = code.trim().toLowerCase();
  return DEGREE_CODE_LABEL[key] ?? code;
}

type EducationTab = 'study' | 'programs';

export function EducationPage() {
  const { toast } = useToast();
  const { confirm } = useDialog();
  const { data: overview, isLoading, refetch } = useQuery<CareersOverviewExtDto>({
    queryKey: ['education', 'overview'],
    queryFn: () => apiRequest<CareersOverviewExtDto>('/api/v1/education/overview'),
  });

  const [activeTab, setActiveTab] = useState<EducationTab>('study');
  const [universitySearch, setUniversitySearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<EarlyGraduateStartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<EarlyGraduateResultDto | null>(null);

  const universities = overview?.universities ?? [];
  const degrees = overview?.degrees ?? [];
  const unlocked = overview?.unlockedFeatures ?? [];

  const completedDegreeCodes = useMemo(
    () =>
      new Set(
        degrees
          .filter((degree) => degree.status === 'graduated' && degree.degreeCode)
          .map((degree) => degree.degreeCode!.trim().toLowerCase()),
      ),
    [degrees],
  );

  const availableUniversities = useMemo(
    () =>
      universities.filter(
        (university) => !completedDegreeCodes.has((university.degreeCode ?? '').trim().toLowerCase()),
      ),
    [universities, completedDegreeCodes],
  );

  const filteredUniversities = useMemo(() => {
    const q = universitySearch.trim().toLowerCase();
    if (!q) return availableUniversities;
    return availableUniversities.filter((u) => {
      const name = String(u.name ?? '').toLowerCase();
      const code = String(u.degreeCode ?? '').toLowerCase();
      const label = degreeCodeLabel(u.degreeCode).toLowerCase();
      const field = String(u.field ?? '').toLowerCase();
      return name.includes(q) || code.includes(q) || label.includes(q) || field.includes(q);
    });
  }, [availableUniversities, universitySearch]);

  const visibleDegrees = useMemo(() => degrees.filter((d) => d.status !== 'dropped'), [degrees]);

  async function handleEnroll(universityId: string) {
    setBusy(universityId);
    try {
      await apiRequest('/api/v1/education/enroll', { method: 'POST', body: JSON.stringify({ universityId }) });
      toast({ title: 'Ghi danh thành công', description: 'Bạn đã ghi danh và đóng học phí.', variant: 'success' });
      setActiveTab('study');
      void refetch();
    } catch (e: any) {
      toast({
        title: 'Không thể ghi danh',
        description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleGraduate(degreeId: string) {
    setBusy(degreeId);
    try {
      await apiRequest('/api/v1/education/graduate', { method: 'POST', body: JSON.stringify({ degreeId }) });
      toast({ title: 'Tốt nghiệp', description: 'Chúc mừng bạn đã tốt nghiệp.', variant: 'success' });
      void refetch();
    } catch (e: any) {
      toast({
        title: 'Chưa thể tốt nghiệp',
        description: e?.problem?.detail || e?.message || 'Chưa đến thời hạn hoặc có lỗi.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDrop(degreeId: string, degreeCode: string) {
    const ok = await confirm({
      title: `Bỏ học giữa chừng chương trình ${degreeCode}?`,
      type: 'danger',
      confirmText: 'Bỏ học',
      cancelText: 'Tiếp tục học',
      message: [
        'Toàn bộ học phí đã đóng sẽ KHÔNG được hoàn lại.',
        'Bạn sẽ KHÔNG nhận được bằng cấp hay bất kỳ chức năng/lợi ích nào của bằng này.',
        'Dữ liệu bằng cấp đang học sẽ bị xóa và không còn hiển thị trong mục Bằng cấp.',
        'Bạn vẫn có thể ghi danh và học lại bằng này sau.',
      ],
    });
    if (!ok) return;
    setBusy(`drop-${degreeId}`);
    try {
      await apiRequest('/api/v1/education/drop', { method: 'POST', body: JSON.stringify({ degreeId }) });
      toast({
        title: 'Đã bỏ học',
        description: 'Đã xóa dữ liệu bằng cấp đang học. Học phí không được hoàn và bạn không nhận chức năng của bằng.',
        variant: 'success',
      });
      setActiveTest((t) => (t?.degreeId === degreeId ? null : t));
      setResult(null);
      void refetch();
    } catch (e: any) {
      toast({
        title: 'Không thể bỏ học',
        description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function startEarlyTest(degreeId: string) {
    setBusy(`start-${degreeId}`);
    setResult(null);
    try {
      const res = await apiRequest<EarlyGraduateStartResponse>('/api/v1/education/early-graduate/start', {
        method: 'POST',
        body: JSON.stringify({ degreeId }),
      });
      setActiveTest(res);
      setAnswers({});
      setActiveTab('study');
      toast({
        title: 'Đã tạo bài kiểm tra',
        description: '5 câu trắc nghiệm cơ bản do AI sinh theo ngành/lĩnh vực. Hãy hoàn thành và nộp bài.',
        variant: 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Không thể bắt đầu bài kiểm tra',
        description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function submitEarlyTest() {
    if (!activeTest) return;
    const unanswered = activeTest.questions.filter((q) => typeof answers[q.id] !== 'number');
    if (unanswered.length > 0) {
      toast({
        title: 'Chưa hoàn thành',
        description: `Vui lòng trả lời đủ ${activeTest.questions.length} câu trước khi nộp bài.`,
        variant: 'error',
      });
      return;
    }
    setBusy(`submit-${activeTest.testId}`);
    try {
      const res = await apiRequest<EarlyGraduateResultDto>('/api/v1/education/early-graduate/submit', {
        method: 'POST',
        body: JSON.stringify({
          degreeId: activeTest.degreeId,
          testId: activeTest.testId,
          answers: activeTest.questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] })),
        }),
      });
      setResult(res);
      toast({
        title: res.passed ? 'Đạt - Tốt nghiệp sớm' : 'Chưa đạt',
        description: res.message,
        variant: res.passed ? 'success' : 'error',
      });
      if (res.passed) {
        setActiveTest(null);
        setAnswers({});
      }
      void refetch();
    } catch (e: any) {
      toast({
        title: 'Nộp bài thất bại',
        description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  const activeDegree = useMemo(() => degrees.find((d) => d.id === activeTest?.degreeId), [degrees, activeTest]);

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
      <PageHeader title="Giáo dục & Bằng cấp" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Bằng cấp" value={degrees.length} tone="positive" />
        <StatCard label="Học phí đã đóng" value={formatMoney(overview?.tuitionPaidTotal ?? 0)} />
        <StatCard label="Tính năng đã mở" value={unlocked.length} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {[
          { key: 'study' as const, label: 'Học tập & bằng cấp của tôi' },
          { key: 'programs' as const, label: 'Chương trình đào tạo' },
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
            {tab.key === 'study' && activeTest ? (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                Thi
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'study' && (
        <div className="space-y-4">
          {activeTest && (
            <Panel title={activeTest.title || 'Bài kiểm tra tốt nghiệp sớm'} borderColor="amber">
              <div className="space-y-4">
                <div className="text-sm text-slate-700">
                  Bài kiểm tra{' '}
                  <span className="font-semibold">{activeDegree?.degreeCode || activeTest.degreeId}</span>
                  {activeDegree?.universityName ? ` - ${activeDegree.universityName}` : ''}:{' '}
                  <span className="font-medium">{activeTest.totalQuestions} câu trắc nghiệm cơ bản</span> do AI sinh theo
                  ngành/lĩnh vực. Cần đạt ≥ {activeTest.requiredScore}/100 để tốt nghiệp sớm.
                  <div className="text-xs text-slate-500 mt-1">
                    Hết hạn: {new Date(activeTest.expiresAt).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div className="space-y-4">
                  {activeTest.questions.map((q, idx) => (
                    <div key={q.id} className="rounded-xl border border-slate-200 bg-white/60 p-3">
                      <div className="font-medium text-slate-800 mb-2">
                        Câu {idx + 1}. {q.question}
                      </div>
                      <div className="space-y-1.5">
                        {q.options.map((opt, oi) => {
                          const checked = answers[q.id] === oi;
                          return (
                            <label
                              key={oi}
                              className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${
                                checked ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                className="mt-0.5"
                                checked={checked}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                              />
                              <span>
                                <span className="font-semibold mr-1">{String.fromCharCode(65 + oi)}.</span>
                                {opt}
                              </span>
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
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTest(null);
                      setAnswers({});
                    }}
                    className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100"
                  >
                    Đóng
                  </button>
                  <GameButton
                    variant="primary"
                    onClick={() => void submitEarlyTest()}
                    loading={busy === `submit-${activeTest.testId}`}
                    disabled={!!busy}
                  >
                    Nộp bài
                  </GameButton>
                </div>
              </div>
            </Panel>
          )}

          {result && result.passed && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {result.message}
            </div>
          )}

          <Panel title="Bằng cấp & tiến độ học tập">
            <div className="space-y-3">
              {visibleDegrees.length > 0 ? (
                visibleDegrees.map((d) => {
                  const now = Date.now();
                  const gradAt = d.graduatesAt ? new Date(d.graduatesAt).getTime() : 0;
                  const due = d.status === 'enrolled' && gradAt > 0 && now >= gradAt;
                  const canEarly = !!d.canEarlyGraduate && d.status === 'enrolled' && !due;
                  return (
                    <div
                      key={d.id}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{degreeCodeLabel(d.degreeCode)}</span>
                          {d.universityName && <span className="text-xs text-slate-600">{d.universityName}</span>}
                          <Badge
                            variant={d.status === 'graduated' ? 'success' : d.status === 'enrolled' ? 'warning' : 'default'}
                          >
                            {d.status === 'graduated' ? 'Đã tốt nghiệp' : d.status === 'enrolled' ? 'Đang theo học' : 'Đã bỏ học'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Ghi danh {d.enrolledAt ? new Date(d.enrolledAt).toLocaleDateString('vi-VN') : '—'} · Tốt nghiệp{' '}
                          {d.graduatesAt ? new Date(d.graduatesAt).toLocaleDateString('vi-VN') : '—'}
                        </div>
                        {d.status === 'enrolled' && (
                          <div className="mt-1 text-[11px] text-slate-600">
                            Tiến độ:{' '}
                            <span className="font-mono font-semibold text-emerald-700">
                              {(d.progressPct ?? 0).toFixed(1)}%
                            </span>
                            {typeof d.earlyGraduateMinProgressPct === 'number' && (
                              <> · Điều kiện thi sớm: ≥ {d.earlyGraduateMinProgressPct}% thời gian</>
                            )}
                            {canEarly && (
                              <span className="ml-1 text-amber-700 font-semibold">
                                · Đủ điều kiện thi tốt nghiệp sớm (5 câu trắc nghiệm AI theo ngành)
                              </span>
                            )}
                            {due && <span className="ml-1 text-emerald-700 font-semibold">· Đã đủ thời gian tốt nghiệp</span>}
                          </div>
                        )}
                      </div>
                      {d.status === 'enrolled' && (
                        <div className="flex gap-2 flex-wrap justify-end">
                          {canEarly && (
                            <GameButton
                              variant="outline"
                              size="sm"
                              disabled={!!busy}
                              onClick={() => void startEarlyTest(d.id)}
                            >
                              {busy === `start-${d.id}` ? 'Đang tạo đề…' : 'Làm bài thi tốt nghiệp sớm'}
                            </GameButton>
                          )}
                          <GameButton
                            variant="ghost"
                            size="sm"
                            disabled={!!busy}
                            onClick={() => void handleDrop(d.id, d.degreeCode ?? 'bằng này')}
                            title="Bỏ học giữa chừng: không hoàn học phí, không nhận chức năng/bằng cấp, nhưng có thể học lại."
                          >
                            {busy === `drop-${d.id}` ? 'Đang xử lý…' : 'Bỏ học giữa chừng'}
                          </GameButton>
                          <GameButton
                            variant="primary"
                            size="sm"
                            disabled={!!busy}
                            onClick={() => void handleGraduate(d.id)}
                            title={due ? 'Tốt nghiệp đúng hạn' : 'Khả dụng khi đủ thời gian (hoặc thi tốt nghiệp sớm nếu đủ điều kiện)'}
                          >
                            {busy === d.id ? 'Đang xử lý…' : 'Tốt nghiệp'}
                          </GameButton>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-slate-500">
                  Bạn chưa có bằng cấp hoặc chương trình đang theo học. Chuyển sang tab “Chương trình đào tạo” để ghi danh.
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'programs' && (
        <div className="space-y-4">
          <Panel title="Chương trình đào tạo" borderColor="emerald">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <GameInput
                  label="Tìm kiếm trường/chương trình"
                  value={universitySearch}
                  onChange={(e) => setUniversitySearch(e.target.value)}
                  placeholder="Nhập tên trường, mã bằng/chứng chỉ, lĩnh vực..."
                />
                {universitySearch.trim() ? (
                  <GameButton variant="outline" size="sm" onClick={() => setUniversitySearch('')}>
                    Xóa tìm kiếm
                  </GameButton>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge variant="default">Có thể ghi danh: {availableUniversities.length}</Badge>
                {universitySearch.trim() ? <Badge variant="success">Kết quả: {filteredUniversities.length}</Badge> : null}
                <span>Chỉ hiển thị chương trình bạn chưa tốt nghiệp.</span>
              </div>

              {universities.length === 0 ? (
                <div className="text-center py-4 text-sm text-slate-500">Hiện chưa có chương trình đào tạo nào.</div>
              ) : availableUniversities.length === 0 ? (
                <div className="text-center py-4 text-sm text-slate-500">
                  Bạn đã hoàn thành các chương trình đang được đào tạo.
                </div>
              ) : filteredUniversities.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm text-slate-600">
                  Không tìm thấy chương trình phù hợp với từ khóa “{universitySearch.trim()}”. Thử tìm theo tên trường hoặc mã bằng/chứng chỉ.
                </div>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
                  {filteredUniversities.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{u.name ?? '—'}</span>
                          <Badge variant="default">{degreeCodeLabel(u.degreeCode)}</Badge>
                          {u.degreeCode ? (
                            <span className="text-[11px] font-mono text-slate-500">Mã: {u.degreeCode}</span>
                          ) : null}
                          {u.field && <span className="text-[11px] text-slate-500">Ngành/Lĩnh vực: {u.field}</span>}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Học phí {formatMoney(u.tuition?.amount ?? 0)}/tháng · Thời gian {u.durationMonths ?? 0} tháng · Tổng{' '}
                          {formatMoney((u.tuition?.amount ?? 0) * (u.durationMonths ?? 0))}
                        </div>
                      </div>
                      <GameButton
                        variant={u.enrolled ? 'outline' : 'primary'}
                        size="sm"
                        className="sm:min-w-[140px]"
                        disabled={busy === u.id || u.enrolled || !!busy}
                        onClick={() => void handleEnroll(u.id)}
                      >
                        {u.enrolled ? 'Đã ghi danh' : busy === u.id ? 'Đang xử lý…' : 'Ghi danh'}
                      </GameButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {unlocked.length > 0 ? (
            <Panel title="Tính năng đã mở khóa từ bằng cấp" borderColor="default">
              <div className="flex flex-wrap gap-2">
                {unlocked.map((f) => (
                  <Badge key={f} variant="success">
                    {UNLOCK_LABEL[f] ?? f}
                  </Badge>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}
