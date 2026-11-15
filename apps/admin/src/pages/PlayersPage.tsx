import { PageHeader } from '@efls/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';
import { useAdminSession } from '../features/auth/session';

type Money = { amount: number; currency: 'VND' };
interface PlayerRow {
  id: string;
  userId: string | null;
  fullName: string;
  cccd: string | null;
  isAlive: boolean;
  cash: Money;
  creditScore: number;
  heatLevel: number;
  age: number;
  role?: string | null;
  email?: string | null;
  username?: string | null;
  accountStatus?: string | null;
}

function fmtMoney(m: Money) {
  return `${(m?.amount ?? 0).toLocaleString('vi-VN')} ₫`;
}

const ROLE_LABEL: Record<string, string> = {
  player: 'Người chơi',
  moderator: 'Điều hành (moderator)',
  admin: 'Quản trị (admin)',
};

export function PlayersPage() {
  const session = useAdminSession();
  const isSuperAdmin = session?.user.role === 'admin';

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  const [createForm, setCreateForm] = useState({
    email: '',
    username: '',
    fullName: '',
    password: '',
    role: 'moderator' as 'admin' | 'moderator',
  });

  const { data: players = [], isLoading, error, refetch } = useQuery<PlayerRow[]>({
    queryKey: ['admin', 'players', submitted],
    queryFn: () => adminRequest<PlayerRow[]>(`/api/v1/admin/players?q=${encodeURIComponent(submitted)}&limit=50`),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of players) {
      if (p.userId) next[p.userId] = p.role || 'player';
    }
    setRoleDrafts((prev) => ({ ...next, ...prev }));
  }, [players]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(query.trim());
  }

  async function doAction(id: string, action: 'fine' | 'ban' | 'grant_aid' | 'unban' | 'force_delete', label?: string) {
    let amount: number | undefined;
    let note = '';

    if (action === 'force_delete') {
      if (!isSuperAdmin) return;
      const ok = confirm(
        `CƯỠNG CHẾ XÓA tài khoản${label ? ` "${label}"` : ''}?\n\n` +
          'Hành động này sẽ xóa vĩnh viễn tài khoản/người dùng và nhân vật liên quan (dữ liệu liên kết có thể bị xóa theo ràng buộc). ' +
          'Chỉ dùng khi phát hiện bất thường nghiêm trọng. Không thể hoàn tác.\n\nBấm OK để tiếp tục.',
      );
      if (!ok) return;
      note = (prompt('Nhập LÝ DO bắt buộc (ghi vào audit log):', '') ?? '').trim();
      if (!note) {
        setMsg('Đã hủy: cần nhập lý do để cưỡng chế xóa tài khoản.');
        return;
      }
    } else {
      if (action === 'fine' || action === 'grant_aid') {
        const raw = prompt('Nhập số tiền (₫):', '1000000');
        if (raw == null) return;
        amount = Math.max(0, Math.round(Number(raw)));
        if (!amount) return;
      }
      if (action === 'ban') {
        note = (prompt('Nhập lý do khóa tài khoản (tuỳ chọn):', 'Bị khóa bởi quản trị viên') ?? '').trim();
      } else {
        note = prompt('Ghi chú (tuỳ chọn):', '') ?? '';
      }
    }

    setBusy(`${action}-${id}`);
    setMsg(null);
    try {
      await adminRequest(`/api/v1/admin/players/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          characterId: id,
          amount: amount != null ? { amount, currency: 'VND' } : undefined,
          note: note || undefined,
        }),
      });
      setMsg(
        action === 'force_delete'
          ? 'Đã cưỡng chế xóa tài khoản và ghi audit log.'
          : action === 'ban'
            ? 'Đã khóa tài khoản. Người dùng sẽ bị đăng xuất (theo thời gian thực, nếu đang online) và không thể đăng nhập cho tới khi được mở.'
            : action === 'unban'
              ? 'Đã mở khóa tài khoản. Người dùng có thể đăng nhập lại.'
              : 'Đã thực hiện hành động và ghi nhật ký. Người chơi (nếu có tài khoản) sẽ nhận thông báo trong hộp thư.',
      );
      await refetch();
    } catch (err: any) {
      setMsg(err?.problem?.detail || err?.message || 'Thao tác thất bại.');
    } finally {
      setBusy(null);
    }
  }

  async function submitCreateAdmin(e: FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setBusy('create-admin');
    setMsg(null);
    try {
      await adminRequest('/api/v1/admin/accounts/create', {
        method: 'POST',
        body: JSON.stringify({
          email: createForm.email.trim(),
          username: createForm.username.trim(),
          fullName: createForm.fullName.trim(),
          password: createForm.password,
          role: createForm.role,
        }),
      });
      setMsg(`Đã tạo tài khoản ${createForm.role} mới (${createForm.email}). Tài khoản có thể đăng nhập qua cổng web-game và truy cập admin (SSO) nếu có quyền.`);
      setCreateForm({ email: '', username: '', fullName: '', password: '', role: 'moderator' });
      await refetch();
    } catch (err: any) {
      setMsg(err?.problem?.detail || err?.message || 'Không thể tạo tài khoản quản trị.');
    } finally {
      setBusy(null);
    }
  }

  async function saveRole(p: PlayerRow) {
    if (!p.userId || !isSuperAdmin) return;
    const nextRole = roleDrafts[p.userId] || p.role || 'player';
    const currentRole = p.role || 'player';
    if (nextRole === currentRole) return;
    if (!confirm(`Đổi quyền tài khoản ${p.email || p.username || p.userId} từ "${currentRole}" sang "${nextRole}"? Người dùng cần đăng nhập lại để áp dụng quyền mới.`)) return;
    const note = prompt('Ghi chú (tuỳ chọn):', '') ?? '';
    setBusy(`role-${p.userId}`);
    setMsg(null);
    try {
      await adminRequest('/api/v1/admin/accounts/role', {
        method: 'POST',
        body: JSON.stringify({ userId: p.userId, role: nextRole, note: note || undefined }),
      });
      setMsg(`Đã cập nhật quyền tài khoản thành "${nextRole}" và ghi audit log/thông báo cho người dùng.`);
      await refetch();
    } catch (err: any) {
      setMsg(err?.problem?.detail || err?.message || 'Không thể cập nhật quyền.');
      setRoleDrafts((s) => ({ ...s, [p.userId!]: currentRole }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý người chơi & tài khoản"
        description="Tra cứu, can thiệp người chơi, và (chỉ admin) cấp tài khoản/quyền quản trị. Thao tác nhạy cảm được ghi audit log và thông báo tới người dùng; thay đổi quyền yêu cầu đăng nhập lại để áp dụng."
        actions={<button type="button" onClick={() => refetch()} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Làm mới</button>}
      />

      {isSuperAdmin && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Cấp tài khoản quản trị mới</h2>
            <p className="text-[11px] text-slate-600 mt-0.5">Chỉ <b>admin</b> thực hiện được. Tạo tài khoản (kèm nhân vật) với quyền <b>admin</b> hoặc <b>moderator</b>, có thể đăng nhập qua cổng người chơi và truy cập admin portal.</p>
          </div>
          <form onSubmit={submitCreateAdmin} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2 text-xs">
            <input required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} type="email" placeholder="Email" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input required value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} placeholder="Username" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input required value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} placeholder="Họ tên (nhân vật)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input required minLength={8} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} type="password" placeholder="Mật khẩu (>=8 ký tự)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'moderator' })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium">
              <option value="moderator">moderator (điều hành)</option>
              <option value="admin">admin (quản trị)</option>
            </select>
            <button disabled={busy === 'create-admin'} type="submit" className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white hover:bg-amber-500 disabled:opacity-50">
              {busy === 'create-admin' ? 'Đang tạo...' : 'Tạo tài khoản'}
            </button>
          </form>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tên nhân vật, email, username, CCCD hoặc character id"
          className="w-full max-w-xl rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-amber-600"
        />
        <button type="submit" className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500">Tìm</button>
      </form>

      {msg && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{msg}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được danh sách: {(error as any)?.message || 'Lỗi'}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
            <tr>
              <th className="py-3 px-3">Nhân vật</th>
              <th className="py-3 px-3">Tài khoản</th>
              <th className="py-3 px-3">Quyền truy cập</th>
              <th className="py-3 px-3">CCCD</th>
              <th className="py-3 px-3">Trạng thái</th>
              <th className="py-3 px-3 text-right">Tiền mặt</th>
              <th className="py-3 px-3 text-right">Heat</th>
              <th className="py-3 px-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {isLoading ? (
              <tr><td className="py-8 text-center text-slate-500" colSpan={8}>Đang tải...</td></tr>
            ) : players.length === 0 ? (
              <tr><td className="py-10 text-center text-slate-500" colSpan={8}>{submitted ? `Không tìm thấy kết quả cho "${submitted}".` : 'Không có nhân vật.'}</td></tr>
            ) : (
              players.map((p) => {
                const currentRole = p.role || 'player';
                const draftRole = p.userId ? (roleDrafts[p.userId] || currentRole) : currentRole;
                const roleChanged = !!p.userId && draftRole !== currentRole;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 align-top">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{p.fullName}</div>
                      <div className="font-mono text-[10px] text-slate-500">{p.id}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <div>{p.username ?? '—'}</div>
                      <div className="text-[10px] text-slate-500">{p.email ?? '—'}</div>
                      {p.userId && <div className="font-mono text-[10px] text-slate-400">uid: {p.userId}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      {p.userId ? (
                        <div className="space-y-1">
                          <select
                            value={draftRole}
                            disabled={!isSuperAdmin || busy != null}
                            onChange={(e) => setRoleDrafts((s) => ({ ...s, [p.userId!]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] disabled:bg-slate-100"
                          >
                            <option value="player">player - Người chơi</option>
                            <option value="moderator">moderator - Điều hành</option>
                            <option value="admin">admin - Quản trị</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">Hiện tại: {ROLE_LABEL[currentRole] || currentRole}</span>
                            {roleChanged && isSuperAdmin && (
                              <button
                                type="button"
                                disabled={busy != null}
                                onClick={() => saveRole(p)}
                                className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                              >
                                Lưu
                              </button>
                            )}
                          </div>
                          {!isSuperAdmin && <div className="text-[10px] text-amber-700">Chỉ admin mới đổi quyền</div>}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500">Không có tài khoản</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">{p.cccd ?? '—'}</td>
                    <td className="py-2.5 px-3 space-y-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.isAlive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                        {p.isAlive ? 'Sống' : 'Đã chết'} · {p.age} tuổi
                      </span>
                      {p.accountStatus && p.accountStatus !== 'active' && (
                        <div className="text-[10px] font-semibold text-rose-700">TK: {p.accountStatus}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmtMoney(p.cash)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{p.heatLevel}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        <button disabled={busy!=null} onClick={() => doAction(p.id,'grant_aid', p.fullName)} className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Cứu trợ</button>
                        <button disabled={busy!=null} onClick={() => doAction(p.id,'fine', p.fullName)} className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">Phạt</button>
                        <button disabled={busy!=null} onClick={() => doAction(p.id,'ban', p.fullName)} className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50" title="Khóa tài khoản (người dùng sẽ bị đăng xuất theo thời gian thực và không thể đăng nhập)">Khóa</button>
                        <button disabled={busy!=null} onClick={() => doAction(p.id,'unban', p.fullName)} className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" title="Mở khóa tài khoản (cho phép đăng nhập lại)">Mở</button>
                        {isSuperAdmin && (
                          <button
                            disabled={busy!=null}
                            onClick={() => doAction(p.id,'force_delete', `${p.fullName}${p.email ? ` (${p.email})` : ''}`)}
                            className="rounded-lg bg-red-700 border border-red-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                            title="Chỉ super admin: xóa cưỡng chế khi phát hiện bất thường (không thể hoàn tác)"
                          >
                            Xóa cưỡng chế
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
