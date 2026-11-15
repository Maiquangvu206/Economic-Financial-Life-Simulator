import { Fragment, useMemo, useState } from 'react';
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

const ACTION_LABELS: Record<string, string> = {
  'broadcast.create': 'Phát thông báo',
  'broadcast.delete': 'Xóa thông báo',
  'game.config.update': 'Cập nhật cấu hình game',
  'player.fine': 'Phạt người chơi',
  'player.grant_aid': 'Cứu trợ người chơi',
  'player.ban': 'Khóa tài khoản',
  'player.restrict': 'Hạn chế tài khoản',
  'player.unban': 'Gỡ khóa/gỡ hạn chế',
  'player.force_delete': 'Cưỡng chế xóa tài khoản',
  'gift_code.create': 'Tạo mã quà tặng',
  'gift_code.update': 'Cập nhật mã quà tặng',
  'gift_code.delete': 'Xóa mã quà tặng',
  'macro.event.trigger': 'Kích hoạt sự kiện vĩ mô',
  'admin.account.create': 'Tạo tài khoản quản trị',
  'admin.account.set_role': 'Thay đổi quyền tài khoản',
  'admin.sweep.trigger': 'Kích hoạt Đại án Công an',
  'ai.sweep.evaluate': 'AI đánh giá/kích hoạt Đại án',
  'admin.offline_policy.update': 'Cập nhật chính sách Offline',
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/[._-]+/g, ' ');
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function fmtValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  } catch {
    return String(v);
  }
}

function summarize(action: string, detail: Record<string, unknown> | null | undefined): string {
  const d = detail ?? {};
  const pick = (...keys: string[]) => keys.map((k) => d[k]).find((v) => v != null && v !== '');
  switch (action) {
    case 'player.fine':
      return `Phạt ${d.characterName ?? shortId(d.characterId as string)}${d.amountMinor != null ? ` · ${Number(d.amountMinor).toLocaleString('vi-VN')} ₫` : ''}${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'player.grant_aid':
      return `Cứu trợ ${d.characterName ?? shortId(d.characterId as string)}${d.amountMinor != null ? ` · ${Number(d.amountMinor).toLocaleString('vi-VN')} ₫` : ''}${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'player.ban':
      return `Khóa tài khoản ${d.characterName ?? shortId(d.characterId as string)}${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'player.restrict':
      return `Hạn chế ${d.characterName ?? shortId(d.characterId as string)}${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'player.unban':
      return `Gỡ khóa/gỡ hạn chế ${d.characterName ?? shortId(d.characterId as string)}${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'player.force_delete':
      return `Cưỡng chế xóa ${d.characterName ?? shortId(d.characterId as string)}${d.username || d.email ? ` · ${fmtValue(d.username ?? d.email)}` : ''}${d.note ? ` · Lý do: ${fmtValue(d.note)}` : ''}`;
    case 'broadcast.create':
      return `${pick('title') ?? 'Thông báo'}${d.type ? ` · ${fmtValue(d.type)}` : ''}${d.scope ? ` · ${fmtValue(d.scope)}` : ''}${d.pinned ? ' · ghim' : ''}`;
    case 'broadcast.delete':
      return `Xóa bản tin ${shortId(pick('broadcastId', 'id') as string)}`;
    case 'game.config.update': {
      const parts = [d.season, d.otRatePercent != null ? `OT ${d.otRatePercent}%` : null].filter(Boolean);
      return parts.length ? parts.map(String).join(' · ') : 'Cập nhật cấu hình hệ thống';
    }
    case 'gift_code.create':
    case 'gift_code.update':
    case 'gift_code.delete':
      return `${pick('code', 'title') ?? shortId(pick('giftCodeId', 'id') as string)}${d.title && d.code ? ` · ${fmtValue(d.title)}` : ''}`;
    case 'macro.event.trigger':
      return `${pick('type') ?? 'Sự kiện'}${d.severity != null ? ` · mức ${Math.round(Number(d.severity) * 100)}%` : ''}${d.durationInGameYears != null ? ` · ${d.durationInGameYears} năm` : ''}${d.reason ? ` · ${fmtValue(d.reason)}` : ''}`;
    case 'admin.account.create':
      return `${pick('username') ?? pick('email') ?? 'Tài khoản'} · quyền ${pick('role') ?? '—'}`;
    case 'admin.account.set_role':
      return `${pick('username') ?? pick('email') ?? shortId(d.targetUserId as string)} · ${pick('fromRole') ?? '?'} → ${pick('toRole') ?? '?'}${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'admin.sweep.trigger':
      return d.scope === 'all'
        ? `Toàn hệ thống · ảnh hưởng ${d.affected ?? 0} nhân vật · phạt ${fmtValue(d.totalFineMinor)} ₫${d.note ? ` · ${fmtValue(d.note)}` : ''}`
        : `Nhân vật ${shortId(d.characterId as string)} · heat ${d.triggerHeat ?? '—'} · phạt ${fmtValue(d.fineMinor)} ₫${d.note ? ` · ${fmtValue(d.note)}` : ''}`;
    case 'ai.sweep.evaluate':
      return `${pick('trigger') ?? 'auto'} · ${pick('action') ?? pick('scope') ?? '—'} · phạm vi ${pick('scope') ?? '—'} · ảnh hưởng ${d.affected ?? 0}${d.rationale ? ` · ${fmtValue(d.rationale)}` : ''}`;
    case 'admin.offline_policy.update': {
      const parts = [
        d.enabled != null ? `hệ thống ${d.enabled ? 'bật' : 'tắt'}` : null,
        d.maxOfflineMinutes != null ? `giới hạn ${d.maxOfflineMinutes} phút` : null,
        d.allowCatchup != null ? `bù tiến trình ${d.allowCatchup ? 'cho phép' : 'chặn'}` : null,
        d.allowAutoClaimWelfare != null ? `tự nhận phúc lợi ${d.allowAutoClaimWelfare ? 'cho phép' : 'chặn'}` : null,
        d.allowAutoPay != null ? `tự trả nợ/thuế ${d.allowAutoPay ? 'cho phép' : 'chặn'}` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Cập nhật cấu hình offline toàn hệ thống';
    }
    default: {
      const entries = Object.entries(d).filter(([, v]) => v != null && v !== '').slice(0, 3);
      if (!entries.length) return '—';
      return entries.map(([k, v]) => `${k}: ${fmtValue(v)}`).join(' · ');
    }
  }
}

export function AuditLogsPage() {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: logs = [], isLoading, error, refetch } = useQuery<AuditLogItem[]>({
    queryKey: ['admin', 'audit-logs'],
    queryFn: () => adminRequest<AuditLogItem[]>('/api/v1/admin/audit-logs?limit=200'),
    refetchInterval: 30000,
  });

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((item) => {
      if (filter !== 'all' && item.action !== filter) return false;
      if (!q) return true;
      const detailStr = JSON.stringify(item.detail ?? {}).toLowerCase();
      return (
        item.action.toLowerCase().includes(q) ||
        actionLabel(item.action).toLowerCase().includes(q) ||
        (item.actorId ?? '').toLowerCase().includes(q) ||
        detailStr.includes(q)
      );
    });
  }, [logs, filter, searchQuery]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhật ký Audit Log"
        description="Ghi nhận các thao tác quản trị quan trọng (phát sóng, cấu hình, can thiệp người chơi, giftcode, sự kiện…) để kiểm toán."
        actions={<button type="button" onClick={() => refetch()} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Làm mới</button>}
      />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được nhật ký: {(error as any)?.message || 'Lỗi'}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-600">Loại:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
          >
            <option value="all">Tất cả ({logs.length})</option>
            {actions.map((k) => (
              <option key={k} value={k}>{actionLabel(k)}</option>
            ))}
          </select>
          <span className="text-slate-500">Hiển thị {filteredLogs.length}/{logs.length}</span>
        </div>
        <input
          type="text"
          placeholder="Tìm theo hành động, người thực hiện, nội dung..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-72 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
            <tr>
              <th className="py-2.5 px-4 w-[170px]">Thời gian</th>
              <th className="py-2.5 px-4">Hành động</th>
              <th className="py-2.5 px-4">Tóm tắt</th>
              <th className="py-2.5 px-4 w-[120px]">Người thực hiện</th>
              <th className="py-2.5 px-4 w-[90px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td className="py-8 px-4 text-center text-slate-500" colSpan={5}>Đang tải nhật ký...</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td className="py-10 px-4 text-center text-slate-500" colSpan={5}>Chưa có bản ghi phù hợp.</td></tr>
            ) : (
              filteredLogs.map((log) => {
                const isOpen = !!expanded[log.id];
                const hasDetail = log.detail && Object.keys(log.detail).length > 0;
                return (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-slate-50/70 transition align-top">
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-600">{fmtDate(log.createdAt)}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-800">{actionLabel(log.action)}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">{log.action}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 leading-relaxed">{summarize(log.action, log.detail)}</td>
                      <td className="py-2.5 px-4 text-slate-600" title={log.actorId ?? ''}>{shortId(log.actorId)}</td>
                      <td className="py-2.5 px-4 text-right">
                        {hasDetail ? (
                          <button
                            type="button"
                            onClick={() => setExpanded((s) => ({ ...s, [log.id]: !s[log.id] }))}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                          >
                            {isOpen ? 'Ẩn' : 'Chi tiết'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={5} className="px-4 pb-3 pt-0">
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dữ liệu chi tiết</div>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700">
                              {JSON.stringify(log.detail, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
