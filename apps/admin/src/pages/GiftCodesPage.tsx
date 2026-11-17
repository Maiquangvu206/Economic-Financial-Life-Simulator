import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { adminRequest } from '../shared/api/httpClient';
import { useDialog } from '../shared/ui/DialogContext';

type GiftCodeDto = {
  id: string;
  code: string;
  title: string;
  description: string;
  rewardCash: { amount: number; currency: 'VND' };
  maxUses: number | null;
  usesPerAccount: number;
  usedCount: number;
  remainingUses: number | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RedemptionDto = {
  id: string;
  giftCodeId: string;
  code: string;
  title: string;
  userId: string;
  characterId: string;
  characterName?: string | null;
  accountEmail?: string | null;
  accountUsername?: string | null;
  amount: { amount: number; currency: 'VND' };
  redeemedAt: string;
};

type FormState = {
  code: string;
  title: string;
  description: string;
  rewardCashMinor: string;
  maxUses: string;
  usesPerAccount: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  code: '',
  title: '',
  description: '',
  rewardCashMinor: '1000000',
  maxUses: '',
  usesPerAccount: '1',
  isActive: true,
};

function fmtMoney(amount: number) {
  return `${(amount ?? 0).toLocaleString('vi-VN')} ₫`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

export function GiftCodesPage() {
  const { confirm } = useDialog();
  const [editing, setEditing] = useState<GiftCodeDto | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [openRedeemsFor, setOpenRedeemsFor] = useState<string | null>(null);

  const { data: codes = [], isLoading, error, refetch } = useQuery<GiftCodeDto[]>({
    queryKey: ['admin', 'gift-codes'],
    queryFn: () => adminRequest<GiftCodeDto[]>('/api/v1/admin/gift-codes'),
  });

  const { data: redemptions = [], isLoading: redeemLoading } = useQuery<RedemptionDto[]>({
    queryKey: ['admin', 'gift-codes', openRedeemsFor, 'redemptions'],
    queryFn: () => adminRequest<RedemptionDto[]>(`/api/v1/admin/gift-codes/${openRedeemsFor}/redemptions`),
    enabled: !!openRedeemsFor,
  });

  const activeCount = useMemo(() => codes.filter((c) => c.isActive).length, [codes]);

  function toast(type: 'ok' | 'err', text: string) {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 3500);
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
  }
  function startEdit(c: GiftCodeDto) {
    setEditing(c);
    setForm({
      code: c.code,
      title: c.title,
      description: c.description ?? '',
      rewardCashMinor: String(c.rewardCash?.amount ?? 0),
      maxUses: c.maxUses == null ? '' : String(c.maxUses),
      usesPerAccount: String(c.usesPerAccount ?? 1),
      isActive: !!c.isActive,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    try {
      const body = {
        code: form.code.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        rewardCashMinor: Math.max(0, Math.round(Number(form.rewardCashMinor || 0))),
        maxUses: form.maxUses.trim() === '' ? null : Math.max(1, Math.round(Number(form.maxUses))),
        usesPerAccount: Math.max(1, Math.round(Number(form.usesPerAccount || 1))),
        isActive: form.isActive,
      };
      if (!body.code || body.code.length < 3) throw new Error('Mã code phải có ít nhất 3 ký tự.');
      if (!body.title) throw new Error('Tiêu đề là bắt buộc.');
      if (editing) {
        await adminRequest(`/api/v1/admin/gift-codes/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('ok', 'Đã cập nhật mã quà tặng.');
      } else {
        await adminRequest('/api/v1/admin/gift-codes', { method: 'POST', body: JSON.stringify(body) });
        toast('ok', 'Đã tạo mã quà tặng mới.');
      }
      startCreate();
      await refetch();
    } catch (err: any) {
      toast('err', err?.problem?.detail || err?.message || 'Không thể lưu mã quà tặng.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(c: GiftCodeDto) {
    setBusy(`toggle-${c.id}`);
    try {
      await adminRequest(`/api/v1/admin/gift-codes/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: c.code,
          title: c.title,
          description: c.description ?? '',
          rewardCashMinor: c.rewardCash?.amount ?? 0,
          maxUses: c.maxUses,
          usesPerAccount: c.usesPerAccount ?? 1,
          isActive: !c.isActive,
        }),
      });
      await refetch();
    } catch (err: any) {
      toast('err', err?.problem?.detail || err?.message || 'Không thể cập nhật trạng thái.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({
      title: 'Xóa mã quà tặng này?',
      type: 'danger',
      confirmText: 'Xóa',
      message: 'Các bản ghi đã sử dụng của mã này cũng sẽ bị xóa theo.',
    }))) return;
    setBusy(`del-${id}`);
    try {
      await adminRequest(`/api/v1/admin/gift-codes/${id}`, { method: 'DELETE' });
      if (openRedeemsFor === id) setOpenRedeemsFor(null);
      await refetch();
      toast('ok', 'Đã xóa mã quà tặng.');
    } catch (err: any) {
      toast('err', err?.problem?.detail || err?.message || 'Không thể xóa.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mã quà tặng"
      />

      {notice && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700' : 'border-rose-200 bg-rose-50/70 text-rose-700'}`}>
          {notice.type === 'ok' ? '✓ ' : '⚠ '}{notice.text}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-semibold text-rose-700">⚠ {(error as any)?.message || 'Lỗi tải dữ liệu'}</div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-4 rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600">{editing ? 'Cập nhật mã quà tặng' : 'Tạo mã quà tặng mới'}</h2>
            {editing && <button type="button" onClick={startCreate} className="text-[11px] text-slate-600 hover:text-slate-900">+ Tạo mới</button>}
          </div>
          <form onSubmit={save} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Mã code *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono" placeholder="VD: WELCOME2026" required />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Tiêu đề *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2" placeholder="Quà tân thủ" required />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">Mô tả</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2" placeholder="Mô tả ngắn..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Thưởng tiền (₫)</label>
                <input type="number" min={0} step={1000} value={form.rewardCashMinor} onChange={(e) => setForm({ ...form, rewardCashMinor: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2" />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Tổng lượt dùng</label>
                <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2" placeholder="Trống = vô hạn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Lượt / tài khoản</label>
                <input type="number" min={1} value={form.usesPerAccount} onChange={(e) => setForm({ ...form, usesPerAccount: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2" />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
                  Đang kích hoạt
                </label>
              </div>
            </div>
            <button type="submit" disabled={busy === 'save'} className="w-full rounded-xl bg-amber-500 py-2.5 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {busy === 'save' ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo mã quà tặng'}
            </button>
          </form>
        </div>

        <div className="xl:col-span-8 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-600">Danh sách mã ({codes.length}) · Đang bật: {activeCount}</h2>
              <button type="button" onClick={() => refetch()} className="text-[11px] text-slate-600 hover:text-slate-900">Tải lại</button>
            </div>
            {isLoading ? (
              <div className="text-sm text-slate-600">Đang tải...</div>
            ) : codes.length === 0 ? (
              <div className="text-sm text-slate-500">Chưa có mã quà tặng nào.</div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[60vh] [-webkit-overflow-scrolling:touch]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-2">Code</th>
                      <th className="py-2 pr-2">Tiêu đề / Thưởng</th>
                      <th className="py-2 pr-2">Lượt dùng</th>
                      <th className="py-2 pr-2">Trạng thái</th>
                      <th className="py-2 pr-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c) => (
                      <>
                        <tr key={c.id} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-2 font-mono font-semibold text-slate-900">{c.code}</td>
                          <td className="py-2 pr-2">
                            <div className="font-medium text-slate-900">{c.title}</div>
                            <div className="text-slate-600">{fmtMoney(c.rewardCash.amount)} · {c.usesPerAccount}/tài khoản</div>
                            {c.description && <div className="text-slate-500 truncate max-w-[260px]">{c.description}</div>}
                          </td>
                          <td className="py-2 pr-2 text-slate-700">
                            {c.usedCount}{c.maxUses == null ? ' / ∞' : ` / ${c.maxUses}`}
                            {c.remainingUses != null && <div className="text-[10px] text-slate-500">Còn {c.remainingUses}</div>}
                          </td>
                          <td className="py-2 pr-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${c.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {c.isActive ? 'Bật' : 'Tắt'}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">Cập nhật {fmtDate(c.updatedAt)}</div>
                          </td>
                          <td className="py-2 pr-2 space-x-1 whitespace-nowrap">
                            <button type="button" onClick={() => setOpenRedeemsFor(openRedeemsFor === c.id ? null : c.id)} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50">Đã dùng ({c.usedCount})</button>
                            <button type="button" onClick={() => startEdit(c)} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50">Sửa</button>
                            <button type="button" disabled={busy === `toggle-${c.id}`} onClick={() => toggleActive(c)} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50">{c.isActive ? 'Tắt' : 'Bật'}</button>
                            <button type="button" disabled={busy === `del-${c.id}`} onClick={() => remove(c.id)} className="rounded-lg border border-rose-200 text-rose-600 px-2 py-1 hover:bg-rose-50">Xóa</button>
                          </td>
                        </tr>
                        {openRedeemsFor === c.id && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={5} className="p-3">
                              <div className="text-xs font-semibold text-slate-800 mb-2">Tài khoản đã sử dụng mã <span className="font-mono">{c.code}</span></div>
                              {redeemLoading ? (
                                <div className="text-slate-600">Đang tải...</div>
                              ) : redemptions.length === 0 ? (
                                <div className="text-slate-500">Chưa có tài khoản nào sử dụng mã này.</div>
                              ) : (
                                <div className="overflow-x-auto overflow-y-auto max-h-60 [-webkit-overflow-scrolling:touch]">
                                  <table className="w-full text-[11px]">
                                    <thead className="sticky top-0 z-10 bg-slate-50">
                                      <tr className="text-left text-slate-500">
                                        <th className="py-1 pr-2">Tài khoản</th>
                                        <th className="py-1 pr-2">Nhân vật</th>
                                        <th className="py-1 pr-2">Nhận</th>
                                        <th className="py-1 pr-2">Thời gian</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {redemptions.map((r) => (
                                        <tr key={r.id} className="border-t border-slate-200">
                                          <td className="py-1 pr-2">
                                            <div className="font-medium text-slate-800">{r.accountUsername || '—'}</div>
                                            <div className="text-slate-500">{r.accountEmail || r.userId}</div>
                                          </td>
                                          <td className="py-1 pr-2 text-slate-700">{r.characterName || r.characterId}</td>
                                          <td className="py-1 pr-2 text-emerald-700 font-semibold">{fmtMoney(r.amount.amount)}</td>
                                          <td className="py-1 pr-2 text-slate-600">{fmtDate(r.redeemedAt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
