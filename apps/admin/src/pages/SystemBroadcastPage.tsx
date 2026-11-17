import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { adminRequest } from '../shared/api/httpClient';
import { useDialog } from '../shared/ui/DialogContext';

export type BroadcastType = 'urgent' | 'maintenance' | 'event' | 'economy' | 'news';
export type BroadcastScope = 'all' | 'workers' | 'investors' | 'businesses';

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  type: BroadcastType;
  scope: BroadcastScope;
  createdAt: string;
  sender: string;
  pinned: boolean;
  showOnLogin?: boolean;
  showInApp?: boolean;
}

const TYPE_CONFIG: Record<BroadcastType, { label: string; icon: string; badgeCls: string }> = {
  urgent: { label: 'Khẩn cấp / Báo động', icon: '🚨', badgeCls: 'bg-rose-50 text-rose-600 border-rose-200' },
  maintenance: { label: 'Bảo trì hệ thống', icon: '⚙️', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200' },
  event: { label: 'Sự kiện / Lễ hội', icon: '🎉', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  economy: { label: 'Chính sách Kinh tế / Thuế', icon: '📈', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200' },
  news: { label: 'Bản tin Thành phố', icon: '📰', badgeCls: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const SCOPE_CONFIG: Record<BroadcastScope, string> = {
  all: 'Toàn bộ công dân & Người chơi',
  workers: 'Lực lượng công nhân & Người lao động',
  investors: 'Nhà đầu tư & Sàn chứng khoán',
  businesses: 'Chủ doanh nghiệp & Hộ kinh doanh',
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

export function SystemBroadcastPage() {
  const { confirm } = useDialog();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<BroadcastType>('news');
  const [scope, setScope] = useState<BroadcastScope>('all');
  const [isPinned, setIsPinned] = useState(false);
  const [showOnLogin, setShowOnLogin] = useState(false);
  const [showInApp, setShowInApp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const { data: broadcasts = [], isLoading, error, refetch } = useQuery<AnnouncementItem[]>({
    queryKey: ['admin', 'broadcasts'],
    queryFn: () => adminRequest<AnnouncementItem[]>('/api/v1/admin/broadcasts'),
  });

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (!showOnLogin && !showInApp) {
      setErrMsg('Vui lòng chọn ít nhất một vị trí hiển thị (trang đăng nhập hoặc trang người dùng).');
      return;
    }
    setBusy(true);
    setErrMsg(null);
    try {
      await adminRequest('/api/v1/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          type,
          scope,
          pinned: isPinned,
          showOnLogin,
          showInApp,
        }),
      });
      setTitle('');
      setContent('');
      setIsPinned(false);
      setShowOnLogin(false);
      setShowInApp(true);
      setType('news');
      setScope('all');
      setSuccessMsg('Đã phát sóng thông báo. Hệ thống sẽ hiển thị theo vị trí đã chọn (trang đăng nhập/trang người dùng).');
      await refetch();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrMsg(err?.problem?.detail || err?.message || 'Không thể phát sóng thông báo.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({
      title: 'Xóa thông báo này?',
      type: 'danger',
      confirmText: 'Xóa',
      message: 'Thông báo sẽ bị gỡ khỏi hệ thống và không còn hiển thị với người chơi.',
    }))) return;
    try {
      await adminRequest(`/api/v1/admin/broadcasts/${id}`, { method: 'DELETE' });
      await refetch();
    } catch (err: any) {
      setErrMsg(err?.problem?.detail || err?.message || 'Không thể xóa thông báo.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm Thông báo Hệ thống (System Broadcast)"
        description="Phát sóng thông báo tới người chơi. Thông báo được lưu trên hệ thống, hiển thị cho người dùng (HUD ghim/banner & hộp thông báo) và ghi nhận để kiểm toán."
      />

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs font-semibold text-emerald-700">✓ {successMsg}</div>
      )}
      {(errMsg || error) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs font-semibold text-rose-700">
          ⚠ {errMsg || (error as any)?.message || 'Lỗi tải dữ liệu'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600">Soạn thông báo phát sóng mới</h2>
          <form onSubmit={handleSendBroadcast} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Loại thông báo:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(TYPE_CONFIG) as BroadcastType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-xl border p-2 text-left font-medium transition ${type === t ? 'border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500' : 'border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                  >
                    <span>{TYPE_CONFIG[t].icon} </span><span>{TYPE_CONFIG[t].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Đối tượng nhận thông báo:</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as BroadcastScope)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
              >
                {(Object.keys(SCOPE_CONFIG) as BroadcastScope[]).map((s) => (
                  <option key={s} value={s}>{SCOPE_CONFIG[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Tiêu đề thông báo:</label>
              <input
                type="text"
                placeholder="Nhập tiêu đề thông báo ngắn gọn, rõ ràng..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Nội dung chi tiết:</label>
              <textarea
                rows={4}
                placeholder="Nội dung truyền đạt tới công dân/người chơi..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none leading-relaxed"
                required
              />
            </div>

            <div className="space-y-2 pt-1 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-slate-700 font-medium">Vị trí hiển thị (chọn một hoặc cả hai):</div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnLogin}
                  onChange={(e) => setShowOnLogin(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 bg-white text-amber-500 focus:ring-0"
                />
                <span>
                  <b>Trang đăng nhập / Trang chủ</b>
                  <span className="block text-[11px] text-slate-500">Hiển thị công khai trước khi người dùng đăng nhập (thông báo hệ thống).</span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInApp}
                  onChange={(e) => setShowInApp(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 bg-white text-amber-500 focus:ring-0"
                />
                <span>
                  <b>Trang người dùng (trong ứng dụng)</b>
                  <span className="block text-[11px] text-slate-500">Hiển thị trong HUD/hộp thông báo sau khi đăng nhập (và tạo thông báo cho người dùng nếu bật).</span>
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="pinCheckbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="rounded border-slate-300 bg-slate-50 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="pinCheckbox" className="text-slate-700 text-xs cursor-pointer">
                Ghim thông báo (ưu tiên hiển thị nổi bật)
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-900 transition hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              {busy ? 'Đang phát sóng...' : '📢 Phát sóng ngay (Broadcast)'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600">
              Lịch sử bản tin đã phát sóng ({broadcasts.length})
            </h2>
            <button type="button" onClick={() => refetch()} className="text-[11px] text-slate-600 hover:text-slate-900">Tải lại</button>
          </div>

          {isLoading ? (
            <div className="text-sm text-slate-600">Đang tải...</div>
          ) : broadcasts.length === 0 ? (
            <div className="text-sm text-slate-500">Chưa có thông báo nào.</div>
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {broadcasts.map((ann) => {
                const cfg = TYPE_CONFIG[ann.type];
                return (
                  <div key={ann.id} className="rounded-2xl border border-slate-200/90 bg-slate-100/70 p-4 space-y-2 hover:border-slate-300 transition">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${cfg.badgeCls}`}>
                          <span>{cfg.icon}</span><span>{cfg.label}</span>
                        </span>
                        {ann.pinned && (
                          <span className="rounded-lg bg-amber-100 text-amber-700 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold">📌 ĐÃ GHIM</span>
                        )}
                        {ann.showOnLogin && (
                          <span className="rounded-lg bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 text-[10px] font-semibold">Trang đăng nhập</span>
                        )}
                        {ann.showInApp !== false && (
                          <span className="rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold">Trang người dùng</span>
                        )}
                        <span className="text-[11px] text-slate-600 font-mono">Gửi đến: <b>{SCOPE_CONFIG[ann.scope]}</b></span>
                      </div>
                      <button type="button" onClick={() => handleDelete(ann.id)} className="text-xs text-rose-600 px-2 py-0.5 rounded hover:bg-rose-50 transition">Xóa</button>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">{ann.title}</h3>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                    <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200/60">
                      <span>Người phát: <b className="text-slate-600">{ann.sender}</b></span>
                      <span>Thời gian: {fmtDate(ann.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
