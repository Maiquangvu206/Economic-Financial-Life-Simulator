import { PageHeader } from '@efls/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';
import { useAdminSession } from '../features/auth/session';
import { useDialog } from '../shared/ui/DialogContext';

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
  deathAge?: number | null;
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
  moderator: 'Điều hành',
  admin: 'Quản trị',
};

export function PlayersPage() {
  const session = useAdminSession();
  const { confirm, prompt } = useDialog();
  const isSuperAdmin = session?.user.role === 'admin';

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [deathAgeDrafts, setDeathAgeDrafts] = useState<Record<string, string>>({});

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
    const nextDeath: Record<string, string> = {};
    for (const p of players) {
      if (p.userId) next[p.userId] = p.role || 'player';
      nextDeath[p.id] = p.deathAge != null ? String(p.deathAge) : '';
    }
    setRoleDrafts((prev) => ({ ...next, ...prev }));
    setDeathAgeDrafts((prev) => ({ ...nextDeath, ...prev }));
  }, [players]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(query.trim());
  }

  async function doAction(id: string, action: 'fine' | 'ban' | 'grant_aid' | 'unban' | 'force_delete' | 'set_death_age', label?: string) {
    let amount: number | undefined;
    let deathAge: number | null | undefined;
    let note = '';

    if (action === 'set_death_age') {
      const draft = (deathAgeDrafts[id] ?? '').trim();
      if (!draft) {
        const ok = await confirm({
          title: `Gỡ cấu hình tuổi thọ tối đa${label ? ` của "${label}"` : ' của nhân vật này'}?`,
          type: 'warning',
          confirmText: 'Gỡ cấu hình',
          message: 'Nhân vật sẽ không còn chết theo ngưỡng tuổi thọ do admin đặt.',
        });
        if (!ok) return;
        deathAge = null;
      } else {
        const val = Math.trunc(Number(draft));
        if (!Number.isFinite(val) || val < 1 || val > 200) {
          setMsg('Tuổi thọ tối đa không hợp lệ (1 - 200).');
          return;
        }
        deathAge = val;
      }
      note = (await prompt({ title: 'Ghi chú (tuỳ chọn)', confirmText: 'Lưu ghi chú', cancelText: 'Bỏ qua' })) ?? '';
    } else if (action === 'force_delete') {
      if (!isSuperAdmin) return;
      const ok = await confirm({
        title: `CƯỠNG CHẾ XÓA tài khoản${label ? ` "${label}"` : ''}?`,
        type: 'danger',
        confirmText: 'Xóa vĩnh viễn',
        message: [
          'Hành động này sẽ xóa VĨNH VIỄN tài khoản/người dùng và nhân vật liên quan (dữ liệu liên kết có thể bị xóa theo ràng buộc).',
          'Chỉ dùng khi phát hiện bất thường nghiêm trọng.',
          'Không thể hoàn tác.',
        ],
      });
      if (!ok) return;
      const reason = await prompt({
        title: 'Nhập lý do bắt buộc',
        type: 'danger',
        confirmText: 'Tiếp tục xóa',
        required: true,
        placeholder: 'Lý do (ghi vào audit log)',
      });
      note = (reason ?? '').trim();
      if (!note) {
        setMsg('Đã hủy: cần nhập lý do để cưỡng chế xóa tài khoản.');
        return;
      }
    } else {
      if (action === 'fine' || action === 'grant_aid') {
        const raw = await prompt({
          title: action === 'fine' ? 'Nhập số tiền phạt (₫)' : 'Nhập số tiền cứu trợ (₫)',
          type: 'warning',
          inputType: 'number',
          defaultValue: '1000000',
          confirmText: 'Xác nhận',
        });
        if (raw == null) return;
        amount = Math.max(0, Math.round(Number(raw)));
        if (!amount) return;
      }
      if (action === 'ban') {
        note = (await prompt({
          title: 'Lý do khóa tài khoản (tuỳ chọn)',
          defaultValue: 'Bị khóa bởi quản trị viên',
          confirmText: 'Khóa tài khoản',
        })) ?? '';
      } else {
        note = (await prompt({ title: 'Ghi chú (tuỳ chọn)', confirmText: 'Xác nhận', cancelText: 'Bỏ qua' })) ?? '';
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
          ...(action === 'set_death_age' ? { deathAge } : {}),
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
              : action === 'set_death_age'
                ? (deathAge == null
                  ? 'Đã gỡ cấu hình tuổi thọ tối đa cho nhân vật.'
                  : `Đã đặt tuổi thọ tối đa ${deathAge} tuổi. Khi đạt tuổi này, nhân vật sẽ qua đời và yêu cầu chuyển sang nhân vật kế tiếp.`)
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
    if (!await confirm({
      title: `Đổi quyền tài khoản ${p.email || p.username || p.userId}?`,
      type: 'warning',
      confirmText: `Đổi sang "${nextRole}"`,
      message: `Quyền sẽ thay đổi từ "${currentRole}" sang "${nextRole}". Người dùng cần đăng nhập lại để áp dụng quyền mới.`,
    })) return;
    const note = (await prompt({ title: 'Ghi chú (tuỳ chọn)', confirmText: 'Xác nhận', cancelText: 'Bỏ qua' })) ?? '';
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
        actions={<button type="button" onClick={() => refetch()} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Làm mới</button>}
      />

      {isSuperAdmin && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Cấp tài khoản quản trị mới</h2>
          </div>
          <form onSubmit={submitCreateAdmin} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2 text-xs">
            <input required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} type="email" placeholder="Email" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input required value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} placeholder="Username" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input required value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} placeholder="Họ tên (nhân vật)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input required minLength={8} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} type="password" placeholder="Mật khẩu (>=8 ký tự)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'moderator' })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium">
              <option value="moderator">Điều hành viên</option>
              <option value="admin">Quản trị viên</option>
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

      <div className="overflow-auto max-h-[70vh] rounded-2xl border border-slate-200 bg-white/80">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-slate-600">
            <tr>
              <th className="py-3 px-3">Nhân vật</th>
              <th className="py-3 px-3">Tài khoản</th>
              <th className="py-3 px-3">Quyền truy cập</th>
              <th className="py-3 px-3">CCCD</th>
              <th className="py-3 px-3">Trạng thái / Tuổi thọ</th>
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
                            <option value="player">Người chơi</option>
                            <option value="moderator">Điều hành viên</option>
                            <option value="admin">Quản trị viên</option>
                          </select>
                          <div className="flex items-center gap-1">
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
                    {currentRole === 'player' ? (
                      <>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{p.cccd ?? '—'}</td>
                        <td className="py-2.5 px-3 space-y-1.5">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.isAlive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {p.isAlive ? 'Sống' : 'Đã chết'} · {p.age} tuổi
                          </span>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-slate-600">Tuổi thọ tối đa:</label>
                            <input
                              type="number"
                              min={p.age + 1}
                              max={200}
                              value={deathAgeDrafts[p.id] ?? ''}
                              onChange={(e) => setDeathAgeDrafts((s) => ({ ...s, [p.id]: e.target.value }))}
                              placeholder="—"
                              className="w-16 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                              title="Khi nhân vật đạt tuổi này sẽ qua đời và yêu cầu chuyển sang nhân vật kế tiếp. Để trống để gỡ cấu hình."
                            />
                            <button
                              type="button"
                              disabled={busy != null || !p.isAlive}
                              onClick={() => doAction(p.id, 'set_death_age', p.fullName)}
                              className="rounded-md bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                              title="Lưu tuổi thọ tối đa (khi đạt tuổi sẽ chết). Để trống rồi bấm Lưu để gỡ."
                            >
                              Lưu
                            </button>
                          </div>
                          {p.deathAge != null && (
                            <div className="text-[10px] text-slate-500">Đã cấu hình: chết ở {p.deathAge} tuổi</div>
                          )}
                          {p.accountStatus === 'banned' ? (
                            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Tài khoản đã bị khóa</span>
                          ) : p.accountStatus === 'active' ? (
                            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Đang hoạt động</span>
                          ) : (
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
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-500">
                          <div className="font-medium text-slate-700">Tài khoản {ROLE_LABEL[currentRole] || currentRole}</div>
                          {p.accountStatus === 'banned' ? (
                            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Tài khoản đã bị khóa</span>
                          ) : p.accountStatus === 'active' ? (
                            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Đang hoạt động</span>
                          ) : (
                            <div className="text-[10px] font-semibold text-rose-700 mt-1">TK: {p.accountStatus}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">—</td>
                        <td className="py-2.5 px-3">
                          {isSuperAdmin ? (
                            <div className="flex flex-wrap gap-1">
                              <button disabled={busy!=null} onClick={() => doAction(p.id,'ban', p.fullName)} className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50" title="Khóa tài khoản">Khóa</button>
                              <button disabled={busy!=null} onClick={() => doAction(p.id,'unban', p.fullName)} className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" title="Mở khóa tài khoản">Mở khóa</button>
                              <button
                                disabled={busy!=null}
                                onClick={() => doAction(p.id,'force_delete', `${p.fullName}${p.email ? ` (${p.email})` : ''}`)}
                                className="rounded-lg bg-red-700 border border-red-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                                title="Xóa cưỡng chế (không thể hoàn tác)"
                              >
                                Xóa
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500">Chỉ admin mới thao tác với tài khoản quản trị/điều hành</span>
                          )}
                        </td>
                      </>
                    )}
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
