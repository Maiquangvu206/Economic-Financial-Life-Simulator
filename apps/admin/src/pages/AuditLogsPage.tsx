import { useState } from 'react';
import { PageHeader } from '@efls/ui';

export type AuditActionType =
  | 'season_change'
  | 'weather_change'
  | 'holiday_toggle'
  | 'map_resize'
  | 'map_save'
  | 'broadcast_sent'
  | 'player_penalized'
  | 'macro_intervention';

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: string;
  ip: string;
  action: AuditActionType;
  actionNameVi: string;
  target: string;
  details: string;
  status: 'success' | 'warning' | 'failed';
}

const ACTION_CONFIG: Record<AuditActionType, { label: string; badgeCls: string }> = {
  season_change: {
    label: 'Chuyển Mùa',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  weather_change: { label: 'Thời Tiết', badgeCls: 'bg-sky-50 text-sky-700 border-sky-200' },
  holiday_toggle: { label: 'Lịch Nghỉ Lễ', badgeCls: 'bg-rose-50 text-rose-600 border-rose-200' },
  map_resize: { label: 'Kích Thước Map', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200' },
  map_save: { label: 'Lưu Quy Hoạch', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200' },
  broadcast_sent: {
    label: 'Phát Thông Báo',
    badgeCls: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  player_penalized: { label: 'Phạt Công Dân', badgeCls: 'bg-red-50 text-red-700 border-red-200' },
  macro_intervention: {
    label: 'Can Thiệp Vĩ Mô',
    badgeCls: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

export function AuditLogsPage() {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [logs] = useState<AuditLogItem[]>([
    {
      id: 'log_01',
      timestamp: '08/11/2026 02:12:45',
      actor: 'admin_super (ID: 001)',
      ip: '10.0.4.12',
      action: 'broadcast_sent',
      actionNameVi: 'Phát sóng Thông báo Toàn Server',
      target: 'Phạm vi: Toàn bộ công dân',
      details:
        'Gửi bản tin: "Thông báo toàn quốc nghỉ Tết Nguyên Đán và chi trả thưởng phúc lợi lì xì".',
      status: 'success',
    },
    {
      id: 'log_02',
      timestamp: '08/11/2026 02:05:10',
      actor: 'admin_super (ID: 001)',
      ip: '10.0.4.12',
      action: 'map_resize',
      actionNameVi: 'Mở rộng quy mô Bản đồ',
      target: 'Map Editor (40x25 -> 50x30)',
      details:
        'Mở rộng lưới đại đô thị lên 1.500 ô. Hệ thống tự động bảo toàn 100% dữ liệu các ô đất cũ.',
      status: 'success',
    },
    {
      id: 'log_03',
      timestamp: '08/11/2026 01:58:30',
      actor: 'admin_operator (ID: 004)',
      ip: '10.0.4.55',
      action: 'map_save',
      actionNameVi: 'Lưu quy hoạch Vùng & Giao thông',
      target: 'Zone: Thương mại & Đại lộ [12-8, 12-9]',
      details:
        'Gán đơn giá đất 120.000.000 ₫/m² và quy hoạch hạ tầng đường cao tốc 6 làn xe kết nối khu công nghiệp.',
      status: 'success',
    },
    {
      id: 'log_04',
      timestamp: '08/11/2026 01:45:18',
      actor: 'admin_super (ID: 001)',
      ip: '10.0.4.12',
      action: 'holiday_toggle',
      actionNameVi: 'Cập nhật Chế độ Nghỉ Lễ & Lương OT',
      target: 'Tết Nguyên Đán (10/02 - 17/02)',
      details:
        'Kích hoạt hệ số lương làm thêm giờ OT x300% theo Bộ luật Lao động Việt Nam và bật lịch nghỉ cho công nhân.',
      status: 'success',
    },
    {
      id: 'log_05',
      timestamp: '08/11/2026 01:32:04',
      actor: 'system_gm_ai',
      ip: 'internal_worker',
      action: 'weather_change',
      actionNameVi: 'Điều phối Thời tiết Mùa Xuân',
      target: 'Toàn thành phố',
      details: 'Thời tiết: Nắng ráo ☀️, năng suất lao động +10%, tiêu hao thể lực bình thường.',
      status: 'success',
    },
    {
      id: 'log_06',
      timestamp: '08/11/2026 00:50:22',
      actor: 'admin_security (ID: 002)',
      ip: '10.0.4.18',
      action: 'player_penalized',
      actionNameVi: 'Phong tỏa Tài khoản Gian lận',
      target: 'Player: "trum_choden_99"',
      details:
        'Phát hiện rửa tiền 45 tỷ ₫ qua sàn BĐS không hóa đơn chứng từ. Tăng Heat Level lên 100/100.',
      status: 'warning',
    },
  ]);

  const filteredLogs = logs.filter((item) => {
    const matchType = filterType === 'all' || item.action === filterType;
    const matchQuery =
      item.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.actionNameVi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.target.toLowerCase().includes(searchQuery.toLowerCase());
    return matchType && matchQuery;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhật ký Can thiệp Hệ thống (Admin Audit Logs)"
        description="Ghi nhận toàn bộ thao tác can thiệp của Quản trị viên: Actor, IP, Hành động, Thời gian và Chi tiết nhằm phục vụ kiểm toán và giám sát bảo mật."
      />

      {/* Thanh bộ lọc & Tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700">Lọc theo hành động:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
          >
            <option value="all">Tất cả hành động ({logs.length})</option>
            {Object.keys(ACTION_CONFIG).map((k) => (
              <option key={k} value={k}>
                {ACTION_CONFIG[k as AuditActionType].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Tìm theo Admin, Hành động, Chi tiết..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Bảng Danh sách Audit Logs */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 shadow-2xl">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-600">
            <tr>
              <th className="py-3 px-4">Thời gian</th>
              <th className="py-3 px-4">Admin / Thực thể</th>
              <th className="py-3 px-4">Loại hành động</th>
              <th className="py-3 px-4">Mục tiêu (Target)</th>
              <th className="py-3 px-4">Chi tiết thao tác can thiệp</th>
              <th className="py-3 px-4 text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 font-sans">
            {filteredLogs.map((log) => {
              const cfg = ACTION_CONFIG[log.action] || {
                label: log.action,
                badgeCls: 'bg-slate-100 text-slate-700',
              };
              return (
                <tr key={log.id} className="hover:bg-slate-100/40 transition">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-semibold text-slate-800">{log.actor}</div>
                    <div className="text-[10px] font-mono text-slate-500">{log.ip}</div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${cfg.badgeCls}`}
                    >
                      {cfg.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-amber-700/90 whitespace-nowrap">
                    {log.target}
                  </td>
                  <td className="py-3 px-4 text-slate-700 leading-relaxed max-w-md">
                    {log.details}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {log.status === 'success' && (
                      <span className="text-[11px] text-emerald-600 font-bold bg-emerald-50/50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                        ✓ Thành công
                      </span>
                    )}
                    {log.status === 'warning' && (
                      <span className="text-[11px] text-amber-600 font-bold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                        ⚠ Cảnh báo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredLogs.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-500">
            Không tìm thấy bản ghi Audit Log nào phù hợp với bộ lọc.
          </div>
        )}
      </div>
    </div>
  );
}
