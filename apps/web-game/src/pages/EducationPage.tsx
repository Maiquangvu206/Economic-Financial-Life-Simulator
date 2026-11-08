import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type CareersOverviewExtDto, type UnlockedFeature } from '@efls/contracts';

const UNLOCK_LABEL: Record<UnlockedFeature, string> = {
  ipo: 'Mở khóa IPO công ty',
  self_defense: 'Tự bào chữa tại tòa',
  lower_audit_risk: 'Giảm rủi ro kiểm toán thuế',
  board_seat: 'Ghế HĐQT doanh nghiệp',
};

export function EducationPage() {
  const {
    data: overview,
    isLoading,
    refetch,
  } = useQuery<CareersOverviewExtDto>({
    queryKey: ['education', 'overview'],
    queryFn: () => apiRequest<CareersOverviewExtDto>('/api/v1/education/overview'),
  });

  const [busy, setBusy] = useState<string | null>(null);

  async function handleEnroll(universityId: string) {
    setBusy(universityId);
    try {
      await apiRequest('/api/v1/education/enroll', {
        method: 'POST',
        body: JSON.stringify({ universityId }),
      });
      void refetch();
    } catch {
      // lỗi đã xử lý bởi httpClient
    } finally {
      setBusy(null);
    }
  }

  async function handleGraduate(degreeId: string) {
    setBusy(degreeId);
    try {
      await apiRequest('/api/v1/education/graduate', {
        method: 'POST',
        body: JSON.stringify({ degreeId }),
      });
      void refetch();
    } catch {
      // noop
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Giáo dục & Bằng cấp" description="Đang tải hồ sơ học vấn..." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải...</p>
      </div>
    );
  }

  const universities = overview?.universities ?? [];
  const degrees = overview?.degrees ?? [];
  const unlocked = overview?.unlockedFeatures ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Giáo dục & Bằng cấp"
        description="Ghi danh đại học, tốt nghiệp để mở khóa IPO, tự bào chữa và giảm rủi ro kiểm toán."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Bằng cấp"
          value={degrees.length}
          hint="Bằng đang theo học / đã tốt nghiệp"
          tone="positive"
        />
        <StatCard
          label="Học phí đã đóng"
          value={formatMoney(overview?.tuitionPaidTotal ?? 0)}
          hint="Tổng học phí đã nộp"
        />
        <StatCard
          label="Tính năng đã mở"
          value={unlocked.length}
          hint={
            unlocked.length > 0
              ? unlocked.map((f) => UNLOCK_LABEL[f]).join(', ')
              : 'Tốt nghiệp để mở khóa'
          }
        />
      </div>

      <div className="grid gap-4">
        <Panel title="Bằng cấp của bạn">
          <div className="space-y-3">
            {degrees.length > 0 ? (
              degrees.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{d.degreeCode ?? '—'}</span>
                      <Badge variant={d.status === 'graduated' ? 'success' : 'warning'}>
                        {d.status === 'graduated' ? 'Đã tốt nghiệp' : 'Đang theo học'}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Ghi danh{' '}
                      {d.enrolledAt ? new Date(d.enrolledAt).toLocaleDateString('vi-VN') : '—'} ·
                      Tốt nghiệp{' '}
                      {d.graduatesAt ? new Date(d.graduatesAt).toLocaleDateString('vi-VN') : '—'}
                    </div>
                  </div>
                  {d.status === 'enrolled' && (
                    <GameButton
                      variant="primary"
                      size="sm"
                      disabled={busy === d.id}
                      onClick={() => void handleGraduate(d.id)}
                    >
                      {busy === d.id ? 'Đang xử lý…' : 'Tốt nghiệp'}
                    </GameButton>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa ghi danh trường nào.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Trường đại học" borderColor="emerald">
          <div className="space-y-3">
            {universities.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{u.name ?? '—'}</span>
                    <Badge variant="default">{u.degreeCode ?? ''}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Học phí {formatMoney(u.tuition?.amount ?? 0)} · {u.durationMonths ?? 0} tháng
                  </div>
                </div>
                <GameButton
                  variant={u.enrolled ? 'outline' : 'primary'}
                  size="sm"
                  disabled={busy === u.id || u.enrolled}
                  onClick={() => void handleEnroll(u.id)}
                >
                  {u.enrolled ? 'Đã ghi danh' : busy === u.id ? 'Đang xử lý…' : 'Ghi danh'}
                </GameButton>
              </div>
            ))}
            {universities.length === 0 && (
              <div className="text-center py-4 text-xs text-slate-500">
                Đang tải danh sách trường...
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
