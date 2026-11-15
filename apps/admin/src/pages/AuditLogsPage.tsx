import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { adminRequest } from '../shared/api/httpClient';

interface AuditLogItem {
  id: string;
  actorId: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    'broadcast.create': 'Phát thông báo',
    'broadcast.delete': 'Xóa thông báo',
    'game.config.update': 'Cập nhật cấu hình game/mùa',
    'player.fine': 'Phạt người chơi',
    'player.grant_aid': 'Cứu trợ người chơi',
    'player.ban': 'Hạn chế tài khoản',
    'player.unban': 'Gỡ hạn chế',
  };
  return map[action] ?? action;
}

export function AuditLogsPage() {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: logs = [], isLoading, error, refetch } = useQuery<AuditLogItem[]>({
    queryKey: ['admin', 'audit-logs'],
    queryFn: () => adminRequest<AuditLogItem[]>('/api/v1/admin/audit-logs?limit=200'),
  });

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);

  const filteredLogs = logs.filter((item) => {
    const matchType = filter === 'all' || item.action === filter;
    const q = searchQuery.toLowerCase();
    const detailStr = JSON.stringify(item.detail ?? {}).toLowerCase();
    const matchQuery = !q || item.action.toLowerCase().includes(q) || (item.actorId ?? '').toLowerCase().includes(q) || detailStr.includes(q);
    return matchType && matchQuery;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhật ký Can thiệp Hệ thống (Admin Audit Logs)"
        description="Ghi nhận thao tác quản trị từ hệ thống (action_log): phát sóng, cấu hình, can thiệp người chơi… phục vụ kiểm toán và giám sát."
        actions={<button type="button" onClick={() => refetch()} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Làm mới</button>}
      />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được nhật ký: {(error as any)?.message || 'Lỗi'}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700">Lọc theo hành động:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
          >
            <option value="all">Tất cả ({logs.length})</option>
            {actions.map((k) => (
              <option key={k} value={k}>{actionLabel(k)} ({k})</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="Tìm theo action, actor, chi tiết..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-72 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-600">
            <tr>
              <th className="py-3 px-4">Thời gian</th>
              <th className="py-3 px-4">Actor ID</th>
              <th className="py-3 px-4">Hành động</th>
              <th className="py-3 px-4">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 font-sans">
            {isLoading ? (
              <tr><td className="py-6 px-4 text-center text-slate-500" colSpan={4}>Đang tải...</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td className="py-10 px-4 text-center text-slate-500" colSpan={4}>Chưa có bản ghi hoặc không khớp bộ lọc.</td></tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-100/40 transition align-top">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">{log.actorId ?? '—'}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {actionLabel(log.action)}
                    </span>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">{log.action}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700 leading-relaxed max-w-xl">
                    <pre className="whitespace-pre-wrap break-words font-sans text-[11px] bg-slate-50 rounded-lg p-2 border border-slate-200">
                      {JSON.stringify(log.detail ?? {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
