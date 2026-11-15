import { PageHeader } from '@efls/ui';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

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

export function PlayersPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: players = [], isLoading, error, refetch } = useQuery<PlayerRow[]>({
    queryKey: ['admin', 'players', submitted],
    queryFn: () => adminRequest<PlayerRow[]>(`/api/v1/admin/players?q=${encodeURIComponent(submitted)}&limit=50`),
  });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(query.trim());
  }

  async function doAction(id: string, action: 'fine' | 'ban' | 'grant_aid' | 'unban') {
    let amount: number | undefined;
    if (action === 'fine' || action === 'grant_aid') {
      const raw = prompt('Nhập số tiền (₫):', '1000000');
      if (raw == null) return;
      amount = Math.max(0, Math.round(Number(raw)));
      if (!amount) return;
    }
    const note = prompt('Ghi chú (tuỳ chọn):', '') ?? '';
    setBusy(`${action}-${id}`);
    setMsg(null);
    try {
      await adminRequest(`/api/v1/admin/players/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action, characterId: id, amount: amount != null ? { amount, currency: 'VND' } : undefined, note: note || undefined }),
      });
      setMsg('Đã thực hiện hành động và ghi nhật ký. Người chơi (nếu có tài khoản) sẽ nhận thông báo trong hộp thư.');
      await refetch();
    } catch (err: any) {
      setMsg(err?.problem?.detail || err?.message || 'Thao tác thất bại.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý người chơi"
        description="Tra cứu nhân vật (tên, email, username, CCCD, id) và thực hiện can thiệp cơ bản: phạt tiền, cứu trợ, hạn chế/gỡ hạn chế. Thao tác được ghi action log và gửi thông báo cho người dùng."
        actions={<button type="button" onClick={() => refetch()} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Làm mới</button>}
      />

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
              <th className="py-3 px-3">CCCD</th>
              <th className="py-3 px-3">Trạng thái</th>
              <th className="py-3 px-3 text-right">Tiền mặt</th>
              <th className="py-3 px-3 text-right">Tín dụng</th>
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
              players.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">{p.fullName}</div>
                    <div className="font-mono text-[10px] text-slate-500">{p.id}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">
                    <div>{p.username ?? '—'} {p.role ? <span className="text-[10px] text-slate-500">({p.role})</span> : null}</div>
                    <div className="text-[10px] text-slate-500">{p.email ?? '—'}</div>
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
                  <td className="py-2.5 px-3 text-right font-mono">{p.creditScore}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{p.heatLevel}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      <button disabled={busy!=null} onClick={() => doAction(p.id,'grant_aid')} className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Cứu trợ</button>
                      <button disabled={busy!=null} onClick={() => doAction(p.id,'fine')} className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">Phạt</button>
                      <button disabled={busy!=null} onClick={() => doAction(p.id,'ban')} className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Hạn chế</button>
                      <button disabled={busy!=null} onClick={() => doAction(p.id,'unban')} className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Gỡ</button>
                    </div>
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
