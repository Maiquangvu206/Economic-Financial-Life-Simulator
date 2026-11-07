import { useState } from 'react';
import { PageHeader } from '@efls/ui';

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
}

const TYPE_CONFIG: Record<BroadcastType, { label: string; icon: string; badgeCls: string }> = {
  urgent: { label: 'Khẩn cấp / Báo động', icon: '🚨', badgeCls: 'bg-rose-950/60 text-rose-300 border-rose-800' },
  maintenance: { label: 'Bảo trì hệ thống', icon: '⚙️', badgeCls: 'bg-amber-950/60 text-amber-300 border-amber-800' },
  event: { label: 'Sự kiện / Lễ hội', icon: '🎉', badgeCls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800' },
  economy: { label: 'Chính sách Kinh tế / Thuế', icon: '📈', badgeCls: 'bg-blue-950/60 text-blue-300 border-blue-800' },
  news: { label: 'Bản tin Thành phố', icon: '📰', badgeCls: 'bg-purple-950/60 text-purple-300 border-purple-800' },
};

const SCOPE_CONFIG: Record<BroadcastScope, string> = {
  all: 'Toàn bộ công dân & Người chơi',
  workers: 'Lực lượng công nhân & Người lao động',
  investors: 'Nhà đầu tư & Sàn chứng khoán',
  businesses: 'Chủ doanh nghiệp & Hộ kinh doanh',
};

export function SystemBroadcastPage() {
  const [broadcastList, setBroadcastList] = useState<AnnouncementItem[]>([
    {
      id: 'ann_1',
      title: 'Thông báo: Toàn quốc nghỉ Tết Nguyên Đán và chi trả thưởng Phúc lợi',
      content:
        'Hệ thống thông báo toàn thể công dân được nghỉ lễ có hưởng lương. Các doanh nghiệp vận hành sản xuất trong dịp Tết bắt buộc áp dụng hệ số lương làm thêm giờ (OT) tối thiểu 300%. Toàn bộ tài khoản công dân đã được giải ngân tiền lì xì may mắn.',
      type: 'event',
      scope: 'all',
      createdAt: '15/01/2026 08:00',
      sender: 'Ủy ban Quản trị Hệ thống',
      pinned: true,
    },
    {
      id: 'ann_2',
      title: 'Cảnh báo: Tăng cường rà soát thuế thu nhập và truy quét tín dụng đen',
      content:
        'Cơ quan thuế và Lực lượng Thanh tra liên ngành bắt đầu đợt tổng rà soát hóa đơn chứng từ và các khoản thu nhập bất minh. Mức điểm Heat Level của các đối tượng trốn thuế sẽ bị tăng mạnh.',
      type: 'economy',
      scope: 'businesses',
      createdAt: '12/01/2026 14:30',
      sender: 'Thanh tra Tài chính & Thuế',
      pinned: false,
    },
  ]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<BroadcastType>('urgent');
  const [scope, setScope] = useState<BroadcastScope>('all');
  const [isPinned, setIsPinned] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const newAnnouncement: AnnouncementItem = {
      id: `ann_${Date.now()}`,
      title: title.trim(),
      content: content.trim(),
      type,
      scope,
      createdAt: 'Vừa xong (Thời gian thực)',
      sender: 'Ban Quản trị Admin',
      pinned: isPinned,
    };

    setBroadcastList([newAnnouncement, ...broadcastList]);
    setTitle('');
    setContent('');
    setIsPinned(false);
    setSuccessMsg('Đã phát sóng thông báo hệ thống tức thì tới toàn bộ máy chủ!');
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleDelete = (id: string) => {
    setBroadcastList((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm Thông báo Hệ thống (System Broadcast)"
        description="Phát sóng thông báo khẩn cấp, bảo trì, sự kiện lễ hội và điều phối chính sách tới toàn bộ người chơi hoặc nhóm đối tượng cụ thể."
      />

      {successMsg && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/70 p-3.5 text-xs font-semibold text-emerald-300">
          ✓ {successMsg}
        </div>
      )}

      {/* Grid: Form tạo thông báo & Danh sách thông báo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form soạn và phát sóng thông báo */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-surface-900/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Soạn thông báo phát sóng mới
          </h2>

          <form onSubmit={handleSendBroadcast} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Loại thông báo:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(TYPE_CONFIG) as BroadcastType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-xl border p-2 text-left font-medium transition ${
                      type === t
                        ? 'border-amber-500 bg-amber-950/50 text-amber-300 ring-1 ring-amber-500'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{TYPE_CONFIG[t].icon} </span>
                    <span>{TYPE_CONFIG[t].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Đối tượng nhận thông báo:</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as BroadcastScope)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                {(Object.keys(SCOPE_CONFIG) as BroadcastScope[]).map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_CONFIG[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Tiêu đề thông báo:</label>
              <input
                type="text"
                placeholder="Nhập tiêu đề thông báo ngắn gọn, rõ ràng..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Nội dung chi tiết:</label>
              <textarea
                rows={4}
                placeholder="Nội dung truyền đạt tới công dân/người chơi..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="pinCheckbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="pinCheckbox" className="text-slate-300 text-xs cursor-pointer">
                Ghim thông báo lên thanh HUD đầu trang của người chơi
              </label>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20"
            >
              📢 Phát sóng ngay (Broadcast)
            </button>
          </form>
        </div>

        {/* Danh sách thông báo đã phát sóng */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-surface-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
              Lịch sử bản tin đã phát sóng ({broadcastList.length})
            </h2>
            <span className="text-[11px] text-slate-500">Real-time WebSocket Push</span>
          </div>

          <div className="space-y-3">
            {broadcastList.map((ann) => {
              const cfg = TYPE_CONFIG[ann.type];
              return (
                <div
                  key={ann.id}
                  className="rounded-2xl border border-slate-800/90 bg-surface-950/70 p-4 space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${cfg.badgeCls}`}>
                        <span>{cfg.icon}</span>
                        <span>{cfg.label}</span>
                      </span>
                      {ann.pinned && (
                        <span className="rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold">
                          📌 ĐÃ GHIM
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-mono">
                        Gửi đến: <b>{SCOPE_CONFIG[ann.scope]}</b>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(ann.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded hover:bg-rose-950/40 transition"
                    >
                      Xóa
                    </button>
                  </div>

                  <h3 className="font-bold text-sm text-slate-100">{ann.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{ann.content}</p>

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/60">
                    <span>Người phát: <b className="text-slate-400">{ann.sender}</b></span>
                    <span>Thời gian: {ann.createdAt}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
