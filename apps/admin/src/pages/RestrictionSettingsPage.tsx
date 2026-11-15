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

type GameConfigAdmin = {
  season: string;
  currentDay: number;
  currentYear: number;
  otRatePercent?: number;
  restrictionContact?: Partial<RestrictionContactConfig>;
  macro?: Record<string, unknown>;
};

const defaults: RestrictionContactConfig = {
  enabled: true,
  title: 'Tài khoản đang bị hạn chế',
  message: 'Tài khoản của bạn đang bị hạn chế thao tác. Vui lòng liên hệ quản trị viên để được hỗ trợ gỡ hạn chế.',
  email: '',
  phone: '',
  zalo: '',
  discord: '',
  other: '',
};

export function RestrictionSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<GameConfigAdmin>({
    queryKey: ['admin', 'game-config'],
    queryFn: () => adminRequest<GameConfigAdmin>('/api/v1/admin/game-config'),
  });

  const [form, setForm] = useState<RestrictionContactConfig>(defaults);

  useEffect(() => {
    if (data?.restrictionContact) {
      setForm({ ...defaults, ...data.restrictionContact });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (restrictionContact: RestrictionContactConfig) =>
      adminRequest('/api/v1/admin/game-config', {
        method: 'PUT',
        body: JSON.stringify({ restrictionContact }),
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
          <h1 className="text-xl font-semibold text-slate-900">Hạn chế tài khoản & Thông tin liên hệ hỗ trợ</h1>
          <p className="text-sm text-slate-600 mt-1">
            Cấu hình thông báo và kênh liên hệ hiển thị cho người dùng khi tài khoản bị <b>hạn chế</b> (toàn bộ chức năng game bị khóa cho đến khi admin gỡ).
          </p>
        </div>
        <button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {save.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>

      {save.isError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Lưu thất bại. Vui lòng thử lại.</div> : null}
      {save.isSuccess ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Đã lưu cấu hình liên hệ hạn chế tài khoản.</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Nội dung thông báo</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, enabled: e.target.checked }))} />
          Bật hiển thị thông tin liên hệ khi tài khoản bị hạn chế
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Tiêu đề
            <input
              value={form.title}
              onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              maxLength={200}
            />
          </label>
          <div />
          <label className="block text-sm text-slate-700 md:col-span-2">
            Thông điệp (hiển thị cho người dùng)
            <textarea
              value={form.message}
              onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, message: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-h-[90px]"
              maxLength={2000}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Kênh liên hệ để gỡ hạn chế</h2>
        <p className="text-xs text-slate-600">Điền các kênh bạn muốn người dùng liên hệ. Bỏ trống nếu không dùng kênh đó.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Email hỗ trợ
            <input value={form.email} onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, email: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="support@example.com" />
          </label>
          <label className="block text-sm text-slate-700">
            Số điện thoại / Hotline
            <input value={form.phone} onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, phone: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="0123 456 789" />
          </label>
          <label className="block text-sm text-slate-700">
            Zalo / Nhắn tin
            <input value={form.zalo} onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, zalo: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="Link hoặc số Zalo" />
          </label>
          <label className="block text-sm text-slate-700">
            Discord / Cộng đồng
            <input value={form.discord} onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, discord: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="Link Discord / tên kênh" />
          </label>
          <label className="block text-sm text-slate-700 md:col-span-2">
            Kênh/ghi chú khác
            <input value={form.other} onChange={(e) => setForm((f: RestrictionContactConfig) => ({ ...f, other: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" placeholder="Fanpage, website, hướng dẫn thêm..." />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold mb-1">Cách hoạt động</div>
        <ul className="list-disc pl-5 space-y-1 text-xs">
          <li>Khi admin thao tác <b>Hạn chế</b> tài khoản (khác với Khóa), người dùng vẫn đăng nhập được nhưng <b>toàn bộ chức năng game bị chặn</b> và thấy thông báo kèm thông tin liên hệ ở trên.</li>
          <li>Thao tác <b>Khóa</b> sẽ ngăn đăng nhập; thao tác <b>Gỡ</b> sẽ gỡ cả khóa lẫn hạn chế.</li>
          <li>Thông tin liên hệ được lưu trong cấu hình hệ thống (game-config) và hiển thị cho người dùng bị hạn chế.</li>
        </ul>
      </section>
    </div>
  );
}
