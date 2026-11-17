import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type RestrictionContactConfig = {
  enabled: boolean;
  title: string;
  message: string;
  email: string;
  phone: string;
  zalo: string;
  discord: string;
  other: string;
  updatedAt?: string;
};

type MaintenanceConfig = {
  enabled: boolean;
  title: string;
  message: string;
  updatedAt?: string;
};

type GameConfigAdmin = {
  season: string;
  currentDay: number;
  currentYear: number;
  otRatePercent?: number;
  restrictionContact?: Partial<RestrictionContactConfig>;
  maintenance?: Partial<MaintenanceConfig>;
  macro?: Record<string, unknown>;
};

const restrictionDefaults: RestrictionContactConfig = {
  enabled: true,
  title: 'Tài khoản đang bị hạn chế',
  message: 'Tài khoản của bạn đang bị hạn chế thao tác. Vui lòng liên hệ quản trị viên để được hỗ trợ gỡ hạn chế.',
  email: '',
  phone: '',
  zalo: '',
  discord: '',
  other: '',
};

const maintenanceDefaults: MaintenanceConfig = {
  enabled: false,
  title: 'Hệ thống đang bảo trì',
  message: 'Hệ thống đang tạm dừng để nâng cấp hoặc sửa chữa. Vui lòng quay lại sau.',
};

export function RestrictionSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<GameConfigAdmin>({
    queryKey: ['admin', 'game-config'],
    queryFn: () => adminRequest<GameConfigAdmin>('/api/v1/admin/game-config'),
  });

  const [restrictionForm, setRestrictionForm] = useState<RestrictionContactConfig>(restrictionDefaults);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceConfig>(maintenanceDefaults);

  useEffect(() => {
    if (data?.restrictionContact) {
      setRestrictionForm({ ...restrictionDefaults, ...data.restrictionContact });
    }
    if (data?.maintenance) {
      setMaintenanceForm({ ...maintenanceDefaults, ...data.maintenance });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: { restrictionContact?: RestrictionContactConfig; maintenance?: MaintenanceConfig }) =>
      adminRequest('/api/v1/admin/game-config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'game-config'] });
      void qc.invalidateQueries({ queryKey: ['game-config'] });
    },
  });

  if (isLoading) return <div className="p-4 text-sm text-slate-600">Đang tải cấu hình...</div>;
  if (error) return <div className="p-4 text-sm text-rose-600">Không tải được cấu hình hệ thống.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Bảo trì hệ thống & Hạn chế tài khoản</h1>
        </div>
        <button
          type="button"
          onClick={() => save.mutate({ maintenance: maintenanceForm, restrictionContact: restrictionForm })}
          disabled={save.isPending}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {save.isPending ? 'Đang lưu...' : 'Lưu tất cả cấu hình'}
        </button>
      </div>

      {save.isError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Lưu thất bại. Vui lòng thử lại.</div> : null}
      {save.isSuccess ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Đã lưu cấu hình bảo trì/hạn chế.</div> : null}

      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tạm dừng hệ thống</h2>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${maintenanceForm.enabled ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-700'}`}>
            {maintenanceForm.enabled ? 'Đang tạm dừng' : 'Đang hoạt động'}
          </span>
        </div>
        
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Tiêu đề thông báo bảo trì
            <input
              value={maintenanceForm.title}
              onChange={(e) => setMaintenanceForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              maxLength={200}
            />
          </label>
          <div />
          <label className="block text-sm text-slate-700 md:col-span-2">
            Nội dung thông báo (hiển thị cho người chơi)
            <textarea
              value={maintenanceForm.message}
              onChange={(e) => setMaintenanceForm((f) => ({ ...f, message: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 min-h-[90px]"
              maxLength={2000}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save.mutate({ maintenance: { ...maintenanceForm, enabled: true }, restrictionContact: restrictionForm })}
            disabled={save.isPending}
            className="rounded-xl border border-amber-300 bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
          >
            Bật bảo trì ngay
          </button>
          <button
            type="button"
            onClick={() => save.mutate({ maintenance: { ...maintenanceForm, enabled: false }, restrictionContact: restrictionForm })}
            disabled={save.isPending}
            className="rounded-xl border border-emerald-300 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            Tắt bảo trì (mở lại hệ thống)
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Thông tin liên hệ khi tài khoản bị hạn chế</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!restrictionForm.enabled} onChange={(e) => setRestrictionForm((f) => ({ ...f, enabled: e.target.checked }))} />
          Bật hiển thị thông tin liên hệ khi tài khoản bị hạn chế
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Tiêu đề
            <input
              value={restrictionForm.title}
              onChange={(e) => setRestrictionForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              maxLength={200}
            />
          </label>
          <div />
          <label className="block text-sm text-slate-700 md:col-span-2">
            Thông điệp (hiển thị cho người dùng)
            <textarea
              value={restrictionForm.message}
              onChange={(e) => setRestrictionForm((f) => ({ ...f, message: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-h-[90px]"
              maxLength={2000}
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Email hỗ trợ
            <input value={restrictionForm.email} onChange={(e) => setRestrictionForm((f) => ({ ...f, email: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="support@example.com" />
          </label>
          <label className="block text-sm text-slate-700">
            Số điện thoại / Hotline
            <input value={restrictionForm.phone} onChange={(e) => setRestrictionForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="0123 456 789" />
          </label>
          <label className="block text-sm text-slate-700">
            Zalo / Nhắn tin
            <input value={restrictionForm.zalo} onChange={(e) => setRestrictionForm((f) => ({ ...f, zalo: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="Link hoặc số Zalo" />
          </label>
          <label className="block text-sm text-slate-700">
            Discord / Cộng đồng
            <input value={restrictionForm.discord} onChange={(e) => setRestrictionForm((f) => ({ ...f, discord: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="Link Discord / tên kênh" />
          </label>
          <label className="block text-sm text-slate-700 md:col-span-2">
            Kênh/ghi chú khác
            <input value={restrictionForm.other} onChange={(e) => setRestrictionForm((f) => ({ ...f, other: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="Fanpage, website, hướng dẫn thêm..." />
          </label>
        </div>
      </section>

</div>
  );
}
